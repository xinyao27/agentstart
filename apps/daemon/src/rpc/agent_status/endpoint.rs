use std::path::Path;
use std::time::{Duration, SystemTime};

use crate::transport::secure_file;

pub(super) fn write(root: &Path, environment: &[(String, String)]) -> Option<String> {
    if environment.is_empty() {
        return None;
    }
    let mut contents = String::new();
    for (key, value) in environment {
        if !matches!(
            key.as_str(),
            "YIRU_AGENT_HOOK_PORT"
                | "YIRU_AGENT_HOOK_TOKEN"
                | "YIRU_AGENT_HOOK_ENV"
                | "YIRU_AGENT_HOOK_VERSION"
        ) || value.is_empty()
            || !value.bytes().all(|byte| {
                byte.is_ascii_alphanumeric() || matches!(byte, b'.' | b'_' | b':' | b'/' | b'-')
            })
        {
            eprintln!(
                "[agent-hooks] endpoint contains an unsafe shell value; using direct environment"
            );
            return None;
        }
        if cfg!(windows) {
            contents.push_str("set ");
        }
        contents.push_str(key);
        contents.push('=');
        contents.push_str(value);
        contents.push_str(if cfg!(windows) { "\r\n" } else { "\n" });
    }
    let directory = root.join("agent-hooks");
    let name = if cfg!(windows) {
        "endpoint.cmd"
    } else {
        "endpoint.env"
    };
    let path = directory.join(name);
    let Some(path_string) = path.to_str() else {
        eprintln!("[agent-hooks] endpoint path is not UTF-8; using direct environment");
        return None;
    };
    if let Err(error) = secure_file::write_bytes(&path, contents.as_bytes()) {
        eprintln!("[agent-hooks] endpoint write failed; using direct environment: {error}");
        return None;
    }
    sweep_staging_files(&directory, name);
    // Why: keep the file on shutdown, as Bun does. Removing it can race another
    // instance; the next startup atomically replaces its dead endpoint.
    Some(path_string.to_owned())
}

fn sweep_staging_files(directory: &Path, name: &str) {
    let Ok(entries) = std::fs::read_dir(directory) else {
        return;
    };
    let Some(cutoff) = SystemTime::now().checked_sub(Duration::from_secs(300)) else {
        return;
    };
    let prefix = format!("{name}.");
    for entry in entries.flatten() {
        let filename = entry.file_name();
        let filename = filename.to_string_lossy();
        if !filename.ends_with(".tmp")
            || !(filename.starts_with(&prefix) || filename.starts_with(".endpoint-"))
        {
            continue;
        }
        if entry
            .metadata()
            .ok()
            .and_then(|metadata| metadata.modified().ok())
            .is_some_and(|modified| modified < cutoff)
        {
            let _ = std::fs::remove_file(entry.path());
        }
    }
}
