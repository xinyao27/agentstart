mod label;
mod proxy;
mod validate;

use std::collections::HashMap;
use std::sync::{Arc, Mutex, MutexGuard};

use thiserror::Error;
use url::Url;

use crate::projects::ProjectCatalog;
use crate::workspace_ports::WorkspacePortsRegistry;
use crate::worktrees::WorktreeCatalog;

use label::{LabelInput, RouteKeyInput, host_label, route_key};
use proxy::{ProxyServer, ProxyServerError};
use validate::TargetAuthority;
pub(crate) use validate::TargetValidationError;

// Why: The dedicated DNS suffix distinguishes worktree labels from unrelated localhost traffic.
pub(super) const YIRU_LOCALHOST_SUFFIX: &str = ".yiru.localhost";

#[derive(Clone)]
pub(crate) struct WorktreeLabelAuthority {
    inner: Arc<Inner>,
}

struct Inner {
    proxy: ProxyServer,
    routes: RouteRegistry,
    targets: TargetAuthority,
}

#[derive(Clone, Default)]
struct RouteRegistry(Arc<Mutex<RouteTable>>);

#[derive(Default)]
struct RouteTable {
    by_label: HashMap<String, RegisteredRoute>,
    by_route_key: HashMap<String, String>,
}

#[derive(Clone)]
pub(super) struct RegisteredRoute {
    pub(super) target_host: String,
    pub(super) target_port: u16,
}

pub(crate) struct RegisterRouteRequest {
    pub(crate) target_url: String,
    pub(crate) project_name: String,
    pub(crate) worktree_name: String,
    pub(crate) worktree_path: Option<String>,
    pub(crate) repo_id: Option<String>,
    pub(crate) worktree_id: Option<String>,
}

pub(crate) struct RegisterRouteResult {
    pub(crate) url: String,
    pub(crate) label: String,
}

#[derive(Debug, Error)]
pub(crate) enum WorktreeLabelError {
    #[error("target url must be an absolute http URL")]
    InvalidTargetUrl,
    #[error(transparent)]
    Target(#[from] TargetValidationError),
    #[error("no available localhost label")]
    NoAvailableLabel,
    #[error(transparent)]
    Proxy(#[from] ProxyServerError),
}

impl WorktreeLabelAuthority {
    pub(crate) fn new(
        ports: WorkspacePortsRegistry,
        projects: ProjectCatalog,
        worktrees: WorktreeCatalog,
    ) -> Self {
        let routes = RouteRegistry::default();
        let proxy = ProxyServer::new(routes.clone());
        Self {
            inner: Arc::new(Inner {
                proxy,
                routes,
                targets: TargetAuthority::new(ports, projects, worktrees),
            }),
        }
    }

    pub(crate) async fn register(
        &self,
        request: RegisterRouteRequest,
    ) -> Result<RegisterRouteResult, WorktreeLabelError> {
        // Why: Only plain HTTP workspace ports can be labeled by this proxy.
        let target = Url::parse(&request.target_url)
            .map_err(|_error| WorktreeLabelError::InvalidTargetUrl)?;
        if target.scheme() != "http" {
            return Err(WorktreeLabelError::InvalidTargetUrl);
        }
        let target_host = target
            .host_str()
            .ok_or(WorktreeLabelError::InvalidTargetUrl)?
            .to_owned();
        let target_port = target
            .port_or_known_default()
            .ok_or(WorktreeLabelError::InvalidTargetUrl)?;
        self.inner
            .targets
            .assert_allowed(&target_host, target_port)
            .await?;
        let listener_port = self.inner.proxy.ensure_started().await?;

        let base_label = host_label(&LabelInput {
            project_name: &request.project_name,
            worktree_name: &request.worktree_name,
            worktree_path: request.worktree_path.as_deref(),
        });
        let key = route_key(&RouteKeyInput {
            target_url: &request.target_url,
            project_name: &request.project_name,
            worktree_name: &request.worktree_name,
            repo_id: request.repo_id.as_deref(),
            worktree_id: request.worktree_id.as_deref(),
        });

        let label = {
            let mut table = self.inner.routes.lock_table();
            let label = match table.by_route_key.get(&key) {
                Some(existing) => existing.clone(),
                None => next_available_label(&table.by_label, &base_label)
                    .ok_or(WorktreeLabelError::NoAvailableLabel)?,
            };
            table.by_label.insert(
                label.clone(),
                RegisteredRoute {
                    target_host,
                    target_port,
                },
            );
            table.by_route_key.insert(key, label.clone());
            label
        };

        let mut labeled = target;
        let _ = labeled.set_host(Some(&format!("{label}{YIRU_LOCALHOST_SUFFIX}")));
        let _ = labeled.set_port(Some(listener_port));
        Ok(RegisterRouteResult {
            url: labeled.to_string(),
            label,
        })
    }
}

impl RouteRegistry {
    fn lock_table(&self) -> MutexGuard<'_, RouteTable> {
        self.0
            .lock()
            .unwrap_or_else(std::sync::PoisonError::into_inner)
    }

    fn lookup(&self, label: &str) -> Option<RegisteredRoute> {
        self.lock_table().by_label.get(label).cloned()
    }
}

fn next_available_label(existing: &HashMap<String, RegisteredRoute>, base: &str) -> Option<String> {
    if !existing.contains_key(base) {
        return Some(base.to_owned());
    }
    (2..1000)
        .map(|index| format!("{base}-{index}"))
        .find(|candidate| !existing.contains_key(candidate))
}
