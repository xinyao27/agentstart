use std::collections::{HashMap, HashSet};
use std::sync::Arc;
use std::sync::atomic::{AtomicU64, Ordering};
use std::time::{Duration, Instant};

use tokio::sync::Mutex;

use crate::hosts::{
    ExecutionHost, HostCommand, HostCommandErrorKind, HostFileKind, HostFilesystem,
};

use super::model::MarkdownDocument;
use super::{FilesError, path};

const LIST_OUTPUT_LIMIT: usize = 64 * 1_024 * 1_024;
const LIST_TIMEOUT_MS: u64 = 10_000;
const DIRECTORY_WALK_FILE_LIMIT: usize = 10_000;
const CACHE_TTL: Duration = Duration::from_secs(30);
const CACHE_ENTRIES: usize = 8;

const BLOCKED_SEGMENTS: &[&str] = &[
    ".git",
    ".next",
    ".nuxt",
    ".cache",
    ".stably",
    ".vscode",
    ".idea",
    ".yarn",
    ".pnpm-store",
    ".terraform",
    ".docker",
    ".husky",
    ".npm",
    ".npm-global",
    ".gvfs",
    "node_modules",
];

#[derive(Clone)]
pub(super) struct InventoryCache {
    entries: Arc<Mutex<HashMap<(String, String), CachedInventory>>>,
    generation: Arc<AtomicU64>,
}

#[derive(Clone)]
struct CachedInventory {
    expires_at: Instant,
    paths: Vec<String>,
    sequence: u64,
    total_count: usize,
    truncated: bool,
}

impl InventoryCache {
    pub(super) fn new() -> Self {
        Self {
            entries: Arc::new(Mutex::new(HashMap::new())),
            generation: Arc::new(AtomicU64::new(0)),
        }
    }

    pub(super) async fn mobile(
        &self,
        host: Arc<dyn ExecutionHost>,
        root: &str,
    ) -> Result<(Vec<String>, usize, bool), FilesError> {
        let key = (host.id().to_owned(), root.to_owned());
        {
            let entries = self.entries.lock().await;
            if let Some(entry) = entries.get(&key)
                && entry.expires_at > Instant::now()
            {
                return Ok((entry.paths.clone(), entry.total_count, entry.truncated));
            }
        }
        let generation = self.generation.load(Ordering::Acquire);
        let mut paths = list(host, root, &[], Some(20_001)).await?;
        paths.sort_by(|left, right| path::locale_compare(left, right));
        let total_count = paths.len();
        let truncated = total_count > 20_000;
        let paths = paths.into_iter().take(20_000).collect::<Vec<_>>();
        if self.generation.load(Ordering::Acquire) != generation {
            return Ok((paths, total_count, truncated));
        }
        let mut entries = self.entries.lock().await;
        if self.generation.load(Ordering::Acquire) != generation {
            return Ok((paths, total_count, truncated));
        }
        let sequence = entries
            .values()
            .map(|entry| entry.sequence)
            .max()
            .unwrap_or(0)
            .saturating_add(1);
        entries.insert(
            key,
            CachedInventory {
                expires_at: Instant::now() + CACHE_TTL,
                paths: paths.clone(),
                sequence,
                total_count,
                truncated,
            },
        );
        while entries.len() > CACHE_ENTRIES {
            let Some(oldest) = entries
                .iter()
                .min_by_key(|(_, entry)| entry.sequence)
                .map(|(key, _)| key.clone())
            else {
                break;
            };
            entries.remove(&oldest);
        }
        Ok((paths, total_count, truncated))
    }

    pub(super) async fn invalidate(&self, host_id: &str, root: &str) {
        self.generation.fetch_add(1, Ordering::AcqRel);
        self.entries
            .lock()
            .await
            .remove(&(host_id.to_owned(), root.to_owned()));
    }
}

