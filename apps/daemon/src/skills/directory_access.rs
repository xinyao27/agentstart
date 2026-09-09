use std::path::{Path, PathBuf};

use serde_json::{Value, json};
use tokio::fs;
use tokio::io::AsyncReadExt;

use crate::host_registry::HostRegistry;
use crate::hosts::HostKind;

const BINARY_SNIFF_BYTES: usize = 8 * 1_024;
const MAX_DIRECTORY_DEPTH: usize = 6;
const MAX_DIRECTORY_FILES: usize = 500;
const MAX_READ_BYTES: usize = 512 * 1_024;
const SKILL_FILE: &str = "SKILL.md";

pub(super) async fn list(hosts: &HostRegistry, directory: &str) -> Value {
    let Ok(Some(root)) = skill_root(hosts, directory).await else {
        return json!({"ok":false,"reason":"invalid-path"});
    };
    let mut files = Vec::new();
    let mut stack = vec![(root.clone(), 1_usize)];
    let mut truncated = false;
    while let Some((current, depth)) = stack.pop() {
        if depth > MAX_DIRECTORY_DEPTH {
            truncated = true;
            continue;
        }
        let mut directory = match fs::read_dir(&current).await {
            Ok(directory) => directory,
            Err(_) => continue,
        };
        let mut children = Vec::new();
        loop {
            let entry = match directory.next_entry().await {
                Ok(Some(entry)) => entry,
                Ok(None) => break,
                Err(_) => break,
            };
            if files.len() >= MAX_DIRECTORY_FILES {
                truncated = true;
                break;
            }
            let kind = match entry.file_type().await {
                Ok(kind) => kind,
                Err(_) => continue,
            };
            let path = entry.path();
            if kind.is_dir() {
                children.push(path);
                continue;
            }
            // Why: the read endpoint rejects links that escape the package, so
            // advertising symlinks here would produce entries that can only fail.
            if !kind.is_file() {
                continue;
            }
            let size = fs::metadata(&path)
                .await
                .map_or(0, |metadata| metadata.len());
            let Ok(relative) = path.strip_prefix(&root) else {
                continue;
            };
            files.push(json!({
                "relativePath": relative.to_string_lossy().replace(std::path::MAIN_SEPARATOR, "/"),
                "size": size
            }));
        }
        children.sort_unstable();
        stack.extend(children.into_iter().rev().map(|path| (path, depth + 1)));
    }
    files.sort_by(|left, right| {
        let left = left
            .get("relativePath")
            .and_then(Value::as_str)
            .unwrap_or("");
        let right = right
            .get("relativePath")
            .and_then(Value::as_str)
            .unwrap_or("");
        (left != SKILL_FILE)
            .cmp(&(right != SKILL_FILE))
            .then_with(|| left.to_lowercase().cmp(&right.to_lowercase()))
            .then_with(|| left.cmp(right))
    });
    json!({"ok":true,"files":files,"truncated":truncated})
}

pub(super) async fn read(hosts: &HostRegistry, directory: &str, relative: &str) -> Value {
    if relative.is_empty() || Path::new(relative).is_absolute() {
        return json!({"ok":false,"reason":"invalid-path"});
    }
    let Ok(Some(root)) = skill_root(hosts, directory).await else {
        return json!({"ok":false,"reason":"invalid-path"});
    };
    let unresolved = root.join(relative);
    if escapes_lexically(&root, &unresolved) {
        return json!({"ok":false,"reason":"invalid-path"});
    }
    // Why: a lexically safe child may still be a symlink to an arbitrary file.
    // Canonicalize and enforce the package boundary again before opening it.
    let target = match fs::canonicalize(&unresolved).await {
        Ok(target) if target.starts_with(&root) => target,
        Ok(_) => return json!({"ok":false,"reason":"invalid-path"}),
        Err(_) => return json!({"ok":false,"reason":"unreadable"}),
    };
    let metadata = match fs::metadata(&target).await {
        Ok(metadata) if metadata.is_file() => metadata,
        Ok(_) => return json!({"ok":false,"reason":"invalid-path"}),
        Err(_) => return json!({"ok":false,"reason":"unreadable"}),
    };
    let file = match fs::File::open(&target).await {
        Ok(file) => file,
        Err(_) => return json!({"ok":false,"reason":"unreadable"}),
    };
    let read_limit = u64::try_from(MAX_READ_BYTES.saturating_add(1)).unwrap_or(u64::MAX);
    let capacity = usize::try_from(metadata.len().min(read_limit)).unwrap_or(MAX_READ_BYTES + 1);
    let mut bytes = Vec::with_capacity(capacity);
    if file.take(read_limit).read_to_end(&mut bytes).await.is_err() {
        return json!({"ok":false,"reason":"unreadable"});
    }
    if bytes.iter().take(BINARY_SNIFF_BYTES).any(|byte| *byte == 0) {
        return json!({"ok":false,"reason":"binary"});
    }
    let truncated = bytes.len() > MAX_READ_BYTES;
    bytes.truncate(MAX_READ_BYTES);
    json!({"ok":true,"content":String::from_utf8_lossy(&bytes),"truncated":truncated})
}

async fn skill_root(hosts: &HostRegistry, directory: &str) -> Result<Option<PathBuf>, ()> {
    let host = hosts.execution_host("local").await.map_err(|_| ())?;
    if host.kind() != HostKind::Local || !Path::new(directory).is_absolute() {
        return Ok(None);
    }
    let root = fs::canonicalize(directory).await.map_err(|_| ())?;
    let metadata = fs::metadata(root.join(SKILL_FILE)).await.map_err(|_| ())?;
    Ok(metadata.is_file().then_some(root))
}

fn escapes_lexically(root: &Path, candidate: &Path) -> bool {
    let Ok(relative) = candidate.strip_prefix(root) else {
        return true;
    };
    let mut depth = 0_usize;
    for component in relative.components() {
        match component {
            std::path::Component::Normal(_) => depth = depth.saturating_add(1),
            std::path::Component::CurDir => {}
            std::path::Component::ParentDir if depth > 0 => depth -= 1,
            std::path::Component::ParentDir
            | std::path::Component::Prefix(_)
            | std::path::Component::RootDir => return true,
        }
    }
    false
}
