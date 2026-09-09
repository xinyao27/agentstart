mod editor;

use std::collections::{HashMap, HashSet};
use std::sync::atomic::{AtomicBool, Ordering};
use std::time::{Duration, Instant, SystemTime, UNIX_EPOCH};

use serde_json::{Map, Value, json};

use crate::terminal_session::{TerminalCreateRequest, TerminalPresentation};

use super::authority::{CreateResults, SessionTabsAuthority, SessionTabsError, lock};
use super::model::{SessionTabCreate, SessionTabMove};
use super::subscription::SessionTabsScope;

const CREATE_RESULT_CAPACITY: usize = 256;
const CREATE_RESULT_TTL: Duration = Duration::from_secs(60);
const RENDERER_SURFACE_TIMEOUT: Duration = Duration::from_secs(10);

#[derive(Clone)]
struct ResolvedTab {
    id: String,
    kind: String,
    leaf_id: Option<String>,
    parent_id: String,
}

impl SessionTabsAuthority {
    pub(crate) async fn activate(
        &self,
        selector: &str,
        tab_id: &str,
        leaf_id: Option<&str>,
        notify_clients: bool,
    ) -> Result<Value, SessionTabsError> {
        let scope = self.resolve_scope(selector).await?;
        let (host_id, worktree) = worktree_scope(&scope)?;
        let snapshot = self.snapshot_for_scope(&scope).await?;
        let tab = resolve_tab(&snapshot, tab_id, leaf_id).ok_or(SessionTabsError::TabNotFound)?;
        let parent_id = tab.parent_id.clone();
        let kind = tab.kind.clone();
        let leaf_id = tab.leaf_id.clone();
        let worktree_for_mutation = worktree.clone();
        self.inner
            .workspace_session
            .mutate(host_id.as_deref(), move |session| {
                let changed = activate_persisted(
                    session,
                    &worktree_for_mutation,
                    &parent_id,
                    &kind,
                    leaf_id.as_deref(),
                );
                ((), changed)
            })
            .await?;
        self.inner.workspace_session.flush().await?;
        self.reconcile_headless_now().await?;
        if notify_clients {
            let command = if tab.kind == "terminal" {
                json!({"type":"focusTerminal","tabId":tab.parent_id,"worktreeId":worktree,"leafId":tab.leaf_id})
            } else {
                json!({"type":"focusEditorTab","tabId":tab.id,"worktreeId":worktree})
            };
            self.inner.shells.dispatch_ui("/ui/command", command).await;
        }
        self.snapshot_for_scope(&scope).await
    }

    pub(crate) async fn close_tab(
        &self,
        selector: &str,
        tab_id: &str,
    ) -> Result<(), SessionTabsError> {
        let scope = self.resolve_scope(selector).await?;
        let (host_id, worktree) = worktree_scope(&scope)?;
        let snapshot = self.snapshot_for_scope(&scope).await?;
        let tab = resolve_tab(&snapshot, tab_id, None).ok_or(SessionTabsError::TabNotFound)?;
        if tab.kind != "terminal" {
            let source = snapshot
                .get("tabs")
                .and_then(Value::as_array)
                .and_then(|tabs| {
                    tabs.iter().find(|source| {
                        source.get("id").and_then(Value::as_str) == Some(tab.id.as_str())
                    })
                })
                .ok_or(SessionTabsError::TabNotFound)?;
            return self
                .close_document_tab(host_id.as_deref(), &worktree, source)
                .await;
        }
        let parent_id = tab.parent_id.clone();
        let worktree_for_mutation = worktree.clone();
        let close = self
            .inner
            .workspace_session
            .mutate(host_id.as_deref(), move |session| {
                close_persisted_terminal(session, &worktree_for_mutation, &parent_id)
            })
            .await??;
        for pty_id in close {
            if let Some(handle) = self.inner.terminals.handle_for_pty(&pty_id) {
                let _ = self.inner.terminals.close(&handle).await?;
            }
        }
        self.inner.workspace_session.flush().await?;
        self.inner.terminals.prune_disconnected();
        self.inner.workspace_session.flush().await?;
        self.reconcile_headless_now().await?;
        Ok(())
    }

