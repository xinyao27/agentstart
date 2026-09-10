use agentstart_protocol::protocol::v1::{Status, StatusCode};
use agentstart_protocol::runtime::v1::session_tabs_tab::Tab;
use agentstart_protocol::runtime::v1::{
    AgentProviderSession, AgentProviderSessionKey, AgentStatusState, SessionTabsAgentStatus,
    SessionTabsBrowserTab, SessionTabsFileDiffSource, SessionTabsFileMode, SessionTabsFileTab,
    SessionTabsGroupLayoutNode, SessionTabsGroupLeaf, SessionTabsGroupSplit,
    SessionTabsMarkdownMode, SessionTabsMarkdownTab, SessionTabsPaneLayoutNode,
    SessionTabsPaneSplitDirection, SessionTabsSnapshot, SessionTabsTab, SessionTabsTabGroup,
    SessionTabsTabType, SessionTabsTerminalStatus, SessionTabsTerminalTab,
    session_tabs_group_layout_node, session_tabs_pane_layout_node,
};
use serde_json::{Map, Value, json};

pub(super) fn protocol_snapshot(value: Value) -> Result<SessionTabsSnapshot, Status> {
    let object = value
        .as_object()
        .ok_or_else(|| data_loss("Session tabs snapshot is not an object"))?;
    let tab_groups = object
        .get("tabGroups")
        .and_then(Value::as_array)
        .map(|groups| {
            groups
                .iter()
                .map(protocol_tab_group)
                .collect::<Result<Vec<_>, Status>>()
        })
        .transpose()?
        .unwrap_or_default();
    let tabs = object
        .get("tabs")
        .and_then(Value::as_array)
        .map(|tabs| {
            tabs.iter()
                .map(protocol_tab)
                .collect::<Result<Vec<_>, Status>>()
        })
        .transpose()?
        .unwrap_or_default();
    Ok(SessionTabsSnapshot {
        worktree: string(object, "worktree"),
        publication_epoch: string(object, "publicationEpoch"),
        snapshot_version: object
            .get("snapshotVersion")
            .and_then(Value::as_f64)
            .filter(|version| version.is_finite())
            .unwrap_or_default(),
        active_group_id: optional_string(object, "activeGroupId"),
        active_tab_id: optional_string(object, "activeTabId"),
        active_tab_type: optional_enum(object, "activeTabType", protocol_tab_type) as i32,
        tab_groups,
        tab_group_layout: object
            .get("tabGroupLayout")
            .map(protocol_group_layout_node)
            .transpose()?,
        tabs,
        removed: object.get("removed").and_then(Value::as_bool),
    })
}

// Why: updatePaneLayout's authority input is the persisted JSON tree shape,
// so the typed request node is rendered back to exactly the leaves and splits
// the renderer and headless mutations agree on.
pub(super) fn pane_layout_value(node: SessionTabsPaneLayoutNode) -> Value {
    match node.node {
        Some(session_tabs_pane_layout_node::Node::Leaf(leaf)) => {
            json!({ "type": "leaf", "leafId": leaf.leaf_id })
        }
        Some(session_tabs_pane_layout_node::Node::Split(split)) => {
            let mut object = Map::new();
            object.insert("type".to_owned(), Value::String("split".to_owned()));
            object.insert(
                "direction".to_owned(),
                Value::String(pane_split_direction(split.direction).to_owned()),
            );
            if let Some(first) = split.first {
                object.insert("first".to_owned(), pane_layout_value(*first));
            }
            if let Some(second) = split.second {
                object.insert("second".to_owned(), pane_layout_value(*second));
            }
            if let Some(ratio) = split.ratio {
                object.insert("ratio".to_owned(), Value::from(ratio));
            }
            Value::Object(object)
        }
        None => json!({ "type": "leaf", "leafId": String::new() }),
    }
}