pub(super) async fn list(
    host: Arc<dyn ExecutionHost>,
    root: &str,
    exclude_paths: &[String],
    maximum: Option<usize>,
) -> Result<Vec<String>, FilesError> {
    let filesystem = HostFilesystem::new(host.clone());
    let exclude = exclude_prefixes(&filesystem, root, exclude_paths);
    let mut files = HashSet::new();
    for include_ignored in [false, true] {
        let mut args = vec!["--files".to_owned(), "--hidden".to_owned()];
        if include_ignored {
            args.push("--no-ignore-vcs".to_owned());
        }
        for segment in BLOCKED_SEGMENTS {
            args.extend(["--glob".to_owned(), format!("!**/{segment}")]);
        }
        args.extend(["--glob".to_owned(), "!**/.local/share".to_owned()]);
        for prefix in &exclude {
            let prefix = escape_glob_path(prefix);
            args.extend(["--glob".to_owned(), format!("!{prefix}")]);
            args.extend(["--glob".to_owned(), format!("!{prefix}/**")]);
        }
        args.extend(["--".to_owned(), ".".to_owned()]);
        let mut command = HostCommand::new("rg", args);
        command.cwd = Some(root.to_owned());
        command.max_output_bytes = Some(LIST_OUTPUT_LIMIT);
        command.timeout_ms = Some(LIST_TIMEOUT_MS);
        let output = match host.exec(command).await {
            Ok(output)
                if matches!(output.exit_code, 0 | 1)
                    || (output.exit_code == 2
                        && output
                            .stdout
                            .lines()
                            .any(|line| !normalize_inventory_path(line).is_empty())) =>
            {
                output.stdout
            }
            Ok(output) if !include_ignored && output.exit_code == 127 => {
                return list_with_git(host, root, &exclude, maximum).await;
            }
            Err(error) if !include_ignored && error.kind() == HostCommandErrorKind::Spawn => {
                return list_with_git(host, root, &exclude, maximum).await;
            }
            Ok(_) | Err(_) => return Err(FilesError::CommandFailed("list files")),
        };
        for line in output.lines() {
            let relative = normalize_inventory_path(line);
            if relative.is_empty() || !is_included(&relative) || is_excluded(&relative, &exclude) {
                continue;
            }
            files.insert(relative);
            if maximum.is_some_and(|limit| files.len() >= limit) {
                break;
            }
        }
        if maximum.is_some_and(|limit| files.len() >= limit) {
            break;
        }
    }
    let mut files = files.into_iter().collect::<Vec<_>>();
    files.sort_unstable();
    if let Some(maximum) = maximum {
        files.truncate(maximum);
    }
    Ok(files)
}

async fn list_with_git(
    host: Arc<dyn ExecutionHost>,
    root: &str,
    exclude: &[String],
    maximum: Option<usize>,
) -> Result<Vec<String>, FilesError> {
    let mut files = HashSet::new();
    for mut args in [
        Vec::from(
            [
                "ls-files",
                "-z",
                "--cached",
                "--others",
                "--exclude-standard",
            ]
            .map(str::to_owned),
        ),
        Vec::from(
            [
                "ls-files",
                "-z",
                "--others",
                "--ignored",
                "--exclude-standard",
            ]
            .map(str::to_owned),
        ),
    ] {
        if !exclude.is_empty() {
            args.extend(["--".to_owned(), ".".to_owned()]);
            for prefix in exclude {
                args.push(format!(":(exclude,glob){}", escape_glob_path(prefix)));
                args.push(format!(":(exclude,glob){}/**", escape_glob_path(prefix)));
            }
        }
        let mut command = HostCommand::new("git", args);
        command.capture_stdout_bytes = true;
        command.cwd = Some(root.to_owned());
        command.max_output_bytes = Some(LIST_OUTPUT_LIMIT);
        command.timeout_ms = Some(LIST_TIMEOUT_MS);
        let output = match host.exec(command).await {
            Ok(output) if output.exit_code == 0 => output,
            _ if files.is_empty() => {
                return list_with_directory_walk(host, root, exclude, maximum).await;
            }
            _ => break,
        };
        let bytes = output.stdout_bytes.unwrap_or_default();
        if !bytes.is_empty() && bytes.last() != Some(&0) {
            return Err(FilesError::Protocol(
                "git file listing was not NUL terminated",
            ));
        }
        for value in bytes.split(|byte| *byte == 0) {
            if value.is_empty() {
                continue;
            }
            let value = normalize_inventory_path(&String::from_utf8_lossy(value));
            if is_included(&value) && !is_excluded(&value, exclude) {
                files.insert(value);
            }
            if maximum.is_some_and(|limit| files.len() >= limit) {
                break;
            }
        }
        if maximum.is_some_and(|limit| files.len() >= limit) {
            break;
        }
    }
    let mut files = files.into_iter().collect::<Vec<_>>();
    files.sort_unstable();
    if let Some(maximum) = maximum {
        files.truncate(maximum);
    }
    Ok(files)
}