    pub(crate) async fn create_terminal(
        &self,
        selector: &str,
        mut request: SessionTabCreate,
        is_active: &AtomicBool,
    ) -> Result<Value, SessionTabsError> {
        let scope = self.resolve_scope(selector).await?;
        let (host_id, worktree) = worktree_scope(&scope)?;
        let mutation_key = request.client_mutation_id.as_ref().map(|mutation_id| {
            format!(
                "{}\0{}\0{mutation_id}",
                host_id.as_deref().unwrap_or("local"),
                worktree
            )
        });
        let _create = self.inner.create_gate.lock().await;
        if let Some(cached) = mutation_key
            .as_ref()
            .and_then(|key| cached_create_result(&mut lock(&self.inner.create_results), key))
        {
            return Ok(cached);
        }
        if !is_active.load(Ordering::Acquire) {
            return Err(SessionTabsError::ClientDisconnected);
        }
        let before = self.snapshot_for_scope(&scope).await?;
        let after_parent_id = request
            .after_tab_id
            .as_ref()
            .map(|after| {
                resolve_exact_tab(&before, after)
                    .map(|tab| tab.parent_id)
                    .ok_or(SessionTabsError::AfterTabNotFound)
            })
            .transpose()?;
        if request
            .target_group_id
            .as_ref()
            .is_some_and(|target| !has_group(&before, target))
        {
            return Err(SessionTabsError::TargetGroupNotFound);
        }
        let renderer_backed = false;
        let mut command = request.command;
        let mut environment = request.env;
        let mut launch_agent = request.launch_agent;
        if let Some(agent) = request.agent {
            let startup = self
                .inner
                .terminals
                .agent_startup(selector, &agent, request.agent_prompt.as_deref())
                .await?;
            command = Some(startup.command);
            environment.extend(startup.environment);
            request.launch_config = Some(startup.launch_config);
            request.startup_command_delivery = startup.startup_command_delivery;
            launch_agent = Some(agent);
        }
        let created = self
            .inner
            .terminals
            .create(TerminalCreateRequest {
                activate: request.activate,
                cols: 120,
                command,
                cwd: request.cwd,
                cwd_fallback: false,
                env: environment,
                env_to_delete: request.env_to_delete,
                focus: false,
                launch_agent,
                launch_config: request.launch_config,
                launch_token: request.launch_token,
                leaf_id: None,
                presentation: Some(TerminalPresentation::Background),
                renderer_backed,
                rows: 40,
                split_direction: None,
                split_from_leaf_id: None,
                split_telemetry_source: None,
                startup_command_delivery: request.startup_command_delivery,
                tab_id: None,
                title: None,
                worktree: Some(format!("id:{worktree}")),
            })
            .await?;
        self.place_created_terminal(
            host_id.as_deref(),
            &worktree,
            &created.tab_id,
            after_parent_id.as_deref(),
            request.target_group_id.as_deref(),
        )
        .await?;
        self.inner.workspace_session.flush().await?;
        self.reconcile_headless_now().await?;
        let output = self
            .wait_for_created_surface(&scope, &created.pty_id, is_active)
            .await;
        let output = output?;
        if let Some(key) = mutation_key {
            cache_create_result(&mut lock(&self.inner.create_results), key, output.clone());
        }
        Ok(output)
    }

    pub(crate) async fn move_tab(
        &self,
        selector: &str,
        tab_id: &str,
        target_group_id: &str,
        kind: SessionTabMove,
    ) -> Result<(), SessionTabsError> {
        let scope = self.resolve_scope(selector).await?;
        let (host_id, worktree) = worktree_scope(&scope)?;
        let snapshot = self.snapshot_for_scope(&scope).await?;
        let tab = resolve_tab(&snapshot, tab_id, None).ok_or(SessionTabsError::TabNotFound)?;
        if !has_group(&snapshot, target_group_id) {
            return Err(SessionTabsError::TargetGroupNotFound);
        }
        let worktree_for_mutation = worktree.clone();
        let target = target_group_id.to_owned();
        let parent = tab.parent_id;
        let browser_tabs = snapshot
            .get("tabs")
            .and_then(Value::as_array)
            .into_iter()
            .flatten()
            .filter(|tab| tab.get("type").and_then(Value::as_str) == Some("browser"))
            .cloned()
            .collect::<Vec<_>>();
        self.inner
            .workspace_session
            .mutate(host_id.as_deref(), move |session| {
                let mut current = super::headless_projection::headless_snapshot(
                    session,
                    None,
                    &worktree_for_mutation,
                    0,
                    &[],
                )
                .value;
                super::headless_projection::browser::append_metadata(
                    session,
                    &worktree_for_mutation,
                    &mut current,
                );
                // Why: Chrome can publish a live page before its durable metadata write reaches the daemon.
                if let Some(tabs) = current.get_mut("tabs").and_then(Value::as_array_mut) {
                    for browser in &browser_tabs {
                        if !tabs.iter().any(|tab| tab.get("id") == browser.get("id")) {
                            tabs.push(browser.clone());
                        }
                    }
                }
                super::headless_projection::presentation::apply(
                    session,
                    &worktree_for_mutation,
                    &mut current,
                );
                let Some(tab) = resolve_tab(&current, &parent, None) else {
                    return (Err(SessionTabsError::TabNotFound), false);
                };
                if !has_group(&current, &target) {
                    return (Err(SessionTabsError::TargetGroupNotFound), false);
                }
                let kind = match normalize_move(&current, &tab.parent_id, &target, kind) {
                    Ok(kind) => kind,
                    Err(error) => return (Err(error), false),
                };
                let groups = current
                    .get("tabGroups")
                    .and_then(Value::as_array)
                    .cloned()
                    .unwrap_or_default();
                let layout = current.get("tabGroupLayout").cloned();
                move_persisted(
                    session,
                    &worktree_for_mutation,
                    &parent,
                    &target,
                    &kind,
                    groups,
                    layout,
                )
            })
            .await??;
        self.inner.workspace_session.flush().await?;
        self.reconcile_headless_now().await?;
        Ok(())
    }

    pub(crate) async fn update_pane_layout(
        &self,
        selector: &str,
        tab_id: &str,
        root: Option<Value>,
        expanded_leaf_id: Option<String>,
        titles_by_leaf_id: Option<Map<String, Value>>,
    ) -> Result<(), SessionTabsError> {
        let scope = self.resolve_scope(selector).await?;
        let (host_id, worktree) = worktree_scope(&scope)?;
        let snapshot = self.snapshot_for_scope(&scope).await?;
        let tab = resolve_tab(&snapshot, tab_id, None).ok_or(SessionTabsError::TabNotFound)?;
        if tab.kind != "terminal" {
            return Err(SessionTabsError::TabNotFound);
        }
        let parent = tab.parent_id;
        self.inner
            .workspace_session
            .mutate(host_id.as_deref(), move |session| {
                let changed = update_persisted_layout(
                    session,
                    &parent,
                    root,
                    expanded_leaf_id,
                    titles_by_leaf_id,
                );
                ((), changed)
            })
            .await?;
        self.reconcile_headless_now().await?;
        let _ = worktree;
        Ok(())
    }