pub(super) fn protocol_tab(value: &Value) -> Result<SessionTabsTab, Status> {
    let object = value
        .as_object()
        .ok_or_else(|| data_loss("Session tab is not an object"))?;
    match required_string(object, "type")?.as_str() {
        "terminal" => Ok(SessionTabsTab {
            tab: Some(Tab::Terminal(protocol_terminal_tab(object)?)),
        }),
        "markdown" => Ok(SessionTabsTab {
            tab: Some(Tab::Markdown(protocol_markdown_tab(object)?)),
        }),
        "file" => Ok(SessionTabsTab {
            tab: Some(Tab::File(protocol_file_tab(object)?)),
        }),
        "browser" => Ok(SessionTabsTab {
            tab: Some(Tab::Browser(protocol_browser_tab(object)?)),
        }),
        _ => Err(data_loss("Session tab type is invalid")),
    }
}

fn protocol_terminal_tab(object: &Map<String, Value>) -> Result<SessionTabsTerminalTab, Status> {
    let status = match optional_string(object, "status").as_deref() {
        Some("ready") => SessionTabsTerminalStatus::Ready,
        Some("pending-handle") => SessionTabsTerminalStatus::PendingHandle,
        Some("sleeping") => SessionTabsTerminalStatus::Sleeping,
        _ => SessionTabsTerminalStatus::Unspecified,
    };
    Ok(SessionTabsTerminalTab {
        id: required_string(object, "id")?,
        title: string(object, "title"),
        is_active: object
            .get("isActive")
            .and_then(Value::as_bool)
            .unwrap_or(false),
        parent_tab_id: string(object, "parentTabId"),
        leaf_id: string(object, "leafId"),
        status: status as i32,
        terminal: optional_string(object, "terminal"),
        pty_id: optional_string(object, "ptyId"),
        worktree_instance_id: optional_string(object, "worktreeInstanceId"),
        color: optional_string(object, "color"),
        is_pinned: object.get("isPinned").and_then(Value::as_bool),
        quick_command_label: optional_string(object, "quickCommandLabel"),
        launch_agent: optional_string(object, "launchAgent"),
        resolved_agent_type: optional_string(object, "resolvedAgentType"),
        startup_cwd: optional_string(object, "startupCwd"),
        agent_status: object
            .get("agentStatus")
            .map(protocol_agent_status)
            .transpose()?,
    })
}

fn protocol_markdown_tab(object: &Map<String, Value>) -> Result<SessionTabsMarkdownTab, Status> {
    Ok(SessionTabsMarkdownTab {
        id: required_string(object, "id")?,
        title: string(object, "title"),
        is_active: object
            .get("isActive")
            .and_then(Value::as_bool)
            .unwrap_or(false),
        file_path: string(object, "filePath"),
        relative_path: string(object, "relativePath"),
        mode: optional_enum(object, "mode", |value| match value {
            "edit" => SessionTabsMarkdownMode::Edit,
            "markdown-preview" => SessionTabsMarkdownMode::Preview,
            _ => SessionTabsMarkdownMode::Unspecified,
        }) as i32,
        is_dirty: object
            .get("isDirty")
            .and_then(Value::as_bool)
            .unwrap_or(false),
        source_file_id: string(object, "sourceFileId"),
        source_file_path: string(object, "sourceFilePath"),
        source_relative_path: string(object, "sourceRelativePath"),
        document_version: string(object, "documentVersion"),
        color: optional_string(object, "color"),
        is_pinned: object.get("isPinned").and_then(Value::as_bool),
    })
}

