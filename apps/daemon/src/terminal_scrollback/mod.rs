mod storage;

use std::collections::HashSet;
use std::path::{Path, PathBuf};

const SNAPSHOT_DIRECTORY: &str = "terminal-scrollback";

#[derive(Clone)]
pub(crate) struct TerminalScrollbackSnapshots {
    fallback_root: Option<PathBuf>,
    primary_root: PathBuf,
}

impl TerminalScrollbackSnapshots {
    pub(crate) fn for_profile(user_data_path: &Path) -> Self {
        let primary_root = user_data_path.join(SNAPSHOT_DIRECTORY);
        let fallback_root = crate::paths::resolve_default_user_data_path()
            .ok()
            .map(|path| path.join(SNAPSHOT_DIRECTORY))
            .filter(|path| path != &primary_root);
        Self {
            fallback_root,
            primary_root,
        }
    }

    pub(crate) async fn delete_all(&self, references: HashSet<String>) {
        if references.is_empty() {
            return;
        }
        let snapshots = self.clone();
        let _ =
            tokio::task::spawn_blocking(move || snapshots.delete_all_blocking(&references)).await;
    }

    pub(crate) fn delete_all_blocking(&self, references: &HashSet<String>) {
        for reference in references {
            storage::delete(&self.primary_root, reference);
            if let Some(fallback) = &self.fallback_root {
                storage::delete(fallback, reference);
            }
        }
    }

    pub(crate) fn delete_for_blocking(&self, tab_id: &str, leaf_id: &str) {
        let reference = storage::snapshot_ref(tab_id, leaf_id);
        storage::delete(&self.primary_root, &reference);
        if let Some(fallback) = &self.fallback_root {
            storage::delete(fallback, &reference);
        }
    }

    pub(crate) fn store_blocking(
        &self,
        tab_id: &str,
        leaf_id: &str,
        buffer: &str,
    ) -> Option<String> {
        if buffer.is_empty() {
            return None;
        }
        let reference = storage::snapshot_ref(tab_id, leaf_id);
        match storage::write(&self.primary_root, &reference, buffer) {
            Ok(()) => Some(reference),
            Err(error) => {
                eprintln!("[terminal-scrollback] Failed to write snapshot: {error}");
                None
            }
        }
    }

    pub(crate) fn read_blocking(&self, reference: &str) -> Option<String> {
        storage::read(&self.primary_root, reference)
            .ok()
            .or_else(|| {
                self.fallback_root
                    .as_ref()
                    .and_then(|root| storage::read(root, reference).ok())
            })
    }
}
