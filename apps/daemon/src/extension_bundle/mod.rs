// Why: Chrome's fallback install channel is a directory the user loads unpacked, and only the daemon
// can keep that directory in step with the release the user actually upgraded to. Every rule about
// where the bundle lives, when it is stale, and how it is swapped lives here, so the install command,
// the updater, and the native-messaging host share one definition instead of three.

mod archive;
mod directory;
mod download;
mod sync;

use thiserror::Error;

#[derive(Debug, Error)]
pub(crate) enum ExtensionBundleError {
    #[error("extension_bundle_directory_unavailable")]
    DirectoryUnavailable,
    #[error("extension bundle manifest io failed: {0}")]
    ManifestIo(#[from] std::io::Error),
    #[error("extension bundle manifest is not a readable extension manifest: {0}")]
    ManifestFormat(#[from] serde_json::Error),
    #[error(transparent)]
    Download(#[from] download::BundleDownloadError),
    #[error(transparent)]
    Archive(#[from] archive::BundleArchiveError),
}

pub(crate) use directory::{installed_version, resolve_bundle_directory};
pub(crate) use sync::sync;