fn protocol_file_tab(object: &Map<String, Value>) -> Result<SessionTabsFileTab, Status> {
    Ok(SessionTabsFileTab {
        id: required_string(object, "id")?,
        title: string(object, "title"),
        is_active: object
            .get("isActive")
            .and_then(Value::as_bool)
            .unwrap_or(false),
        file_path: string(object, "filePath"),
        relative_path: string(object, "relativePath"),
        language: string(object, "language"),
        mode: optional_enum(object, "mode", |value| match value {
            "edit" => SessionTabsFileMode::Edit,
            "diff" => SessionTabsFileMode::Diff,
            _ => SessionTabsFileMode::Unspecified,
        }) as i32,
        diff_source: optional_enum(object, "diffSource", |value| match value {
            "staged" => SessionTabsFileDiffSource::Staged,
            "unstaged" => SessionTabsFileDiffSource::Unstaged,
            _ => SessionTabsFileDiffSource::Unspecified,
        }) as i32,
        is_dirty: object
            .get("isDirty")
            .and_then(Value::as_bool)
            .unwrap_or(false),
        color: optional_string(object, "color"),
        is_pinned: object.get("isPinned").and_then(Value::as_bool),
    })
}

fn protocol_browser_tab(object: &Map<String, Value>) -> Result<SessionTabsBrowserTab, Status> {
    Ok(SessionTabsBrowserTab {
        id: required_string(object, "id")?,
        title: string(object, "title"),
        is_active: object
            .get("isActive")
            .and_then(Value::as_bool)
            .unwrap_or(false),
        browser_workspace_id: string(object, "browserWorkspaceId"),
        browser_page_id: optional_string(object, "browserPageId"),
        url: string(object, "url"),
        loading: object
            .get("loading")
            .and_then(Value::as_bool)
            .unwrap_or(false),
        can_go_back: object
            .get("canGoBack")
            .and_then(Value::as_bool)
            .unwrap_or(false),
        can_go_forward: object
            .get("canGoForward")
            .and_then(Value::as_bool)
            .unwrap_or(false),
        color: optional_string(object, "color"),
        is_pinned: object.get("isPinned").and_then(Value::as_bool),
    })
}

fn protocol_agent_status(value: &Value) -> Result<SessionTabsAgentStatus, Status> {
    let object = value
        .as_object()
        .ok_or_else(|| data_loss("Session tab agent status is not an object"))?;
    Ok(SessionTabsAgentStatus {
        state: optional_enum(object, "state", |value| match value {
            "working" => AgentStatusState::Working,
            "blocked" => AgentStatusState::Blocked,
            "waiting" => AgentStatusState::Waiting,
            "done" => AgentStatusState::Done,
            _ => AgentStatusState::Unspecified,
        }) as i32,
        pane_key: optional_string(object, "paneKey"),
        prompt: optional_string(object, "prompt"),
        updated_at: object
            .get("updatedAt")
            .and_then(Value::as_f64)
            .filter(|value| value.is_finite()),
        state_started_at: object
            .get("stateStartedAt")
            .and_then(Value::as_f64)
            .filter(|value| value.is_finite()),
        agent_type: optional_string(object, "agentType"),
        interactive_prompt: optional_string(object, "interactivePrompt"),
        last_assistant_message: optional_string(object, "lastAssistantMessage"),
        tool_name: optional_string(object, "toolName"),
        tool_input: optional_string(object, "toolInput"),
        interrupted: object.get("interrupted").and_then(Value::as_bool),
        provider_session: object
            .get("providerSession")
            .map(protocol_provider_session)
            .transpose()?,
    })
}

fn protocol_provider_session(value: &Value) -> Result<AgentProviderSession, Status> {
    let object = value
        .as_object()
        .ok_or_else(|| data_loss("Session tab provider session is not an object"))?;
    Ok(AgentProviderSession {
        key: optional_enum(object, "key", |value| match value {
            "session_id" => AgentProviderSessionKey::SessionId,
            "conversation_id" => AgentProviderSessionKey::ConversationId,
            _ => AgentProviderSessionKey::Unspecified,
        }) as i32,
        id: string(object, "id"),
        transcript_path: optional_string(object, "transcriptPath"),
    })
}