    pub(crate) async fn set_tab_props(
        &self,
        selector: &str,
        tab_id: &str,
        color: Option<Option<String>>,
        is_pinned: Option<bool>,
    ) -> Result<(), SessionTabsError> {
        let scope = self.resolve_scope(selector).await?;
        let (host_id, worktree) = worktree_scope(&scope)?;
        let snapshot = self.snapshot_for_scope(&scope).await?;
        let tab = resolve_tab(&snapshot, tab_id, None).ok_or(SessionTabsError::TabNotFound)?;
        let parent = tab.parent_id;
        self.inner
            .workspace_session
            .mutate(host_id.as_deref(), move |session| {
                let changed = set_persisted_props(session, &worktree, &parent, color, is_pinned);
                ((), changed)
            })
            .await?;
        self.inner.workspace_session.flush().await?;
        self.reconcile_headless_now().await?;
        Ok(())
    }

    async fn place_created_terminal(
        &self,
        host_id: Option<&str>,
        worktree: &str,
        tab_id: &str,
        after_tab_id: Option<&str>,
        target_group_id: Option<&str>,
    ) -> Result<(), SessionTabsError> {
        if after_tab_id.is_none() && target_group_id.is_none() {
            return Ok(());
        }
        let worktree = worktree.to_owned();
        let tab_id = tab_id.to_owned();
        let after_tab_id = after_tab_id.map(str::to_owned);
        let target_group_id = target_group_id.map(str::to_owned);
        self.inner
            .workspace_session
            .mutate(host_id, move |session| {
                let changed = place_persisted_terminal(
                    session,
                    &worktree,
                    &tab_id,
                    after_tab_id.as_deref(),
                    target_group_id.as_deref(),
                );
                ((), changed)
            })
            .await?;
        Ok(())
    }

    async fn wait_for_created_surface(
        &self,
        scope: &SessionTabsScope,
        pty_id: &str,
        is_active: &AtomicBool,
    ) -> Result<Value, SessionTabsError> {
        let deadline = tokio::time::Instant::now() + RENDERER_SURFACE_TIMEOUT;
        loop {
            let snapshot = self.snapshot_for_scope(scope).await?;
            if let Some(tab) = snapshot
                .get("tabs")
                .and_then(Value::as_array)
                .into_iter()
                .flatten()
                .find(|tab| tab.get("ptyId").and_then(Value::as_str) == Some(pty_id))
                .cloned()
            {
                return Ok(json!({
                    "tab": tab,
                    "publicationEpoch": snapshot.get("publicationEpoch").cloned().unwrap_or(Value::String("none".to_owned())),
                    "snapshotVersion": snapshot.get("snapshotVersion").cloned().unwrap_or(Value::from(0))
                }));
            }
            if !is_active.load(Ordering::Acquire) {
                return Err(SessionTabsError::ClientDisconnected);
            }
            if tokio::time::Instant::now() >= deadline {
                return Err(SessionTabsError::RendererUnavailable);
            }
            tokio::time::sleep(Duration::from_millis(10)).await;
        }
    }
}

fn worktree_scope(scope: &SessionTabsScope) -> Result<(Option<String>, String), SessionTabsError> {
    let SessionTabsScope::Worktree { host_id, worktree } = scope else {
        return Err(SessionTabsError::HostProvenance);
    };
    Ok((host_id.clone(), worktree.clone()))
}

fn resolve_tab(snapshot: &Value, tab_id: &str, leaf_id: Option<&str>) -> Option<ResolvedTab> {
    let tabs = snapshot.get("tabs")?.as_array()?;
    let direct = tabs.iter().find(|tab| {
        tab.get("id").and_then(Value::as_str) == Some(tab_id)
            && leaf_id.is_none_or(|leaf| tab.get("leafId").and_then(Value::as_str) == Some(leaf))
    });
    let candidate = direct.or_else(|| {
        tabs.iter().find(|tab| {
            tab.get("type").and_then(Value::as_str) == Some("terminal")
                && tab.get("parentTabId").and_then(Value::as_str) == Some(tab_id)
                && leaf_id
                    .is_none_or(|leaf| tab.get("leafId").and_then(Value::as_str) == Some(leaf))
        })
    })?;
    let kind = candidate.get("type")?.as_str()?.to_owned();
    let id = candidate.get("id")?.as_str()?.to_owned();
    let parent_id = if kind == "terminal" {
        candidate.get("parentTabId")?.as_str()?.to_owned()
    } else {
        id.clone()
    };
    Some(ResolvedTab {
        id,
        kind,
        leaf_id: candidate
            .get("leafId")
            .and_then(Value::as_str)
            .map(str::to_owned),
        parent_id,
    })
}

fn resolve_exact_tab(snapshot: &Value, tab_id: &str) -> Option<ResolvedTab> {
    let candidate = snapshot
        .get("tabs")?
        .as_array()?
        .iter()
        .find(|tab| tab.get("id").and_then(Value::as_str) == Some(tab_id))?;
    let kind = candidate.get("type")?.as_str()?.to_owned();
    let id = candidate.get("id")?.as_str()?.to_owned();
    let parent_id = if kind == "terminal" {
        candidate.get("parentTabId")?.as_str()?.to_owned()
    } else {
        id.clone()
    };
    Some(ResolvedTab {
        id,
        kind,
        leaf_id: candidate
            .get("leafId")
            .and_then(Value::as_str)
            .map(str::to_owned),
        parent_id,
    })
}

fn has_group(snapshot: &Value, group_id: &str) -> bool {
    snapshot
        .get("tabGroups")
        .and_then(Value::as_array)
        .is_some_and(|groups| {
            groups
                .iter()
                .any(|group| group.get("id").and_then(Value::as_str) == Some(group_id))
        })
}

