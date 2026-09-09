use std::path::PathBuf;

use serde::{Deserialize, Serialize};

#[derive(Clone, Serialize)]
#[serde(rename_all = "camelCase")]
pub(crate) struct UpdateStatus {
    pub(crate) checked_at: u64,
    pub(crate) current_version: String,
    pub(crate) install_command: String,
    pub(crate) latest_version: Option<String>,
    pub(crate) release_url: Option<String>,
    pub(crate) update_available: bool,
}

#[derive(Clone, Debug, Deserialize)]
pub(super) struct GitHubRelease {
    #[serde(default)]
    pub(super) assets: Vec<GitHubReleaseAsset>,
    #[serde(default)]
    pub(super) draft: bool,
    pub(super) html_url: Option<String>,
    #[serde(default)]
    pub(super) prerelease: bool,
    pub(super) tag_name: Option<String>,
}

#[derive(Clone, Debug, Deserialize)]
pub(super) struct GitHubReleaseAsset {
    pub(super) browser_download_url: String,
    pub(super) name: String,
}

#[derive(Clone)]
pub(super) struct ReleaseDownload {
    pub(super) binary_url: String,
    pub(super) checksums_url: String,
    pub(super) release_url: Option<String>,
    pub(super) version: String,
}

#[derive(Clone)]
pub(super) struct CachedRelease {
    pub(super) download: Option<ReleaseDownload>,
    pub(super) status: UpdateStatus,
}

#[derive(Debug, Serialize)]
#[serde(rename_all = "camelCase")]
pub(crate) struct UpdateInstallResult {
    pub(crate) installed: bool,
    pub(crate) version: String,
}

#[derive(Debug)]
pub(crate) struct PreparedUpdate {
    executable: PathBuf,
    release_url: Option<String>,
    staging: PathBuf,
    version: String,
}

impl PreparedUpdate {
    pub(crate) fn executable(&self) -> &PathBuf {
        &self.executable
    }

    pub(crate) fn release_url(&self) -> Option<&str> {
        self.release_url.as_deref()
    }

    pub(crate) fn staging(&self) -> &PathBuf {
        &self.staging
    }

    pub(crate) fn version(&self) -> &str {
        &self.version
    }

    pub(super) fn new(
        executable: PathBuf,
        release_url: Option<String>,
        staging: PathBuf,
        version: String,
    ) -> Self {
        Self {
            executable,
            release_url,
            staging,
            version,
        }
    }
}

impl Drop for PreparedUpdate {
    fn drop(&mut self) {
        let _ = std::fs::remove_file(&self.staging);
    }
}
