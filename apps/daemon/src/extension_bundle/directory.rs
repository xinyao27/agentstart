use std::io;
use std::path::{Path, PathBuf};

use serde::Deserialize;

use super::ExtensionBundleError;

const PRODUCT_DIRECTORY_NAME: &str = "AgentStart";
const BUNDLE_DIRECTORY_NAME: &str = "ChromeExtension";
const MANIFEST_FILE_NAME: &str = "manifest.json";
// Why: the macOS app stages this same directory out of its own bundle, so development and release
// verification need a way to point the CLI at a different copy without disturbing the real one.
const DIRECTORY_OVERRIDE: &str = "AGENTSTART_EXTENSION_BUNDLE_PATH";

#[derive(Deserialize)]
struct BundleManifest {
    version: String,
}

// Why: this is deliberately the path `ExtensionInstaller.syncBundledExtension` writes on macOS. Two
// writers pointing Chrome at different directories would leave whichever copy moved last in charge.
pub(crate) fn resolve_bundle_directory() -> Result<PathBuf, ExtensionBundleError> {
    if let Some(configured) = crate::paths::trimmed_environment(DIRECTORY_OVERRIDE) {
        return Ok(PathBuf::from(configured));
    }
    Ok(application_data_root()?
        .join(PRODUCT_DIRECTORY_NAME)
        .join(BUNDLE_DIRECTORY_NAME))
}

/// The version Chrome reports for an unpacked load of the managed directory, or `None` when nothing
/// has been staged there yet.
pub(crate) fn installed_version() -> Result<Option<String>, ExtensionBundleError> {
    read_manifest_version(&resolve_bundle_directory()?)
}

pub(super) fn read_manifest_version(
    directory: &Path,
) -> Result<Option<String>, ExtensionBundleError> {
    let contents = match std::fs::read_to_string(directory.join(MANIFEST_FILE_NAME)) {
        Ok(contents) => contents,
        Err(error) if error.kind() == io::ErrorKind::NotFound => return Ok(None),
        Err(error) => return Err(error.into()),
    };
    Ok(Some(
        serde_json::from_str::<BundleManifest>(&contents)?.version,
    ))
}

#[cfg(target_os = "macos")]
fn application_data_root() -> Result<PathBuf, ExtensionBundleError> {
    Ok(home_directory()?
        .join("Library")
        .join("Application Support"))
}

#[cfg(target_os = "windows")]
fn application_data_root() -> Result<PathBuf, ExtensionBundleError> {
    crate::paths::trimmed_environment("LOCALAPPDATA")
        .or_else(|| crate::paths::trimmed_environment("APPDATA"))
        .map(PathBuf::from)
        .ok_or(ExtensionBundleError::DirectoryUnavailable)
}

#[cfg(not(any(target_os = "macos", target_os = "windows")))]
fn application_data_root() -> Result<PathBuf, ExtensionBundleError> {
    Ok(crate::paths::trimmed_environment("XDG_DATA_HOME")
        .map(PathBuf::from)
        .unwrap_or(home_directory()?.join(".local").join("share")))
}

#[cfg(not(target_os = "windows"))]
fn home_directory() -> Result<PathBuf, ExtensionBundleError> {
    crate::paths::resolve_local_home_path().ok_or(ExtensionBundleError::DirectoryUnavailable)
}