fn activate_persisted(
    session: &mut Value,
    worktree: &str,
    tab_id: &str,
    kind: &str,
    leaf_id: Option<&str>,
) -> bool {
    let Some(session) = session.as_object_mut() else {
        return false;
    };
    session.insert(
        "activeWorktreeId".to_owned(),
        Value::String(worktree.to_owned()),
    );
    let unified = session
        .get("unifiedTabs")
        .and_then(|map| map.get(worktree))
        .and_then(Value::as_array)
        .into_iter()
        .flatten()
        .find(|tab| {
            tab.get("id").and_then(Value::as_str) == Some(tab_id)
                || (kind == "terminal"
                    && tab.get("entityId").and_then(Value::as_str) == Some(tab_id))
        })
        .cloned();
    let unified_id = unified
        .as_ref()
        .and_then(|tab| tab.get("id"))
        .and_then(Value::as_str)
        .unwrap_or(tab_id)
        .to_owned();
    let entity_id = unified
        .as_ref()
        .and_then(|tab| tab.get("entityId"))
        .and_then(Value::as_str)
        .unwrap_or(tab_id)
        .to_owned();
    let active_type = if kind == "terminal" {
        "terminal"
    } else if kind == "browser" {
        "browser"
    } else {
        "editor"
    };
    object_field(session, "activeTabTypeByWorktree")
        .insert(worktree.to_owned(), Value::String(active_type.to_owned()));
    let active_field = if kind == "terminal" {
        "activeTabIdByWorktree"
    } else if kind == "browser" {
        "activeBrowserTabIdByWorktree"
    } else {
        "activeFileIdByWorktree"
    };
    object_field(session, active_field).insert(worktree.to_owned(), Value::String(entity_id));
    let mut active_group = None;
    for group in groups_mut(session, worktree) {
        if group
            .get("tabOrder")
            .and_then(Value::as_array)
            .is_some_and(|order| {
                order.iter().any(|id| {
                    id.as_str() == Some(unified_id.as_str()) || id.as_str() == Some(tab_id)
                })
            })
        {
            group["activeTabId"] = Value::String(unified_id.clone());
            active_group = group.get("id").cloned();
        }
    }
    if let Some(group) = active_group {
        object_field(session, "activeGroupIdByWorktree").insert(worktree.to_owned(), group);
    }
    if kind == "terminal" {
        session.insert("activeTabId".to_owned(), Value::String(tab_id.to_owned()));
    }
    if let Some(leaf_id) = leaf_id
        && let Some(layout) = object_field(session, "terminalLayoutsByTabId")
            .get_mut(tab_id)
            .and_then(Value::as_object_mut)
    {
        layout.insert("activeLeafId".to_owned(), Value::String(leaf_id.to_owned()));
    }
    true
}

fn close_persisted_terminal(
    session: &mut Value,
    worktree: &str,
    tab_id: &str,
) -> (Result<Vec<String>, SessionTabsError>, bool) {
    let Some(session) = session.as_object_mut() else {
        return (Err(SessionTabsError::TabNotFound), false);
    };
    let terminal_row = session
        .get("tabsByWorktree")
        .and_then(Value::as_object)
        .and_then(|by_worktree| by_worktree.get(worktree))
        .and_then(Value::as_array)
        .and_then(|tabs| {
            tabs.iter()
                .find(|tab| tab.get("id").and_then(Value::as_str) == Some(tab_id))
        });
    let unified_terminal_ids = session
        .get("unifiedTabs")
        .and_then(Value::as_object)
        .and_then(|by_worktree| by_worktree.get(worktree))
        .and_then(Value::as_array)
        .into_iter()
        .flatten()
        .filter(|tab| {
            tab.get("contentType").and_then(Value::as_str) == Some("terminal")
                && (tab.get("id").and_then(Value::as_str) == Some(tab_id)
                    || tab.get("entityId").and_then(Value::as_str) == Some(tab_id))
        })
        .filter_map(|tab| tab.get("id").and_then(Value::as_str).map(str::to_owned))
        .collect::<HashSet<_>>();
    if terminal_row.is_none() && unified_terminal_ids.is_empty() {
        return (Err(SessionTabsError::TabNotFound), false);
    }
    let unified_is_pinned = session
        .get("unifiedTabs")
        .and_then(Value::as_object)
        .and_then(|by_worktree| by_worktree.get(worktree))
        .and_then(Value::as_array)
        .into_iter()
        .flatten()
        .any(|tab| {
            unified_terminal_ids.contains(tab.get("id").and_then(Value::as_str).unwrap_or_default())
                && tab.get("isPinned").and_then(Value::as_bool) == Some(true)
        });
    let pinned = terminal_row
        .is_some_and(|tab| tab.get("isPinned").and_then(Value::as_bool) == Some(true))
        || unified_is_pinned;
    if pinned {
        return (Err(SessionTabsError::TerminalTabPinned), false);
    }
    let mut pty_ids = HashSet::new();
    if let Some(layout) = session
        .get("terminalLayoutsByTabId")
        .and_then(Value::as_object)
        .and_then(|layouts| layouts.get(tab_id))
        .and_then(Value::as_object)
        && let Some(bindings) = layout.get("ptyIdsByLeafId").and_then(Value::as_object)
    {
        pty_ids.extend(
            bindings
                .values()
                .filter_map(Value::as_str)
                .map(str::to_owned),
        );
    }
    if let Some(pty_id) = terminal_row
        .and_then(|tab| tab.get("ptyId"))
        .and_then(Value::as_str)
    {
        pty_ids.insert(pty_id.to_owned());
    }
    if let Some(pty_id) = session
        .get("remoteSessionIdsByTabId")
        .and_then(Value::as_object)
        .and_then(|ids| ids.get(tab_id))
        .and_then(Value::as_str)
    {
        pty_ids.insert(pty_id.to_owned());
    }
    let mut other_pty_ids = HashSet::new();
    if let Some(tabs_by_worktree) = session.get("tabsByWorktree").and_then(Value::as_object) {
        for tab in tabs_by_worktree
            .values()
            .filter_map(Value::as_array)
            .flatten()
            .filter(|tab| tab.get("id").and_then(Value::as_str) != Some(tab_id))
        {
            if let Some(pty_id) = tab.get("ptyId").and_then(Value::as_str) {
                other_pty_ids.insert(pty_id.to_owned());
            }
            if let Some(other_tab_id) = tab.get("id").and_then(Value::as_str) {
                collect_layout_pty_ids(session, other_tab_id, &mut other_pty_ids);
                if let Some(pty_id) = session
                    .get("remoteSessionIdsByTabId")
                    .and_then(Value::as_object)
                    .and_then(|ids| ids.get(other_tab_id))
                    .and_then(Value::as_str)
                {
                    other_pty_ids.insert(pty_id.to_owned());
                }
            }
        }
    }
    pty_ids.retain(|pty_id| !other_pty_ids.contains(pty_id));
    if let Some(tabs) = session
        .get_mut("tabsByWorktree")
        .and_then(Value::as_object_mut)
        .and_then(|by_worktree| by_worktree.get_mut(worktree))
        .and_then(Value::as_array_mut)
    {
        tabs.retain(|tab| {
            let keep = tab.get("id").and_then(Value::as_str) != Some(tab_id);
            if !keep && let Some(pty_id) = tab.get("ptyId").and_then(Value::as_str) {
                pty_ids.insert(pty_id.to_owned());
            }
            keep
        });
    }
    if let Some(tabs) = session
        .get_mut("unifiedTabs")
        .and_then(Value::as_object_mut)
        .and_then(|by_worktree| by_worktree.get_mut(worktree))
        .and_then(Value::as_array_mut)
    {
        tabs.retain(|tab| {
            !unified_terminal_ids
                .contains(tab.get("id").and_then(Value::as_str).unwrap_or_default())
        });
    }
    for field in ["terminalLayoutsByTabId", "remoteSessionIdsByTabId"] {
        object_field(session, field).remove(tab_id);
    }
    let mut closed_ids = unified_terminal_ids;
    closed_ids.insert(tab_id.to_owned());
    prune_groups(session, worktree, &closed_ids);
    prune_group_layout(session, worktree);
    if let Some(sleeping) = session
        .get_mut("sleepingAgentSessionsByPaneKey")
        .and_then(Value::as_object_mut)
    {
        sleeping.retain(|pane_key, record| {
            !pane_key.starts_with(&format!("{tab_id}:"))
                && record.get("tabId").and_then(Value::as_str) != Some(tab_id)
        });
    }
    select_after_close(session, worktree);
    (Ok(pty_ids.into_iter().collect()), true)
}

