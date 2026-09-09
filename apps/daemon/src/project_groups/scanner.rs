use std::collections::{HashMap, VecDeque};
use std::sync::atomic::{AtomicBool, Ordering};
use std::sync::{Arc, Mutex, MutexGuard};

use crate::host_registry::{HostRegistry, HostRegistryError};
use crate::hosts::{HostFilesystem, HostFilesystemError};

use super::events::{ScanEvents, ScanSubscription};
use super::{
    CancelNestedRepoScanResult, NestedRepoScan, NestedRepoScanEvent, NestedRepoScanOptions,
};

mod traversal;

const COMPLETED_LIMIT: usize = 50;

#[derive(Clone)]
pub(crate) struct NestedRepoScans {
    active: Arc<Mutex<HashMap<String, Arc<AtomicBool>>>>,
    completed: Arc<Mutex<CompletedScans>>,
    events: ScanEvents,
    hosts: HostRegistry,
}

#[derive(Default)]
struct CompletedScans {
    order: VecDeque<String>,
    values: HashMap<String, NestedRepoScan>,
}

impl NestedRepoScans {
    pub(crate) fn new(hosts: HostRegistry) -> Self {
        Self {
            active: Arc::new(Mutex::new(HashMap::new())),
            completed: Arc::new(Mutex::new(CompletedScans::default())),
            events: ScanEvents::new(),
            hosts,
        }
    }

    pub(crate) fn cancel(&self, scan_id: &str) -> CancelNestedRepoScanResult {
        let cancelled = lock(&self.active).get(scan_id).is_some_and(|token| {
            token.store(true, Ordering::Release);
            true
        });
        CancelNestedRepoScanResult { cancelled }
    }

    pub(crate) fn subscribe(&self, connection_id: Option<&str>) -> ScanSubscription {
        self.events.subscribe(connection_id)
    }

    pub(crate) fn completed(&self, scan_id: &str, parent_path: &str) -> Option<NestedRepoScan> {
        lock(&self.completed)
            .values
            .get(scan_id)
            .filter(|scan| normalized(&scan.selected_path) == normalized(parent_path))
            .cloned()
    }

    pub(crate) async fn scan(
        &self,
        path: String,
        scan_id: Option<String>,
        options: NestedRepoScanOptions,
    ) -> Result<NestedRepoScan, NestedRepoScanError> {
        let host = self.hosts.execution_host("local").await?;
        let filesystem = HostFilesystem::new(host);
        if !filesystem.paths().is_absolute(&path) {
            return Err(NestedRepoScanError::RelativePath);
        }
        let token = self.begin(scan_id.as_deref());
        let result = traversal::scan_path(&filesystem, path, options, &token, |scan| {
            if let Some(scan_id) = scan_id.as_ref() {
                self.events.publish(NestedRepoScanEvent::Progress {
                    scan: scan.clone(),
                    scan_id: scan_id.clone(),
                });
            }
        })
        .await;
        self.finish(scan_id.as_deref(), &token, result.as_ref().ok());
        result
    }

    fn begin(&self, scan_id: Option<&str>) -> Arc<AtomicBool> {
        let token = Arc::new(AtomicBool::new(false));
        if let Some(scan_id) = scan_id
            && let Some(previous) = lock(&self.active).insert(scan_id.to_owned(), token.clone())
        {
            previous.store(true, Ordering::Release);
        }
        token
    }

    fn finish(
        &self,
        scan_id: Option<&str>,
        token: &Arc<AtomicBool>,
        scan: Option<&NestedRepoScan>,
    ) {
        let Some(scan_id) = scan_id else { return };
        let mut active = lock(&self.active);
        if active
            .get(scan_id)
            .is_some_and(|current| Arc::ptr_eq(current, token))
        {
            active.remove(scan_id);
        }
        drop(active);
        let Some(scan) = scan else { return };
        let mut completed = lock(&self.completed);
        completed.order.retain(|id| id != scan_id);
        completed.order.push_back(scan_id.to_owned());
        completed.values.insert(scan_id.to_owned(), scan.clone());
        while completed.order.len() > COMPLETED_LIMIT {
            if let Some(oldest) = completed.order.pop_front() {
                completed.values.remove(&oldest);
            }
        }
    }
}

fn normalized(path: &str) -> String {
    if cfg!(windows) {
        path.replace('\\', "/").to_lowercase()
    } else {
        path.to_owned()
    }
}

fn lock<T>(mutex: &Mutex<T>) -> MutexGuard<'_, T> {
    mutex
        .lock()
        .unwrap_or_else(std::sync::PoisonError::into_inner)
}

#[derive(Debug, thiserror::Error)]
pub(crate) enum NestedRepoScanError {
    #[error(transparent)]
    Filesystem(#[from] HostFilesystemError),
    #[error(transparent)]
    Host(#[from] HostRegistryError),
    #[error("Project path must be an absolute path")]
    RelativePath,
}