fn protocol_tab_group(value: &Value) -> Result<SessionTabsTabGroup, Status> {
    let object = value
        .as_object()
        .ok_or_else(|| data_loss("Session tab group is not an object"))?;
    Ok(SessionTabsTabGroup {
        id: required_string(object, "id")?,
        active_tab_id: optional_string(object, "activeTabId"),
        tab_order: string_list(object, "tabOrder"),
        recent_tab_ids: string_list(object, "recentTabIds"),
    })
}

fn protocol_group_layout_node(value: &Value) -> Result<SessionTabsGroupLayoutNode, Status> {
    let object = value
        .as_object()
        .ok_or_else(|| data_loss("Session tab group layout node is not an object"))?;
    match optional_string(object, "type").as_deref() {
        Some("leaf") => Ok(SessionTabsGroupLayoutNode {
            node: Some(session_tabs_group_layout_node::Node::Leaf(
                SessionTabsGroupLeaf {
                    group_id: required_string(object, "groupId")?,
                },
            )),
        }),
        Some("split") => Ok(SessionTabsGroupLayoutNode {
            node: Some(session_tabs_group_layout_node::Node::Split(Box::new(
                SessionTabsGroupSplit {
                    direction: match optional_string(object, "direction").as_deref() {
                        Some("horizontal") => SessionTabsPaneSplitDirection::Horizontal,
                        Some("vertical") => SessionTabsPaneSplitDirection::Vertical,
                        _ => SessionTabsPaneSplitDirection::Unspecified,
                    } as i32,
                    first: object
                        .get("first")
                        .map(protocol_group_layout_node)
                        .transpose()?
                        .map(Box::new),
                    second: object
                        .get("second")
                        .map(protocol_group_layout_node)
                        .transpose()?
                        .map(Box::new),
                    ratio: object
                        .get("ratio")
                        .and_then(Value::as_f64)
                        .filter(|ratio| ratio.is_finite()),
                },
            ))),
        }),
        _ => Err(data_loss("Session tab group layout type is invalid")),
    }
}

pub(super) fn pane_split_direction(direction: i32) -> &'static str {
    match SessionTabsPaneSplitDirection::try_from(direction) {
        Ok(SessionTabsPaneSplitDirection::Vertical) => "vertical",
        _ => "horizontal",
    }
}

fn protocol_tab_type(value: &str) -> SessionTabsTabType {
    match value {
        "terminal" => SessionTabsTabType::Terminal,
        "markdown" => SessionTabsTabType::Markdown,
        "file" => SessionTabsTabType::File,
        "browser" => SessionTabsTabType::Browser,
        _ => SessionTabsTabType::Unspecified,
    }
}

fn string_list(object: &Map<String, Value>, field: &str) -> Vec<String> {
    object
        .get(field)
        .and_then(Value::as_array)
        .map(|values| {
            values
                .iter()
                .filter_map(|value| value.as_str().map(str::to_owned))
                .collect()
        })
        .unwrap_or_default()
}

fn string(object: &Map<String, Value>, field: &str) -> String {
    optional_string(object, field).unwrap_or_default()
}

fn required_string(object: &Map<String, Value>, field: &str) -> Result<String, Status> {
    object
        .get(field)
        .and_then(Value::as_str)
        .map(str::to_owned)
        .ok_or_else(|| data_loss("Session tabs snapshot is missing a required string"))
}

fn optional_string(object: &Map<String, Value>, field: &str) -> Option<String> {
    object.get(field).and_then(Value::as_str).map(str::to_owned)
}

fn optional_enum<T>(object: &Map<String, Value>, field: &str, convert: impl Fn(&str) -> T) -> T {
    match object.get(field) {
        Some(Value::String(value)) => convert(value),
        _ => convert(""),
    }
}

fn data_loss(message: &str) -> Status {
    Status {
        code: StatusCode::DataLoss as i32,
        message: message.to_owned(),
        details: Vec::new(),
    }
}