fn collect_layout_pty_ids(
    session: &Map<String, Value>,
    tab_id: &str,
    output: &mut HashSet<String>,
) {
    if let Some(bindings) = session
        .get("terminalLayoutsByTabId")
        .and_then(Value::as_object)
        .and_then(|layouts| layouts.get(tab_id))
        .and_then(|layout| layout.get("ptyIdsByLeafId"))
        .and_then(Value::as_object)
    {
        output.extend(
            bindings
                .values()
                .filter_map(Value::as_str)
                .map(str::to_owned),
        );
    }
}

fn prune_groups(session: &mut Map<String, Value>, worktree: &str, closed_ids: &HashSet<String>) {
    let Some(groups) = session
        .get_mut("tabGroups")
        .and_then(Value::as_object_mut)
        .and_then(|groups| groups.get_mut(worktree))
        .and_then(Value::as_array_mut)
    else {
        return;
    };
    for group in groups.iter_mut() {
        let Some(group) = group.as_object_mut() else {
            continue;
        };
        let active_is_closed = group
            .get("activeTabId")
            .and_then(Value::as_str)
            .is_some_and(|id| closed_ids.contains(id));
        let next_active =
            if let Some(order) = group.get_mut("tabOrder").and_then(Value::as_array_mut) {
                order.retain(|id| id.as_str().is_none_or(|id| !closed_ids.contains(id)));
                active_is_closed.then(|| order.first().cloned().unwrap_or(Value::Null))
            } else {
                None
            };
        if let Some(next_active) = next_active {
            group.insert("activeTabId".to_owned(), next_active);
        }
        if let Some(recent) = group.get_mut("recentTabIds").and_then(Value::as_array_mut) {
            recent.retain(|id| id.as_str().is_none_or(|id| !closed_ids.contains(id)));
        }
    }
    groups.retain(|group| {
        group
            .get("tabOrder")
            .and_then(Value::as_array)
            .is_some_and(|order| !order.is_empty())
    });
}

fn prune_group_layout(session: &mut Map<String, Value>, worktree: &str) {
    let valid = session
        .get("tabGroups")
        .and_then(Value::as_object)
        .and_then(|groups| groups.get(worktree))
        .and_then(Value::as_array)
        .into_iter()
        .flatten()
        .filter_map(|group| group.get("id").and_then(Value::as_str).map(str::to_owned))
        .collect::<HashSet<_>>();
    let layouts = object_field(session, "tabGroupLayouts");
    let next = layouts
        .remove(worktree)
        .and_then(|layout| prune_layout_node(layout, &valid));
    if let Some(next) = next {
        layouts.insert(worktree.to_owned(), next);
    }
    let active_groups = object_field(session, "activeGroupIdByWorktree");
    let current = active_groups
        .get(worktree)
        .and_then(Value::as_str)
        .map(str::to_owned);
    if current.as_ref().is_none_or(|id| !valid.contains(id)) {
        if let Some(next) = valid.iter().next() {
            active_groups.insert(worktree.to_owned(), Value::String(next.clone()));
        } else {
            active_groups.remove(worktree);
        }
    }
}

