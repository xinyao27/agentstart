use std::env;

use super::ExtensionBundleError;
use super::archive;
use super::directory;
use super::download;

#[derive(Clone, Copy, Debug, Eq, PartialEq)]
pub(crate) enum ExtensionBundleSync {
    AlreadyCurrent,
    Installed,
}

impl ExtensionBundleSync {
    pub(crate) fn name(self) -> &'static str {
        match self {
            Self::AlreadyCurrent => "already-installed",
            Self::Installed => "installed",
        }
    }
}

/// Stage the unpacked extension bundle for this daemon build, replacing whatever is on disk when the
/// installed manifest is stale. A missing bundle is not an error: the Web Store channel does not need
/// one, and only the unpacked channel asks for this.
pub(crate) async fn sync() -> Result<ExtensionBundleSync, ExtensionBundleError> {
    let version = env!("CARGO_PKG_VERSION");
    let directory = directory::resolve_bundle_directory()?;
    if directory::read_manifest_version(&directory)?.as_deref() == Some(version) {
        return Ok(ExtensionBundleSync::AlreadyCurrent);
    }
    let archive_path = download::fetch(version).await?;
    let result = archive::replace(&archive_path, &directory).await;
    download::discard(&archive_path).await;
    result?;
    Ok(ExtensionBundleSync::Installed)
}
