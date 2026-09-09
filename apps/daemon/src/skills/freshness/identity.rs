use std::collections::BTreeMap;
use std::path::Path;

use serde::Serialize;
use sha2::{Digest, Sha256};
use tokio::fs;

use super::git_tree::{git_object_sha, package_git_tree_sha};
use super::{MAX_DEPTH, MAX_ENTRIES, MAX_FILE_BYTES, MAX_FILES, MAX_TOTAL_BYTES};

#[derive(Serialize)]
#[serde(rename_all = "camelCase")]
pub(crate) struct DigestFile<'a> {
    pub(crate) path: &'a str,
    pub(crate) executable: bool,
    pub(crate) classification: &'a str,
    pub(crate) identity_sha256: &'a str,
}

pub(crate) struct ObservedFile {
    pub(crate) blob_sha: Vec<u8>,
    pub(crate) classification: &'static str,
    pub(crate) exact_sha256: String,
    pub(crate) executable: bool,
    pub(crate) identity_sha256: String,
    pub(crate) path: String,
    pub(crate) text_normalized_sha256: Option<String>,
}

pub(crate) struct ObservedPackage {
    pub(crate) digest: String,
    pub(crate) files: Vec<ObservedFile>,
    pub(crate) git_tree_sha: String,
}

pub(crate) async fn observe_package(root: &Path) -> Result<ObservedPackage, String> {
    let mut files = Vec::new();
    let mut directories = vec![(root.to_owned(), 0_usize)];
    let mut case_folded_paths = BTreeMap::<String, String>::new();
    let mut entries_seen = 0_usize;
    let mut total_bytes = 0_u64;
    while let Some((directory, depth)) = directories.pop() {
        let mut reader = fs::read_dir(&directory).await.map_err(io_category)?;
        let mut entries = Vec::new();
        while let Some(entry) = reader.next_entry().await.map_err(io_category)? {
            entries_seen += 1;
            if entries_seen > MAX_ENTRIES {
                return Err("skill-package-entry-limit".to_owned());
            }
            entries.push(entry);
        }
        entries.sort_by_key(tokio::fs::DirEntry::file_name);
        let mut child_directories = Vec::new();
        for entry in entries {
            let path = entry.path();
            let metadata = fs::symlink_metadata(&path).await.map_err(io_category)?;
            if metadata.file_type().is_symlink() {
                return Err("skill-package-link".to_owned());
            }
            if metadata.is_dir() {
                if depth >= MAX_DEPTH {
                    return Err("skill-package-depth-limit".to_owned());
                }
                child_directories.push((path, depth + 1));
                continue;
            }
            if !metadata.is_file() {
                return Err("skill-package-special-file".to_owned());
            }
            if files.len() >= MAX_FILES {
                return Err("skill-package-file-count-limit".to_owned());
            }
            if metadata.len() > MAX_FILE_BYTES {
                return Err("skill-package-file-size-limit".to_owned());
            }
            total_bytes = total_bytes
                .checked_add(metadata.len())
                .ok_or_else(|| "skill-package-total-size-limit".to_owned())?;
            if total_bytes > MAX_TOTAL_BYTES {
                return Err("skill-package-total-size-limit".to_owned());
            }
            let bytes = fs::read(&path).await.map_err(io_category)?;
            if u64::try_from(bytes.len()).ok() != Some(metadata.len()) {
                return Err("skill-package-changed-during-read".to_owned());
            }
            let relative = path
                .strip_prefix(root)
                .map_err(|_| "skill-path-escape".to_owned())?
                .to_string_lossy()
                .replace(std::path::MAIN_SEPARATOR, "/");
            let folded = relative.to_lowercase();
            if case_folded_paths
                .insert(folded, relative.clone())
                .is_some_and(|existing| existing != relative)
            {
                return Err("skill-case-collision".to_owned());
            }
            files.push(observe_file(relative, bytes, executable(&metadata)));
        }
        child_directories.sort_by(|left, right| left.0.cmp(&right.0));
        directories.extend(child_directories.into_iter().rev());
    }
    files.sort_by(|left, right| left.path.cmp(&right.path));
    let digest_files = files
        .iter()
        .map(|file| DigestFile {
            path: &file.path,
            executable: file.executable,
            classification: file.classification,
            identity_sha256: &file.identity_sha256,
        })
        .collect::<Vec<_>>();
    let encoded = serde_json::to_vec(&digest_files).map_err(|error| error.to_string())?;
    let git_tree_sha = package_git_tree_sha(&files)?;
    Ok(ObservedPackage {
        digest: sha256(&encoded),
        files,
        git_tree_sha,
    })
}

fn io_category(error: std::io::Error) -> String {
    if error.kind() == std::io::ErrorKind::PermissionDenied {
        "skill-package-inaccessible".to_owned()
    } else {
        error.to_string()
    }
}

fn observe_file(path: String, bytes: Vec<u8>, executable: bool) -> ObservedFile {
    let exact = sha256(&bytes);
    let normalized = (!bytes.contains(&0))
        .then(|| std::str::from_utf8(&bytes).ok())
        .flatten()
        .map(|text| text.replace("\r\n", "\n").replace('\r', "\n").into_bytes());
    let text_normalized = normalized.as_deref().map(sha256);
    let classification = if normalized.is_some() {
        "text"
    } else {
        "binary"
    };
    let identity = if !executable {
        text_normalized.clone().unwrap_or_else(|| exact.clone())
    } else {
        exact.clone()
    };
    ObservedFile {
        blob_sha: git_object_sha("blob", &bytes),
        classification,
        exact_sha256: exact,
        executable,
        identity_sha256: identity,
        path,
        text_normalized_sha256: text_normalized,
    }
}

fn sha256(bytes: &[u8]) -> String {
    let digest = Sha256::digest(bytes);
    digest.iter().map(|byte| format!("{byte:02x}")).collect()
}

#[cfg(unix)]
pub(crate) fn physical_identity(path: &str, metadata: &std::fs::Metadata) -> String {
    use std::os::unix::fs::MetadataExt;
    if metadata.dev() != 0 || metadata.ino() != 0 {
        format!("{}:{}", metadata.dev(), metadata.ino())
    } else {
        path.to_owned()
    }
}

#[cfg(not(unix))]
fn physical_identity(path: &str, _metadata: &std::fs::Metadata) -> String {
    path.to_lowercase()
}

#[cfg(unix)]
fn executable(metadata: &std::fs::Metadata) -> bool {
    use std::os::unix::fs::PermissionsExt;
    metadata.permissions().mode() & 0o111 != 0
}

#[cfg(not(unix))]
fn executable(_metadata: &std::fs::Metadata) -> bool {
    false
}