fn prune_layout_node(node: Value, valid: &HashSet<String>) -> Option<Value> {
    let object = node.as_object()?;
    if object.get("type").and_then(Value::as_str) == Some("leaf") {
        return object
            .get("groupId")
            .and_then(Value::as_str)
            .is_some_and(|id| valid.contains(id))
            .then_some(node);
    }
    let first = object
        .get("first")
        .cloned()
        .and_then(|child| prune_layout_node(child, valid));
    let second = object
        .get("second")
        .cloned()
        .and_then(|child| prune_layout_node(child, valid));
    match (first, second) {
        (Some(first), Some(second)) => {
            let mut next = object.clone();
            next.insert("first".to_owned(), first);
            next.insert("second".to_owned(), second);
            Some(Value::Object(next))
        }
        (Some(child), None) | (None, Some(child)) => Some(child),
        (None, None) => None,
    }
}

fn select_after_close(session: &mut Map<String, Value>, worktree: &str) {
    let next = session
        .get("tabsByWorktree")
        .and_then(Value::as_object)
        .and_then(|by_worktree| by_worktree.get(worktree))
        .and_then(Value::as_array)
        .and_then(|tabs| tabs.first())
        .and_then(|tab| tab.get("id"))
        .cloned()
        .unwrap_or(Value::Null);
    object_field(session, "activeTabIdByWorktree").insert(worktree.to_owned(), next.clone());
    if session.get("activeWorktreeId").and_then(Value::as_str) == Some(worktree) {
        session.insert("activeTabId".to_owned(), next);
    }
}

fn set_persisted_props(
    session: &mut Value,
    worktree: &str,
    tab_id: &str,
    color: Option<Option<String>>,
    is_pinned: Option<bool>,
) -> bool {
    let Some(session) = session.as_object_mut() else {
        return false;
    };
    let mut changed = false;
    for field in ["tabsByWorktree", "unifiedTabs"] {
        if let Some(tabs) = session
            .get_mut(field)
            .and_then(Value::as_object_mut)
            .and_then(|by_worktree| by_worktree.get_mut(worktree))
            .and_then(Value::as_array_mut)
        {
            for tab in tabs {
                let matches = tab.get("id").and_then(Value::as_str) == Some(tab_id)
                    || tab.get("entityId").and_then(Value::as_str) == Some(tab_id);
                let Some(tab) = matches.then(|| tab.as_object_mut()).flatten() else {
                    continue;
                };
                if let Some(color) = &color {
                    tab.insert(
                        "color".to_owned(),
                        color.clone().map_or(Value::Null, Value::String),
                    );
                }
                if let Some(is_pinned) = is_pinned {
                    tab.insert("isPinned".to_owned(), Value::Bool(is_pinned));
                }
                changed = true;
            }
        }
    }
    changed
}

fn update_persisted_layout(
    session: &mut Value,
    tab_id: &str,
    root: Option<Value>,
    expanded_leaf_id: Option<String>,
    titles_by_leaf_id: Option<Map<String, Value>>,
) -> bool {
    let Some(layout) = session
        .as_object_mut()
        .and_then(|session| session.get_mut("terminalLayoutsByTabId"))
        .and_then(Value::as_object_mut)
        .and_then(|layouts| layouts.get_mut(tab_id))
        .and_then(Value::as_object_mut)
    else {
        return false;
    };
    if let Some(root) = root {
        layout.insert("root".to_owned(), root);
    }
    layout.insert(
        "expandedLeafId".to_owned(),
        expanded_leaf_id.map_or(Value::Null, Value::String),
    );
    if let Some(titles) = titles_by_leaf_id {
        layout.insert("titlesByLeafId".to_owned(), Value::Object(titles));
    }
    true
}

fn normalize_move(
    snapshot: &Value,
    tab_id: &str,
    target_group_id: &str,
    kind: SessionTabMove,
) -> Result<SessionTabMove, SessionTabsError> {
    let SessionTabMove::Reorder { tab_order } = kind else {
        return Ok(kind);
    };
    let mut normalized = Vec::new();
    let mut seen = HashSet::new();
    for id in tab_order {
        let resolved = resolve_tab(snapshot, &id, None)
            .map(|tab| tab.parent_id)
            .ok_or(SessionTabsError::InvalidTabOrder)?;
        if !seen.insert(resolved.clone()) {
            return Err(SessionTabsError::DuplicateTabOrder);
        }
        normalized.push(resolved);
    }
    let expected = snapshot
        .get("tabGroups")
        .and_then(Value::as_array)
        .into_iter()
        .flatten()
        .find(|group| group.get("id").and_then(Value::as_str) == Some(target_group_id))
        .and_then(|group| group.get("tabOrder"))
        .and_then(Value::as_array)
        .into_iter()
        .flatten()
        .filter_map(Value::as_str)
        .collect::<HashSet<_>>();
    if normalized.len() != expected.len()
        || normalized.iter().any(|id| !expected.contains(id.as_str()))
        || !normalized.iter().any(|id| id == tab_id)
    {
        return Err(SessionTabsError::InvalidTabOrder);
    }
    Ok(SessionTabMove::Reorder {
        tab_order: normalized,
    })
}