async fn list_with_directory_walk(
    host: Arc<dyn ExecutionHost>,
    root: &str,
    exclude: &[String],
    maximum: Option<usize>,
) -> Result<Vec<String>, FilesError> {
    let filesystem = HostFilesystem::new(host);
    let mut directories = vec![root.to_owned()];
    let mut files = Vec::new();
    let deadline = Instant::now() + Duration::from_millis(LIST_TIMEOUT_MS);
    while let Some(directory) = directories.pop() {
        if Instant::now() > deadline {
            return Err(FilesError::CommandFailed("file listing timed out"));
        }
        let mut entries = match filesystem.read_dir(&directory).await {
            Ok(entries) => entries,
            Err(_) => continue,
        };
        entries.sort_unstable_by(|left, right| left.name.cmp(&right.name));
        for entry in entries.into_iter().rev() {
            let absolute = filesystem.paths().join(&[&directory, &entry.name]);
            let relative = normalize_inventory_path(
                &filesystem
                    .paths()
                    .relative(root, &absolute)
                    .replace('\\', "/"),
            );
            if relative.is_empty() || is_excluded(&relative, exclude) {
                continue;
            }
            match entry.kind {
                HostFileKind::Directory if is_included(&relative) => directories.push(absolute),
                HostFileKind::File if is_included(&relative) => {
                    if files.len() >= DIRECTORY_WALK_FILE_LIMIT {
                        return Err(FilesError::CommandFailed(
                            "file listing exceeded traversal budget",
                        ));
                    }
                    files.push(relative);
                    if maximum.is_some_and(|limit| files.len() >= limit) {
                        files.sort_unstable();
                        return Ok(files);
                    }
                }
                _ => {}
            }
        }
    }
    files.sort_unstable();
    Ok(files)
}

pub(super) fn rank(paths: &[String], query: &str, limit: usize) -> (Vec<String>, usize) {
    let query = query.trim().to_lowercase();
    if query.is_empty() {
        return (paths.iter().take(limit).cloned().collect(), paths.len());
    }
    let mut prefix = Vec::new();
    let mut substring = Vec::new();
    let mut total = 0;
    for value in paths {
        let lower = value.to_lowercase();
        let name = lower.rsplit('/').next().unwrap_or(&lower);
        if lower.starts_with(&query) || name.starts_with(&query) {
            total += 1;
            if prefix.len() < limit {
                prefix.push(value.clone());
            }
        } else if lower.contains(&query) {
            total += 1;
            if substring.len() < limit {
                substring.push(value.clone());
            }
        }
    }
    prefix.extend(substring);
    prefix.truncate(limit);
    (prefix, total)
}

pub(super) async fn markdown_documents(
    host: Arc<dyn ExecutionHost>,
    root: &str,
) -> Result<Vec<MarkdownDocument>, FilesError> {
    let filesystem = HostFilesystem::new(host);
    let mut pending = vec![root.to_owned()];
    let mut documents = Vec::new();
    while let Some(directory) = pending.pop() {
        let entries = filesystem.read_dir(&directory).await?;
        for entry in entries.into_iter().rev() {
            let entry_path = filesystem.paths().join(&[&directory, &entry.name]);
            match entry.kind {
                HostFileKind::Directory if should_visit_markdown_directory(&entry.name) => {
                    pending.push(entry_path);
                }
                HostFileKind::File if path::is_markdown(&entry.name) => {
                    let relative_path = filesystem
                        .paths()
                        .relative(root, &entry_path)
                        .replace('\\', "/");
                    let basename = entry.name;
                    let name = basename
                        .rsplit_once('.')
                        .map_or_else(|| basename.clone(), |(name, _)| name.to_owned());
                    documents.push(MarkdownDocument {
                        basename,
                        file_path: entry_path,
                        name,
                        relative_path,
                    });
                }
                _ => {}
            }
        }
    }
    documents
        .sort_by(|left, right| path::locale_compare(&left.relative_path, &right.relative_path));
    Ok(documents)
}

fn exclude_prefixes(
    filesystem: &HostFilesystem,
    root: &str,
    exclude_paths: &[String],
) -> Vec<String> {
    exclude_paths
        .iter()
        .filter_map(|value| {
            let relative = filesystem.paths().relative(root, value).replace('\\', "/");
            (!relative.is_empty()
                && !relative.starts_with('/')
                && !relative.split('/').any(|part| part == ".."))
            .then(|| relative.trim_end_matches('/').to_owned())
        })
        .collect()
}

fn normalize_inventory_path(value: &str) -> String {
    value
        .trim_start_matches("./")
        .replace('\\', "/")
        .trim_start_matches('/')
        .to_owned()
}

fn is_included(path: &str) -> bool {
    if path == ".local/share" || path.starts_with(".local/share/") {
        return false;
    }
    !path
        .split('/')
        .any(|segment| BLOCKED_SEGMENTS.contains(&segment))
}

fn is_excluded(path: &str, exclude: &[String]) -> bool {
    exclude
        .iter()
        .any(|prefix| path == prefix || path.starts_with(&format!("{prefix}/")))
}

fn should_visit_markdown_directory(name: &str) -> bool {
    name != ".git" && name != "node_modules" && (!name.starts_with('.') || name == ".github")
}

fn escape_glob_path(value: &str) -> String {
    let mut escaped = String::with_capacity(value.len());
    for character in value.chars() {
        if matches!(character, '*' | '?' | '[' | ']' | '{' | '}' | '\\') {
            escaped.push('\\');
        }
        escaped.push(character);
    }
    escaped
}
