pub(crate) mod path_resolution;
mod registry;

use std::path::PathBuf;
use std::sync::{Arc, Mutex, MutexGuard};

use thiserror::Error;

#[derive(Clone, Default)]
pub(crate) struct ExternalPathAuthority {
    paths: Arc<Mutex<registry::AuthorizedPaths>>,
}

#[derive(Debug, Error)]
pub(crate) enum ExternalPathError {
    #[error("external path resolution failed: {0}")]
    Io(#[from] std::io::Error),
}

impl ExternalPathAuthority {
    pub(crate) async fn authorize(&self, target_path: &str) -> Result<(), ExternalPathError> {
        let resolved = path_resolution::resolve_absolute(target_path)?;
        self.lock().remember(resolved.clone());
        // Why: an unavailable target still needs lexical authorization so a picker can grant a
        // destination before it exists. Existing targets additionally record their real path.
        if let Ok(canonical) = tokio::fs::canonicalize(&resolved).await {
            self.lock().remember(path_resolution::normalize(canonical));
        }
        Ok(())
    }

    pub(crate) async fn resolve(
        &self,
        target_path: &str,
        mode: crate::workspace_paths::PathResolution,
    ) -> Result<Option<PathBuf>, ExternalPathError> {
        let resolved = path_resolution::resolve_absolute(target_path)?;
        if !self.lock().contains(&resolved) {
            return Ok(None);
        }
        self.resolve_after_lexical_authorization(&resolved.to_string_lossy(), mode)
            .await
    }

    pub(crate) async fn resolve_after_lexical_authorization(
        &self,
        target_path: &str,
        mode: crate::workspace_paths::PathResolution,
    ) -> Result<Option<PathBuf>, ExternalPathError> {
        let resolved = path_resolution::resolve_absolute(target_path)?;
        let canonical = match mode {
            crate::workspace_paths::PathResolution::Follow => {
                path_resolution::canonicalize(&resolved).await?
            }
            crate::workspace_paths::PathResolution::PreserveLeaf => {
                path_resolution::canonicalize_preserving_leaf(&resolved).await?
            }
        };
        // Why: a symlink created or retargeted after authorization must not use an authorized
        // lexical path to escape into a canonical path that was never granted.
        Ok(self.lock().contains(&canonical).then_some(canonical))
    }

    fn lock(&self) -> MutexGuard<'_, registry::AuthorizedPaths> {
        self.paths
            .lock()
            .unwrap_or_else(std::sync::PoisonError::into_inner)
    }
}