fn move_persisted(
    session: &mut Value,
    worktree: &str,
    tab_id: &str,
    target_group_id: &str,
    kind: &SessionTabMove,
    groups: Vec<Value>,
    layout: Option<Value>,
) -> (Result<(), SessionTabsError>, bool) {
    let Some(session) = session.as_object_mut() else {
        return (Err(SessionTabsError::TabNotFound), false);
    };
    if groups_mut(session, worktree).is_empty() {
        *groups_mut(session, worktree) = groups;
    }
    normalize_persisted_groups(groups_mut(session, worktree), worktree);
    if object_field(session, "tabGroupLayouts")
        .get(worktree)
        .is_none()
        && let Some(layout) = layout
    {
        object_field(session, "tabGroupLayouts").insert(worktree.to_owned(), layout);
    }
    match kind {
        SessionTabMove::Reorder { tab_order } => {
            if let Some(tabs) = session
                .get_mut("tabsByWorktree")
                .and_then(Value::as_object_mut)
                .and_then(|by_worktree| by_worktree.get_mut(worktree))
                .and_then(Value::as_array_mut)
            {
                let indexes = tab_order
                    .iter()
                    .enumerate()
                    .map(|(index, id)| (id.as_str(), index))
                    .collect::<HashMap<_, _>>();
                tabs.sort_by_key(|tab| {
                    tab.get("id")
                        .and_then(Value::as_str)
                        .and_then(|id| indexes.get(id).copied())
                        .unwrap_or(usize::MAX)
                });
                for (index, tab) in tabs.iter_mut().enumerate() {
                    tab["sortOrder"] = Value::from(index);
                }
            }
            update_group_order(session, worktree, target_group_id, tab_order.clone());
        }
        SessionTabMove::MoveToGroup { index } => {
            move_between_groups(session, worktree, tab_id, target_group_id, *index);
        }
        SessionTabMove::Split { direction } => {
            if !split_group(session, worktree, tab_id, target_group_id, direction) {
                return (Ok(()), false);
            }
        }
    }
    normalize_persisted_groups(groups_mut(session, worktree), worktree);
    (Ok(()), true)
}

fn normalize_persisted_groups(groups: &mut Vec<Value>, worktree: &str) {
    for group in groups.iter_mut().filter_map(Value::as_object_mut) {
        group.insert("worktreeId".to_owned(), Value::String(worktree.to_owned()));
        let order = group
            .get("tabOrder")
            .and_then(Value::as_array)
            .cloned()
            .unwrap_or_default();
        let active_is_present = group
            .get("activeTabId")
            .and_then(Value::as_str)
            .is_some_and(|active| order.iter().any(|id| id.as_str() == Some(active)));
        if !active_is_present {
            group.insert(
                "activeTabId".to_owned(),
                order.first().cloned().unwrap_or(Value::Null),
            );
        }
        if let Some(recent) = group.get_mut("recentTabIds").and_then(Value::as_array_mut) {
            recent.retain(|id| order.contains(id));
        }
    }
    groups.retain(|group| {
        group
            .get("tabOrder")
            .and_then(Value::as_array)
            .is_some_and(|order| !order.is_empty())
    });
}

fn update_group_order(
    session: &mut Map<String, Value>,
    worktree: &str,
    group_id: &str,
    order: Vec<String>,
) {
    if let Some(group) = group_mut(session, worktree, group_id) {
        group.insert(
            "tabOrder".to_owned(),
            Value::Array(order.into_iter().map(Value::String).collect()),
        );
    }
}

fn move_between_groups(
    session: &mut Map<String, Value>,
    worktree: &str,
    tab_id: &str,
    target_group_id: &str,
    index: Option<usize>,
) {
    let groups = groups_mut(session, worktree);
    for group in groups.iter_mut() {
        if let Some(order) = group.get_mut("tabOrder").and_then(Value::as_array_mut) {
            order.retain(|id| id.as_str() != Some(tab_id));
        }
    }
    if let Some(group) = groups
        .iter_mut()
        .find(|group| group.get("id").and_then(Value::as_str) == Some(target_group_id))
        .and_then(Value::as_object_mut)
    {
        let order = group
            .entry("tabOrder".to_owned())
            .or_insert_with(|| Value::Array(Vec::new()))
            .as_array_mut();
        if let Some(order) = order {
            order.insert(
                index.unwrap_or(order.len()).min(order.len()),
                Value::String(tab_id.to_owned()),
            );
            group.insert("activeTabId".to_owned(), Value::String(tab_id.to_owned()));
        }
    }
    groups.retain(|group| {
        group
            .get("tabOrder")
            .and_then(Value::as_array)
            .is_some_and(|order| !order.is_empty())
    });
    object_field(session, "activeGroupIdByWorktree").insert(
        worktree.to_owned(),
        Value::String(target_group_id.to_owned()),
    );
}

fn split_group(
    session: &mut Map<String, Value>,
    worktree: &str,
    tab_id: &str,
    target_group_id: &str,
    direction: &str,
) -> bool {
    let source_is_single_target = groups_mut(session, worktree).iter().any(|group| {
        group.get("id").and_then(Value::as_str) == Some(target_group_id)
            && group
                .get("tabOrder")
                .and_then(Value::as_array)
                .is_some_and(|order| order.len() == 1 && order[0].as_str() == Some(tab_id))
    });
    if source_is_single_target {
        return false;
    }
    let new_group_id = crate::terminal_session::random_id().unwrap_or_else(|_| mobile_epoch());
    let groups = groups_mut(session, worktree);
    for group in groups.iter_mut() {
        if let Some(order) = group.get_mut("tabOrder").and_then(Value::as_array_mut) {
            order.retain(|id| id.as_str() != Some(tab_id));
        }
    }
    groups.retain(|group| {
        group
            .get("tabOrder")
            .and_then(Value::as_array)
            .is_some_and(|order| !order.is_empty())
    });
    groups.push(json!({
        "id": new_group_id, "worktreeId": worktree,
        "activeTabId": tab_id, "tabOrder": [tab_id]
    }));
    let direction_value = if matches!(direction, "left" | "right") {
        "horizontal"
    } else {
        "vertical"
    };
    let layouts = object_field(session, "tabGroupLayouts");
    let existing = layouts
        .get(worktree)
        .cloned()
        .unwrap_or_else(|| json!({ "type": "leaf", "groupId": target_group_id }));
    let (layout, inserted) = insert_group_split(
        existing,
        target_group_id,
        &new_group_id,
        direction_value,
        matches!(direction, "left" | "up"),
    );
    if !inserted {
        return false;
    }
    layouts.insert(worktree.to_owned(), layout);
    object_field(session, "activeGroupIdByWorktree")
        .insert(worktree.to_owned(), Value::String(new_group_id));
    true
}

fn insert_group_split(
    node: Value,
    target_group_id: &str,
    new_group_id: &str,
    direction: &str,
    added_first: bool,
) -> (Value, bool) {
    let Some(object) = node.as_object() else {
        return (node, false);
    };
    if object.get("type").and_then(Value::as_str) == Some("leaf") {
        if object.get("groupId").and_then(Value::as_str) != Some(target_group_id) {
            return (node, false);
        }
        let added = json!({ "type": "leaf", "groupId": new_group_id });
        let (first, second) = if added_first {
            (added, node)
        } else {
            (node, added)
        };
        return (
            json!({
                "type": "split", "direction": direction,
                "first": first, "second": second
            }),
            true,
        );
    }
    if object.get("type").and_then(Value::as_str) != Some("split") {
        return (node, false);
    }
    let mut next = object.clone();
    if let Some(first) = next.remove("first") {
        let (first, inserted) =
            insert_group_split(first, target_group_id, new_group_id, direction, added_first);
        next.insert("first".to_owned(), first);
        if inserted {
            return (Value::Object(next), true);
        }
    }
    if let Some(second) = next.remove("second") {
        let (second, inserted) = insert_group_split(
            second,
            target_group_id,
            new_group_id,
            direction,
            added_first,
        );
        next.insert("second".to_owned(), second);
        return (Value::Object(next), inserted);
    }
    (Value::Object(next), false)
}

fn place_persisted_terminal(
    session: &mut Value,
    worktree: &str,
    tab_id: &str,
    after_tab_id: Option<&str>,
    target_group_id: Option<&str>,
) -> bool {
    let Some(session) = session.as_object_mut() else {
        return false;
    };
    if let Some(tabs) = session
        .get_mut("tabsByWorktree")
        .and_then(Value::as_object_mut)
        .and_then(|by_worktree| by_worktree.get_mut(worktree))
        .and_then(Value::as_array_mut)
        && let Some(index) = after_tab_id.and_then(|after| {
            tabs.iter()
                .position(|tab| tab.get("id").and_then(Value::as_str) == Some(after))
        })
        && let Some(created) = tabs
            .iter()
            .position(|tab| tab.get("id").and_then(Value::as_str) == Some(tab_id))
    {
        let tab = tabs.remove(created);
        tabs.insert((index + 1).min(tabs.len()), tab);
        for (index, tab) in tabs.iter_mut().enumerate() {
            tab["sortOrder"] = Value::from(index);
        }
    }
    if let Some(group_id) = target_group_id {
        move_between_groups(session, worktree, tab_id, group_id, None);
    }
    true
}

fn group_mut<'a>(
    session: &'a mut Map<String, Value>,
    worktree: &str,
    group_id: &str,
) -> Option<&'a mut Map<String, Value>> {
    groups_mut(session, worktree)
        .iter_mut()
        .find(|group| group.get("id").and_then(Value::as_str) == Some(group_id))
        .and_then(Value::as_object_mut)
}

fn groups_mut<'a>(session: &'a mut Map<String, Value>, worktree: &str) -> &'a mut Vec<Value> {
    let groups = object_field(session, "tabGroups")
        .entry(worktree.to_owned())
        .or_insert_with(|| Value::Array(Vec::new()));
    if !groups.is_array() {
        *groups = Value::Array(Vec::new());
    }
    groups.as_array_mut().unwrap_or_else(|| unreachable!())
}

fn object_field<'a>(object: &'a mut Map<String, Value>, field: &str) -> &'a mut Map<String, Value> {
    let value = object
        .entry(field.to_owned())
        .or_insert_with(|| Value::Object(Map::new()));
    if !value.is_object() {
        *value = Value::Object(Map::new());
    }
    value.as_object_mut().unwrap_or_else(|| unreachable!())
}

fn mobile_epoch() -> String {
    let millis = SystemTime::now()
        .duration_since(UNIX_EPOCH)
        .ok()
        .and_then(|duration| u64::try_from(duration.as_millis()).ok())
        .unwrap_or_default();
    format!("mobile-local:{millis:x}")
}

fn cache_create_result(cache: &mut CreateResults, key: String, value: Value) {
    prune_create_results(cache);
    if let std::collections::hash_map::Entry::Occupied(mut entry) = cache.values.entry(key.clone())
    {
        entry.insert((Instant::now(), value));
        return;
    }
    while cache.order.len() >= CREATE_RESULT_CAPACITY {
        if let Some(oldest) = cache.order.pop_front() {
            cache.values.remove(&oldest);
        }
    }
    cache.order.push_back(key.clone());
    cache.values.insert(key, (Instant::now(), value));
}

fn cached_create_result(cache: &mut CreateResults, key: &str) -> Option<Value> {
    prune_create_results(cache);
    cache.values.get(key).map(|(_, value)| value.clone())
}

fn prune_create_results(cache: &mut CreateResults) {
    let cutoff = Instant::now()
        .checked_sub(CREATE_RESULT_TTL)
        .unwrap_or_else(Instant::now);
    while cache.order.front().is_some_and(|key| {
        cache
            .values
            .get(key)
            .is_none_or(|(created_at, _)| *created_at <= cutoff)
    }) {
        if let Some(key) = cache.order.pop_front() {
            cache.values.remove(&key);
        }
    }
}
