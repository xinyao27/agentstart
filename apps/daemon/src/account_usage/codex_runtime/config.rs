use std::collections::{HashMap, HashSet};
use std::fs;
use std::path::{Path, PathBuf};

use serde_json::Value;
use sha2::{Digest, Sha256};

use super::{CodexRuntimeError, ManagedCodexAccount, managed_files};
use crate::agent_status_hooks::codex_managed_hook_command;

const CONFIG_BYTE_LIMIT: u64 = 16 * 1024 * 1024;
const PATH_KEYS: &[&str] = &[
    "debug.config_lockfile.export_dir",
    "debug.config_lockfile.load_path",
    "experimental_compact_prompt_file",
    "experimental_instructions_file",
    "log_dir",
    "model_catalog_json",
    "model_instructions_file",
    "skills.config.path",
    "sqlite_home",
];
const HOOK_EVENTS: &[&str] = &[
    "session_start",
    "user_prompt_submit",
    "pre_tool_use",
    "permission_request",
    "post_tool_use",
    "subagent_start",
    "subagent_stop",
    "stop",
];
const PROMOTED_SETTINGS: &[&str] = &[
    "model",
    "model_reasoning_effort",
    "approval_policy",
    "sandbox_mode",
];

pub(super) struct CanonicalConfig {
    contents: String,
    source_home: String,
    source_hooks: String,
}

#[derive(Clone, Copy, Default)]
struct ScanState {
    array_depth: usize,
    multiline_basic: bool,
    multiline_literal: bool,
}

struct ParsedString {
    end: usize,
    start: usize,
    value: String,
}

struct TomlBlock<'a> {
    header: &'a str,
    text: &'a str,
}

pub(super) fn sync_all(root: &Path, user_data_path: &Path, accounts: &[ManagedCodexAccount]) {
    for account in accounts {
        if let Err(error) = sync_account(root, user_data_path, account, false) {
            eprintln!(
                "[codex-accounts] failed to sync config for {}: {error}",
                account.id
            );
        }
    }
}

pub(super) fn sync_account(
    root: &Path,
    user_data_path: &Path,
    account: &ManagedCodexAccount,
    reject_custom_provider: bool,
) -> Result<(), CodexRuntimeError> {
    account.validate(root)?;
    let (source_fs_home, logical_source_home) = canonical_homes(account)?;
    if reject_custom_provider && let Some(canonical) = read_canonical(account)? {
        assert_oauth_allowed(&canonical)?;
    }
    if let Err(error) = promote_runtime_settings(&account.host_path, &source_fs_home) {
        eprintln!("[codex-settings-promotion] failed to promote runtime settings: {error}");
        return Ok(());
    }
    let target = account.host_path.join("config.toml");
    let canonical = read_canonical(account)?;
    if canonical.is_none() && read_managed_text(&target)?.is_none() {
        snapshot_settings(&account.host_path)?;
        return Ok(());
    }
    let canonical = canonical.unwrap_or_else(|| CanonicalConfig {
        contents: String::new(),
        source_hooks: logical_join(&logical_source_home, "hooks.json"),
        source_home: logical_source_home,
    });
    let source_home = PathBuf::from(&canonical.source_home);
    let command = codex_managed_hook_command(
        crate::paths::resolve_local_home_path()
            .as_deref()
            .unwrap_or(source_home.as_path()),
    );
    let normalized = normalize_deprecated_hook_feature(&canonical.contents);
    let sanitized = strip_owned_hook_trust(
        &normalized,
        &canonical.source_home,
        &canonical.source_hooks,
        &command,
        user_data_path,
    );
    let rewritten = rewrite_relative_paths(&sanitized, &canonical.source_home);
    let existing = read_managed_text(&target)?.unwrap_or_default();
    let merged = merge_canonical_into_managed(&existing, &rewritten);
    write_if_changed(&target, &merged)?;
    snapshot_settings(&account.host_path)
}

pub(super) fn sync_runtime_from_home(
    source_home: &Path,
    logical_source_home: &str,
    runtime_home: &Path,
    user_data_path: &Path,
) -> Result<(), CodexRuntimeError> {
    if let Err(error) = promote_runtime_settings(runtime_home, source_home) {
        eprintln!("[codex-settings-promotion] failed to promote runtime settings: {error}");
        return Ok(());
    }
    let target = runtime_home.join("config.toml");
    let contents = read_source_text(&source_home.join("config.toml"))?;
    if contents.is_none() && read_managed_text(&target)?.is_none() {
        snapshot_settings(runtime_home)?;
        return Ok(());
    }
    let contents = contents.unwrap_or_default();
    let command_home =
        crate::paths::resolve_local_home_path().unwrap_or_else(|| source_home.into());
    let command = codex_managed_hook_command(&command_home);
    let hooks = logical_join(logical_source_home, "hooks.json");
    let normalized = normalize_deprecated_hook_feature(&contents);
    let sanitized = strip_owned_hook_trust(
        &normalized,
        logical_source_home,
        &hooks,
        &command,
        user_data_path,
    );
    let rewritten = rewrite_relative_paths(&sanitized, logical_source_home);
    let existing = read_managed_text(&target)?.unwrap_or_default();
    let merged = merge_canonical_into_managed(&existing, &rewritten);
    write_if_changed(&target, &merged)?;
    snapshot_settings(runtime_home)
}

fn read_canonical(
    account: &ManagedCodexAccount,
) -> Result<Option<CanonicalConfig>, CodexRuntimeError> {
    let (home, logical_home) = canonical_homes(account)?;
    let Some(contents) = read_source_text(&home.join("config.toml"))? else {
        return Ok(None);
    };
    Ok(Some(CanonicalConfig {
        contents,
        source_hooks: logical_join(&logical_home, "hooks.json"),
        source_home: logical_home,
    }))
}

fn canonical_homes(account: &ManagedCodexAccount) -> Result<(PathBuf, String), CodexRuntimeError> {
    if account.runtime == "wsl" {
        let linux_home = account
            .linux_path
            .as_deref()
            .and_then(|path| path.split("/.local/share/yiru/codex-accounts/").next())
            .filter(|path| path.starts_with('/'))
            .ok_or(CodexRuntimeError::InvalidManagedHome)?;
        let distro = account
            .wsl_distro
            .as_deref()
            .ok_or(CodexRuntimeError::InvalidManagedHome)?;
        Ok((
            PathBuf::from(format!("//wsl.localhost/{distro}{linux_home}/.codex")),
            format!("{linux_home}/.codex"),
        ))
    } else {
        let Some(home) = crate::paths::resolve_local_home_path() else {
            return Err(CodexRuntimeError::InvalidConfig);
        };
        let home = home.join(".codex");
        Ok((home.clone(), home.to_string_lossy().into_owned()))
    }
}

fn assert_oauth_allowed(config: &CanonicalConfig) -> Result<(), CodexRuntimeError> {
    match top_level_model_provider(&config.contents).as_deref() {
        None | Some("openai") => Ok(()),
        Some(_) => Err(CodexRuntimeError::CustomProvider),
    }
}

fn read_managed_text(path: &Path) -> Result<Option<String>, CodexRuntimeError> {
    decode_text(managed_files::read_bounded(path, CONFIG_BYTE_LIMIT)?)
}

fn read_source_text(path: &Path) -> Result<Option<String>, CodexRuntimeError> {
    decode_text(managed_files::read_bounded_source(path, CONFIG_BYTE_LIMIT)?)
}

fn decode_text(contents: Option<Vec<u8>>) -> Result<Option<String>, CodexRuntimeError> {
    contents
        .map(|contents| String::from_utf8(contents).map_err(|_| CodexRuntimeError::InvalidConfig))
        .transpose()
}

fn write_if_changed(path: &Path, contents: &str) -> Result<(), CodexRuntimeError> {
    if read_managed_text(path)?.as_deref() == Some(contents) {
        return Ok(());
    }
    managed_files::write_private(path, contents.as_bytes())?;
    Ok(())
}

fn promote_runtime_settings(
    runtime_home: &Path,
    system_home: &Path,
) -> Result<bool, CodexRuntimeError> {
    let baseline_path = runtime_home.join(".yiru-config-settings-baseline.json");
    let Some(baseline) = read_settings_baseline(&baseline_path) else {
        return Ok(true);
    };
    let runtime = read_managed_text(&runtime_home.join("config.toml"))?
        .map(|contents| top_level_settings(&contents))
        .unwrap_or_default();
    let system_path = system_home.join("config.toml");
    let target = resolve_config_write_target(&system_path)?;
    let snapshot = managed_files::read_preserving_snapshot(target, CONFIG_BYTE_LIMIT)?;
    let system_contents = String::from_utf8(snapshot.contents().to_vec())
        .map_err(|_| CodexRuntimeError::InvalidConfig)?;
    let system = top_level_settings(&system_contents);
    let mut updates = HashMap::new();
    for key in PROMOTED_SETTINGS {
        let Some((runtime_value, false)) = runtime.get(*key) else {
            continue;
        };
        if baseline.get(*key) == Some(runtime_value) {
            continue;
        }
        let system_value = system.get(*key);
        if system_value.is_some_and(|(_, multiline)| *multiline)
            || system_value.map(|(value, _)| value) != baseline.get(*key)
        {
            continue;
        }
        updates.insert((*key).to_owned(), runtime_value.clone());
    }
    if updates.is_empty() {
        return Ok(true);
    }
    let next = upsert_top_level_settings(&system_contents, &updates);
    write_preserving_mode(snapshot, next.as_bytes())?;
    Ok(true)
}

fn snapshot_settings(runtime_home: &Path) -> Result<(), CodexRuntimeError> {
    let settings = read_managed_text(&runtime_home.join("config.toml"))?
        .map(|contents| {
            top_level_settings(&contents)
                .into_iter()
                .filter_map(|(key, (value, multiline))| {
                    (!multiline).then_some((key, Value::String(value)))
                })
                .collect::<serde_json::Map<_, _>>()
        })
        .unwrap_or_default();
    let value = Value::Object(serde_json::Map::from_iter([
        ("version".to_owned(), Value::from(1)),
        ("settings".to_owned(), Value::Object(settings)),
    ]));
    let mut bytes =
        serde_json::to_vec_pretty(&value).map_err(|_| CodexRuntimeError::InvalidConfig)?;
    bytes.push(b'\n');
    let path = runtime_home.join(".yiru-config-settings-baseline.json");
    if managed_files::read_bounded(&path, CONFIG_BYTE_LIMIT)?
        .is_some_and(|current| current == bytes)
    {
        return Ok(());
    }
    managed_files::write_private(&path, &bytes)?;
    Ok(())
}

fn read_settings_baseline(path: &Path) -> Option<HashMap<String, String>> {
    let bytes = managed_files::read_bounded(path, CONFIG_BYTE_LIMIT)
        .ok()
        .flatten()?;
    let value = serde_json::from_slice::<Value>(&bytes).ok()?;
    if value.get("version").and_then(Value::as_u64) != Some(1) {
        return None;
    }
    Some(
        value
            .get("settings")?
            .as_object()?
            .iter()
            .filter_map(|(key, value)| value.as_str().map(|value| (key.clone(), value.to_owned())))
            .collect::<HashMap<_, _>>(),
    )
}

fn top_level_settings(contents: &str) -> HashMap<String, (String, bool)> {
    let mut output = HashMap::new();
    let mut state = ScanState::default();
    for line in contents.lines() {
        if is_structural(state) {
            if table_header(line).is_some() {
                break;
            }
            if let Some(equals) = structural_equals(line) {
                let key = line[..equals].trim();
                if PROMOTED_SETTINGS.contains(&key) {
                    let raw = line[equals + 1..].trim().trim_end_matches('\r').to_owned();
                    let next = update_state(state, line);
                    output.insert(key.to_owned(), (raw, !is_structural(next)));
                    state = next;
                    continue;
                }
            }
        }
        state = update_state(state, line);
    }
    output
}

fn upsert_top_level_settings(contents: &str, updates: &HashMap<String, String>) -> String {
    let uses_crlf = contents.contains("\r\n");
    let mut lines = contents.split('\n').map(str::to_owned).collect::<Vec<_>>();
    let mut state = ScanState::default();
    let mut preamble_end = lines.len();
    let mut found = HashSet::new();
    for (index, line) in lines.iter_mut().enumerate() {
        if !is_structural(state) {
            state = update_state(state, line);
            continue;
        }
        if table_header(line).is_some() {
            preamble_end = index;
            break;
        }
        if let Some(equals) = structural_equals(line) {
            let key = line[..equals].trim().to_owned();
            if let Some(value) = updates.get(&key) {
                let carriage = if line.ends_with('\r') { "\r" } else { "" };
                *line = format!("{key} = {value}{carriage}");
                found.insert(key);
            }
        }
        state = update_state(state, line);
    }
    let mut insertions = updates
        .iter()
        .filter(|(key, _)| !found.contains(*key))
        .map(|(key, value)| format!("{key} = {value}{}", if uses_crlf { "\r" } else { "" }))
        .collect::<Vec<_>>();
    insertions.sort();
    if !insertions.is_empty() {
        let mut at = preamble_end;
        while at > 0 && lines[at - 1].trim().is_empty() {
            at -= 1;
        }
        if at == preamble_end && preamble_end < lines.len() {
            insertions.push(if uses_crlf {
                "\r".to_owned()
            } else {
                String::new()
            });
        }
        lines.splice(at..at, insertions);
    }
    let mut output = lines.join("\n");
    if !output.is_empty() && !output.ends_with('\n') {
        output.push_str(if uses_crlf { "\r\n" } else { "\n" });
    }
    output
}

fn resolve_config_write_target(path: &Path) -> Result<PathBuf, CodexRuntimeError> {
    let mut current = path.to_owned();
    let mut visited = HashSet::new();
    loop {
        let lookup = normalize_home_key(&current.to_string_lossy());
        if !visited.insert(lookup) {
            return Err(CodexRuntimeError::InvalidConfig);
        }
        match fs::symlink_metadata(&current) {
            Ok(metadata) if metadata.file_type().is_symlink() => {
                let target = fs::read_link(&current)?;
                current = if target.is_absolute() {
                    target
                } else {
                    current
                        .parent()
                        .ok_or(CodexRuntimeError::InvalidConfig)?
                        .join(target)
                };
            }
            Ok(_) => return resolve_config_parent(&current),
            Err(error) if error.kind() == std::io::ErrorKind::NotFound => {
                return resolve_config_parent(&current);
            }
            Err(error) => return Err(error.into()),
        }
    }
}

fn resolve_config_parent(path: &Path) -> Result<PathBuf, CodexRuntimeError> {
    let name = path.file_name().ok_or(CodexRuntimeError::InvalidConfig)?;
    let parent = path.parent().ok_or(CodexRuntimeError::InvalidConfig)?;
    let canonical_parent = match fs::canonicalize(parent) {
        Ok(parent) => parent,
        Err(error) if error.kind() == std::io::ErrorKind::NotFound => {
            create_config_parent(parent)?;
            fs::canonicalize(parent)?
        }
        Err(error) => return Err(error.into()),
    };
    let metadata = fs::symlink_metadata(&canonical_parent)?;
    if metadata.file_type().is_symlink() || !metadata.is_dir() {
        return Err(CodexRuntimeError::InvalidConfig);
    }
    Ok(canonical_parent.join(name))
}

fn write_preserving_mode(
    snapshot: managed_files::PreservingFileSnapshot,
    contents: &[u8],
) -> Result<(), CodexRuntimeError> {
    managed_files::write_preserving_file(snapshot, contents)
}

fn create_config_parent(parent: &Path) -> Result<(), CodexRuntimeError> {
    match fs::symlink_metadata(parent) {
        Ok(metadata) if metadata.is_dir() && !metadata.file_type().is_symlink() => return Ok(()),
        Ok(_) => return Err(CodexRuntimeError::InvalidConfig),
        Err(error) if error.kind() == std::io::ErrorKind::NotFound => {}
        Err(error) => return Err(error.into()),
    }
    #[cfg(unix)]
    {
        use std::os::unix::fs::DirBuilderExt as _;

        let mut builder = fs::DirBuilder::new();
        builder.recursive(true).mode(0o700).create(parent)?;
    }
    #[cfg(not(unix))]
    fs::create_dir_all(parent)?;
    let metadata = fs::symlink_metadata(parent)?;
    if metadata.is_dir() && !metadata.file_type().is_symlink() {
        Ok(())
    } else {
        Err(CodexRuntimeError::InvalidConfig)
    }
}

fn merge_canonical_into_managed(existing: &str, canonical: &str) -> String {
    let runtime = deduplicate_project_blocks(toml_blocks(existing));
    let runtime_project_headers = runtime
        .iter()
        .filter_map(|block| project_header_key(block.header, false))
        .collect::<HashSet<_>>();
    let canonical_projects = deduplicate_project_blocks(toml_blocks(canonical));
    let canonical_untrusted = canonical_projects
        .iter()
        .filter(|block| project_trust_level(block.text) == Some("untrusted"))
        .filter_map(|block| project_header_key(block.header, true))
        .collect::<HashSet<_>>();
    let canonical_trusted = canonical_projects
        .iter()
        .filter(|block| project_trust_level(block.text) == Some("trusted"))
        .filter_map(|block| project_header_key(block.header, false))
        .collect::<HashSet<_>>();
    let mut parts = Vec::with_capacity(runtime.len() + 1);
    let canonical = strip_canonical_runtime_sections(canonical, &runtime_project_headers);
    if !canonical.trim().is_empty() {
        parts.push(canonical.trim_matches('\n').to_owned());
    }
    parts.extend(
        runtime
            .into_iter()
            .filter(|block| is_runtime_owned_header(block.header))
            .filter(|block| {
                let Some(revocation_key) = project_header_key(block.header, true) else {
                    return true;
                };
                !canonical_untrusted.contains(&revocation_key)
                    || project_header_key(block.header, false)
                        .is_some_and(|key| canonical_trusted.contains(&key))
            })
            .map(|block| block.text.trim_matches('\n').to_owned())
            .filter(|block| !block.is_empty()),
    );
    if parts.is_empty() {
        String::new()
    } else {
        format!("{}\n", parts.join("\n\n"))
    }
}

fn strip_canonical_runtime_sections(contents: &str, preserved_headers: &HashSet<String>) -> String {
    let blocks = deduplicate_project_blocks(toml_blocks(contents));
    if blocks.is_empty() {
        return contents.to_owned();
    }
    let first = blocks[0].text.as_ptr() as usize - contents.as_ptr() as usize;
    let mut parts = Vec::new();
    let preamble = contents[..first].trim_matches('\n');
    if !preamble.is_empty() {
        parts.push(preamble);
    }
    parts.extend(
        blocks
            .into_iter()
            .filter(|block| !is_hook_trust_header(block.header))
            .filter(|block| {
                project_header_key(block.header, false).is_none_or(|header| {
                    !preserved_headers.contains(&header)
                        || project_trust_level(block.text) == Some("untrusted")
                })
            })
            .map(|block| block.text.trim_matches('\n'))
            .filter(|block| !block.is_empty()),
    );
    if parts.is_empty() {
        String::new()
    } else {
        format!("{}\n", parts.join("\n\n"))
    }
}

fn is_runtime_owned_header(header: &str) -> bool {
    is_hook_trust_header(header) || is_project_header(header)
}

fn is_hook_trust_header(header: &str) -> bool {
    let header = normalize_key(header.trim_matches(['[', ']', ' ', '\t']));
    header == "hooks.state" || header.starts_with("hooks.state.")
}

fn is_project_header(header: &str) -> bool {
    project_path(header).is_some()
}

fn deduplicate_project_blocks<'a>(blocks: Vec<TomlBlock<'a>>) -> Vec<TomlBlock<'a>> {
    let mut deduplicated = Vec::with_capacity(blocks.len());
    let mut project_indexes = HashMap::new();
    for block in blocks {
        let Some(key) = project_header_key(block.header, false) else {
            deduplicated.push(block);
            continue;
        };
        let Some(index) = project_indexes.get(&key).copied() else {
            project_indexes.insert(key, deduplicated.len());
            deduplicated.push(block);
            continue;
        };
        let existing: &TomlBlock<'_> = &deduplicated[index];
        if project_trust_level(existing.text) != Some("untrusted")
            && project_trust_level(block.text) == Some("untrusted")
        {
            deduplicated[index] = block;
        }
    }
    deduplicated
}

fn project_header_key(header: &str, for_revocation: bool) -> Option<String> {
    let path = project_path(header)?;
    Some(if for_revocation {
        normalize_project_revocation(&path)
    } else {
        normalize_project_lookup(&path)
    })
}

fn project_path(header: &str) -> Option<String> {
    let header = table_header(header)?;
    let inner = header.strip_prefix('[')?.strip_suffix(']')?;
    if inner.starts_with('[') || inner.ends_with(']') {
        return None;
    }
    let mut offset = inner.len() - inner.trim_start_matches([' ', '\t']).len();
    if !inner[offset..].starts_with("projects") {
        return None;
    }
    offset += "projects".len();
    offset += inner[offset..].len() - inner[offset..].trim_start_matches([' ', '\t']).len();
    if inner.as_bytes().get(offset) != Some(&b'.') {
        return None;
    }
    let parsed = parse_single_line_string(inner, offset + 1)?;
    inner[parsed.end..]
        .trim_matches([' ', '\t'])
        .is_empty()
        .then_some(parsed.value)
}

fn normalize_project_lookup(path: &str) -> String {
    if !is_windows_project_path(path) {
        return path.to_owned();
    }
    let path = path.replace('\\', "/");
    if let Some(tail) = path.strip_prefix("//") {
        let mut parts = tail.splitn(3, '/');
        let server = parts.next().unwrap_or_default().to_ascii_lowercase();
        let distro = parts.next().unwrap_or_default().to_ascii_lowercase();
        let remainder = parts.next().unwrap_or_default();
        return if remainder.is_empty() {
            format!("//{server}/{distro}")
        } else {
            format!("//{server}/{distro}/{remainder}")
        };
    }
    path.to_ascii_lowercase()
}

fn normalize_project_revocation(path: &str) -> String {
    let normalized = normalize_project_lookup(path);
    if is_windows_project_path(path) {
        normalized.to_ascii_lowercase()
    } else {
        normalized
    }
}

fn is_windows_project_path(path: &str) -> bool {
    path.starts_with("//")
        || path.starts_with("\\\\")
        || path.as_bytes().get(1) == Some(&b':')
            && path.as_bytes().first().is_some_and(u8::is_ascii_alphabetic)
}

fn project_trust_level(block: &str) -> Option<&'static str> {
    block.lines().find_map(|line| {
        let equals = structural_equals(line)?;
        if normalize_key(line[..equals].trim()) != "trust_level" {
            return None;
        }
        let parsed = parse_single_line_string(line, equals + 1)?;
        let tail = line[parsed.end..].trim();
        if !tail.is_empty() && !tail.starts_with('#') {
            return None;
        }
        match parsed.value.as_str() {
            "trusted" => Some("trusted"),
            "untrusted" => Some("untrusted"),
            _ => None,
        }
    })
}

fn toml_blocks(contents: &str) -> Vec<TomlBlock<'_>> {
    let mut starts = Vec::new();
    let mut state = ScanState::default();
    let mut offset = 0;
    for line in contents.split_inclusive('\n') {
        let raw = line.trim_end_matches(['\r', '\n']);
        if is_structural(state) && table_header(raw).is_some() {
            starts.push((offset, raw));
        }
        state = update_state(state, raw);
        offset += line.len();
    }
    starts
        .iter()
        .enumerate()
        .map(|(index, (start, header))| TomlBlock {
            header,
            text: &contents[*start..starts.get(index + 1).map_or(contents.len(), |next| next.0)],
        })
        .collect()
}

fn normalize_deprecated_hook_feature(contents: &str) -> String {
    if !contents.contains("codex_hooks") {
        return contents.to_owned();
    }
    let mut lines = contents.split('\n').map(str::to_owned).collect::<Vec<_>>();
    let mut sections = Vec::new();
    let mut section_start = None;
    let mut state = ScanState::default();
    for (index, line) in lines.iter().enumerate() {
        if is_structural(state)
            && let Some(header) = table_header(line)
        {
            if let Some(start) = section_start.take() {
                sections.push((start, index));
            }
            if normalize_key(header.trim_matches(['[', ']', ' ', '\t'])) == "features" {
                section_start = Some(index + 1);
            }
        }
        state = update_state(state, line);
    }
    if let Some(start) = section_start {
        sections.push((start, lines.len()));
    }
    for (start, end) in sections.into_iter().rev() {
        let mut hooks_exists = false;
        let mut deprecated = Vec::new();
        for (index, line) in lines.iter().enumerate().take(end).skip(start) {
            let Some(equals) = structural_equals(line) else {
                continue;
            };
            let key = line[..equals].trim();
            if key == "hooks" {
                hooks_exists = true;
            } else if key == "codex_hooks" {
                deprecated.push(index);
            }
        }
        if deprecated.is_empty() {
            continue;
        }
        if !hooks_exists {
            let first = deprecated.remove(0);
            if let Some(start) = lines[first].find("codex_hooks") {
                lines[first].replace_range(start..start + "codex_hooks".len(), "hooks");
            }
        }
        for index in deprecated.into_iter().rev() {
            lines.remove(index);
        }
    }
    lines.join("\n")
}

fn rewrite_relative_paths(contents: &str, source_home: &str) -> String {
    let mut output = String::with_capacity(contents.len());
    let mut state = ScanState::default();
    let mut table = String::new();
    for line in contents.split_inclusive('\n') {
        let newline = if line.ends_with('\n') { "\n" } else { "" };
        let raw = line.trim_end_matches(['\r', '\n']);
        let carriage = if raw.len() + newline.len() < line.len() {
            "\r"
        } else {
            ""
        };
        let rewritten = if is_structural(state) {
            if let Some(header) = table_header(raw) {
                table = header_path(header);
                raw.to_owned()
            } else {
                rewrite_path_line(raw, &table, source_home)
            }
        } else {
            raw.to_owned()
        };
        output.push_str(&rewritten);
        output.push_str(carriage);
        output.push_str(newline);
        state = update_state(state, raw);
    }
    output
}

fn rewrite_path_line(line: &str, table: &str, source_home: &str) -> String {
    let Some(equals) = structural_equals(line) else {
        return line.to_owned();
    };
    let key = normalize_key(line[..equals].trim());
    let full_key = if table.is_empty() {
        key
    } else {
        format!("{}.{}", normalize_key(table), key)
    };
    if !is_path_key(&full_key) {
        return line.to_owned();
    }
    let Some(parsed) = parse_single_line_string(line, equals + 1) else {
        return line.to_owned();
    };
    if !is_relative_path(&parsed.value) {
        return line.to_owned();
    }
    let absolute = logical_join(source_home, &parsed.value);
    format!(
        "{}{}{}",
        &line[..parsed.start],
        quote_toml_path(&absolute),
        &line[parsed.end..]
    )
}

fn is_path_key(key: &str) -> bool {
    PATH_KEYS.contains(&key)
        || key
            .strip_prefix("agents.")
            .is_some_and(|tail| tail.contains('.') && tail.ends_with(".config_file"))
        || key
            .strip_prefix("model_providers.")
            .is_some_and(|tail| tail.contains('.') && tail.ends_with(".auth.cwd"))
        || key.strip_prefix("profiles.").is_some_and(|tail| {
            tail.contains('.')
                && [
                    ".experimental_compact_prompt_file",
                    ".model_catalog_json",
                    ".model_instructions_file",
                ]
                .iter()
                .any(|suffix| tail.ends_with(suffix))
        })
}

fn is_relative_path(value: &str) -> bool {
    let value = value.trim();
    if value.is_empty()
        || value.starts_with(['~', '$', '%', '/', '\\'])
        || value.as_bytes().get(1) == Some(&b':')
    {
        return false;
    }
    !value.split_once(':').is_some_and(|(scheme, _)| {
        !scheme.is_empty()
            && scheme.as_bytes()[0].is_ascii_alphabetic()
            && scheme
                .bytes()
                .all(|byte| byte.is_ascii_alphanumeric() || b"+.-".contains(&byte))
    })
}

fn logical_join(base: &str, child: &str) -> String {
    if base.starts_with('/') {
        return normalize_join(base, child, '/', "/");
    }
    normalize_join(base, child, '\\', windows_root(base))
}

fn normalize_join(base: &str, child: &str, separator: char, root: &str) -> String {
    let is_separator = |character| character == '/' || character == '\\';
    let mut components = base[root.len()..]
        .split(is_separator)
        .filter(|component| !component.is_empty() && *component != ".")
        .map(str::to_owned)
        .collect::<Vec<_>>();
    for component in child.split(is_separator) {
        match component {
            "" | "." => {}
            ".." if !components.is_empty() => {
                components.pop();
            }
            ".." => {}
            component => components.push(component.to_owned()),
        }
    }
    let joined = components.join(&separator.to_string());
    if joined.is_empty() {
        root.to_owned()
    } else if root.ends_with(['/', '\\']) {
        format!("{root}{joined}")
    } else {
        format!("{root}{separator}{joined}")
    }
}

fn windows_root(path: &str) -> &str {
    if path.starts_with("\\\\") || path.starts_with("//") {
        let mut separators = 0;
        for (index, character) in path.char_indices().skip(2) {
            if matches!(character, '/' | '\\') {
                separators += 1;
                if separators == 2 {
                    return &path[..=index];
                }
            }
        }
        return path;
    }
    if path.as_bytes().get(1) == Some(&b':') {
        return path.get(..3).unwrap_or(path);
    }
    ""
}

fn quote_toml_path(path: &str) -> String {
    if path
        .chars()
        .all(|character| character != '\'' && (!character.is_control() || character == '\t'))
    {
        return format!("'{path}'");
    }
    let mut output = String::from("\"");
    for character in path.chars() {
        match character {
            '"' | '\\' => {
                output.push('\\');
                output.push(character);
            }
            character if character.is_control() => {
                output.push_str(&format!("\\u{:04X}", u32::from(character)));
            }
            character => output.push(character),
        }
    }
    output.push('"');
    output
}

fn top_level_model_provider(contents: &str) -> Option<String> {
    let mut state = ScanState::default();
    let mut offset = 0;
    for line in contents.split_inclusive('\n') {
        let raw = line.trim_end_matches(['\r', '\n']);
        if is_structural(state) {
            if table_header(raw).is_some() {
                return None;
            }
            if let Some(value_offset) = model_provider_value_offset(raw) {
                return parse_string(contents, offset + value_offset).map(|value| value.value);
            }
        }
        state = update_state(state, raw);
        offset += line.len();
    }
    None
}

fn model_provider_value_offset(line: &str) -> Option<usize> {
    let start = line.len() - line.trim_start_matches([' ', '\t']).len();
    let key_end = if line[start..].starts_with("model_provider") {
        start + "model_provider".len()
    } else {
        let parsed = parse_single_line_string(line, start)?;
        (parsed.value == "model_provider").then_some(parsed.end)?
    };
    let equals = key_end
        + line[key_end..]
            .len()
            .saturating_sub(line[key_end..].trim_start_matches([' ', '\t']).len());
    (line.as_bytes().get(equals) == Some(&b'=')).then_some(equals + 1)
}

fn parse_string(source: &str, offset: usize) -> Option<ParsedString> {
    let source = &source[offset..];
    let whitespace = source.len() - source.trim_start_matches([' ', '\t']).len();
    let start = offset + whitespace;
    let rest = &source[whitespace..];
    let delimiter = if rest.starts_with("\"\"\"") {
        Some("\"\"\"")
    } else if rest.starts_with("'''") {
        Some("'''")
    } else {
        None
    };
    let Some(delimiter) = delimiter else {
        let mut parsed = parse_single_line_string(rest, 0)?;
        parsed.start += start;
        parsed.end += start;
        return Some(parsed);
    };
    let mut index = delimiter.len();
    if rest[index..].starts_with("\r\n") {
        index += 2;
    } else if rest[index..].starts_with('\n') {
        index += 1;
    }
    let mut value = String::new();
    while index < rest.len() {
        if rest[index..].starts_with(delimiter) {
            return Some(ParsedString {
                end: start + index + delimiter.len(),
                start,
                value,
            });
        }
        let character = rest[index..].chars().next()?;
        if delimiter == "\"\"\"" && character == '\\' {
            if let Some(next) = multiline_continuation_end(rest, index) {
                index = next;
                continue;
            }
            if let Some((decoded, next)) = parse_escape(rest, index) {
                value.push(decoded);
                index = next;
                continue;
            }
            return None;
        }
        if character == '\r' {
            value.push('\n');
            index += if rest[index..].starts_with("\r\n") {
                2
            } else {
                1
            };
            continue;
        }
        value.push(character);
        index += character.len_utf8();
    }
    None
}

fn multiline_continuation_end(source: &str, slash: usize) -> Option<usize> {
    let mut index = slash + 1;
    while source[index..].starts_with([' ', '\t']) {
        index = next_character(source, index);
    }
    if source[index..].starts_with("\r\n") {
        index += 2;
    } else if source[index..].starts_with('\n') {
        index += 1;
    } else {
        return None;
    }
    while source[index..]
        .chars()
        .next()
        .is_some_and(char::is_whitespace)
    {
        index = next_character(source, index);
    }
    Some(index)
}

fn parse_single_line_string(line: &str, offset: usize) -> Option<ParsedString> {
    let rest = line.get(offset..)?;
    let whitespace = rest.len() - rest.trim_start_matches([' ', '\t']).len();
    let start = offset + whitespace;
    if line[start..].starts_with("\"\"\"") || line[start..].starts_with("'''") {
        return None;
    }
    let quote = line[start..].chars().next()?;
    if !matches!(quote, '\'' | '"') {
        return None;
    }
    let mut index = start + quote.len_utf8();
    let mut value = String::new();
    while index < line.len() {
        let character = line[index..].chars().next()?;
        if character == quote {
            return Some(ParsedString {
                end: index + character.len_utf8(),
                start,
                value,
            });
        }
        if quote == '"' && character == '\\' {
            let (decoded, next) = parse_escape(line, index)?;
            value.push(decoded);
            index = next;
            continue;
        }
        if matches!(character, '\n' | '\r') {
            return None;
        }
        value.push(character);
        index += character.len_utf8();
    }
    None
}

fn parse_escape(source: &str, slash: usize) -> Option<(char, usize)> {
    let escaped = source[slash + 1..].chars().next()?;
    let next = slash + 1 + escaped.len_utf8();
    match escaped {
        'b' => Some(('\u{0008}', next)),
        't' => Some(('\t', next)),
        'n' => Some(('\n', next)),
        'f' => Some(('\u{000c}', next)),
        'r' => Some(('\r', next)),
        '"' | '\\' => Some((escaped, next)),
        'u' | 'U' => {
            let digits = if escaped == 'u' { 4 } else { 8 };
            let end = next + digits;
            let code = u32::from_str_radix(source.get(next..end)?, 16).ok()?;
            char::from_u32(code).map(|character| (character, end))
        }
        _ => None,
    }
}

fn structural_equals(line: &str) -> Option<usize> {
    let mut basic = false;
    let mut literal = false;
    let mut escaped = false;
    for (index, character) in line.char_indices() {
        if escaped {
            escaped = false;
            continue;
        }
        if basic && character == '\\' {
            escaped = true;
        } else if !literal && character == '"' {
            basic = !basic;
        } else if !basic && character == '\'' {
            literal = !literal;
        } else if !basic && !literal && character == '=' {
            return Some(index);
        } else if !basic && !literal && character == '#' {
            return None;
        }
    }
    None
}

fn is_structural(state: ScanState) -> bool {
    !state.multiline_basic && !state.multiline_literal && state.array_depth == 0
}

fn update_state(mut state: ScanState, line: &str) -> ScanState {
    let mut index = 0;
    while index < line.len() {
        if state.multiline_basic {
            if line[index..].starts_with("\"\"\"") {
                state.multiline_basic = false;
                index += 3;
            } else if line[index..].starts_with('\\') {
                index = next_character(line, index + 1);
            } else {
                index = next_character(line, index);
            }
            continue;
        }
        if state.multiline_literal {
            if line[index..].starts_with("'''") {
                state.multiline_literal = false;
                index += 3;
            } else {
                index = next_character(line, index);
            }
            continue;
        }
        if line[index..].starts_with('#') {
            break;
        }
        if line[index..].starts_with("\"\"\"") {
            state.multiline_basic = true;
            index += 3;
            continue;
        }
        if line[index..].starts_with("'''") {
            state.multiline_literal = true;
            index += 3;
            continue;
        }
        let character = line[index..].chars().next().unwrap_or_default();
        if matches!(character, '"' | '\'') {
            index = skip_string(line, index, character);
        } else {
            if character == '[' {
                state.array_depth += 1;
            } else if character == ']' {
                state.array_depth = state.array_depth.saturating_sub(1);
            }
            index += character.len_utf8();
        }
    }
    state
}

fn skip_string(line: &str, mut index: usize, quote: char) -> usize {
    index += quote.len_utf8();
    while index < line.len() {
        let character = line[index..].chars().next().unwrap_or_default();
        if quote == '"' && character == '\\' {
            index = next_character(line, index + 1);
        } else {
            index += character.len_utf8();
            if character == quote {
                break;
            }
        }
    }
    index
}

fn next_character(source: &str, index: usize) -> usize {
    source
        .get(index..)
        .and_then(|rest| rest.chars().next())
        .map_or(source.len(), |character| index + character.len_utf8())
}

fn table_header(line: &str) -> Option<&str> {
    let start = line.len() - line.trim_start_matches([' ', '\t']).len();
    let line = &line[start..];
    let closing = if line.starts_with("[[") {
        "]]"
    } else if line.starts_with('[') {
        "]"
    } else {
        return None;
    };
    let mut index = closing.len();
    let mut basic = false;
    let mut literal = false;
    let mut escaped = false;
    while index < line.len() {
        let character = line[index..].chars().next()?;
        if escaped {
            escaped = false;
            index += character.len_utf8();
            continue;
        }
        if basic && character == '\\' {
            escaped = true;
        } else if !literal && character == '"' {
            basic = !basic;
        } else if !basic && character == '\'' {
            literal = !literal;
        } else if !basic && !literal && line[index..].starts_with(closing) {
            let end = index + closing.len();
            let tail = line[end..].trim_start_matches([' ', '\t', '\r']);
            return (tail.is_empty() || tail.starts_with('#')).then_some(&line[..end]);
        }
        index += character.len_utf8();
    }
    None
}

fn header_path(header: &str) -> String {
    header
        .strip_prefix("[[")
        .and_then(|value| value.strip_suffix("]]"))
        .or_else(|| {
            header
                .strip_prefix('[')
                .and_then(|value| value.strip_suffix(']'))
        })
        .unwrap_or_default()
        .trim()
        .to_owned()
}

fn normalize_key(value: &str) -> String {
    value
        .chars()
        .filter(|character| !character.is_whitespace())
        .collect()
}

fn strip_owned_hook_trust(
    contents: &str,
    source_home: &str,
    source_hooks: &str,
    command: &str,
    user_data_path: &Path,
) -> String {
    let ledger = ledger_entries(user_data_path, source_home);
    let mut output = String::with_capacity(contents.len());
    let mut cursor = 0;
    for block in toml_blocks(contents) {
        let start = block.text.as_ptr() as usize - contents.as_ptr() as usize;
        if start > cursor {
            output.push_str(&contents[cursor..start]);
        }
        if !owned_trust_block(block.header, block.text, source_hooks, command, &ledger) {
            output.push_str(block.text);
        }
        cursor = start + block.text.len();
    }
    output.push_str(&contents[cursor..]);
    output
}

fn owned_trust_block(
    header: &str,
    block: &str,
    source_hooks: &str,
    command: &str,
    ledger: &HashMap<String, (String, String)>,
) -> bool {
    let path = header_path(header);
    let Some(encoded) = path.strip_prefix("hooks.state.") else {
        return false;
    };
    let Ok(key) = serde_json::from_str::<String>(encoded) else {
        return false;
    };
    let Some((source, event, group, handler)) = split_trust_key(&key) else {
        return false;
    };
    if group != "0"
        || handler != "0"
        || !HOOK_EVENTS.contains(&event)
        || !paths_equal(source, source_hooks)
    {
        return false;
    }
    let Some(hash) = trust_state_hash(block) else {
        return false;
    };
    let expected = trusted_hash(event, command, Some(10));
    let legacy = trusted_hash(event, command, None);
    if hash == expected || hash == legacy {
        return true;
    }
    let normalized = normalize_trust_key(&key);
    ledger
        .get(&normalized)
        .is_some_and(|(recorded_signature, recorded_hash)| {
            recorded_hash == &hash && managed_ledger_signature(recorded_signature, event, command)
        })
}

fn split_trust_key(key: &str) -> Option<(&str, &str, &str, &str)> {
    let mut parts = key.rsplitn(4, ':');
    let handler = parts.next()?;
    let group = parts.next()?;
    let event = parts.next()?;
    let source = parts.next()?;
    Some((source, event, group, handler))
}

fn trust_state_hash(block: &str) -> Option<String> {
    block.lines().find_map(|line| {
        let equals = structural_equals(line)?;
        (normalize_key(line[..equals].trim()) == "trusted_hash")
            .then(|| parse_single_line_string(line, equals + 1))
            .flatten()
            .map(|parsed| parsed.value)
    })
}

fn trusted_hash(event: &str, command: &str, timeout: Option<u64>) -> String {
    let mut handler = serde_json::Map::new();
    handler.insert("async".to_owned(), Value::Bool(false));
    handler.insert("command".to_owned(), Value::String(command.to_owned()));
    handler.insert(
        "timeout".to_owned(),
        Value::from(timeout.unwrap_or(600).max(1)),
    );
    handler.insert("type".to_owned(), Value::String("command".to_owned()));
    let identity = Value::Object(serde_json::Map::from_iter([
        ("event_name".to_owned(), Value::String(event.to_owned())),
        (
            "hooks".to_owned(),
            Value::Array(vec![Value::Object(handler)]),
        ),
    ]));
    let bytes = serde_json::to_vec(&identity).unwrap_or_default();
    format!("sha256:{:x}", Sha256::digest(bytes))
}

fn managed_ledger_signature(signature: &str, event: &str, command: &str) -> bool {
    let Ok(Value::Object(signature)) = serde_json::from_str::<Value>(signature) else {
        return false;
    };
    signature.get("eventLabel").and_then(Value::as_str) == Some(event)
        && signature.get("command").and_then(Value::as_str) == Some(command)
        && signature.get("timeoutSec").and_then(Value::as_u64) == Some(10)
        && signature.get("async").and_then(Value::as_bool) == Some(false)
        && signature.get("matcher").is_some_and(Value::is_null)
        && signature.get("statusMessage").is_some_and(Value::is_null)
}

fn ledger_entries(user_data_path: &Path, source_home: &str) -> HashMap<String, (String, String)> {
    let path = user_data_path
        .join("codex-runtime-home")
        .join("trust-grant-ledger.json");
    let Ok(Some(bytes)) = managed_files::read_bounded(&path, CONFIG_BYTE_LIMIT) else {
        return HashMap::new();
    };
    let Ok(Value::Object(file)) = serde_json::from_slice::<Value>(&bytes) else {
        return HashMap::new();
    };
    if file.get("version").and_then(Value::as_u64) != Some(1) {
        return HashMap::new();
    }
    let Some(homes) = file.get("homes").and_then(Value::as_object) else {
        return HashMap::new();
    };
    let wanted = normalize_home_key(source_home);
    let Some(home) = homes
        .iter()
        .find(|(key, _)| normalize_home_key(key) == wanted)
        .and_then(|(_, home)| home.as_object())
    else {
        return HashMap::new();
    };
    home.get("entries")
        .and_then(Value::as_object)
        .into_iter()
        .flatten()
        .filter_map(|(key, entry)| {
            let entry = entry.as_object()?;
            Some((
                normalize_trust_key(key),
                (
                    entry.get("signature")?.as_str()?.to_owned(),
                    entry.get("trustedHash")?.as_str()?.to_owned(),
                ),
            ))
        })
        .collect()
}

fn normalize_home_key(value: &str) -> String {
    let value = value.replace('\\', "/").trim_end_matches('/').to_owned();
    if cfg!(windows) {
        value.to_ascii_lowercase()
    } else {
        value
    }
}

fn normalize_trust_key(value: &str) -> String {
    if let Some((source, event, group, handler)) = split_trust_key(value) {
        format!("{}:{event}:{group}:{handler}", normalize_home_key(source))
    } else {
        value.to_owned()
    }
}

fn paths_equal(left: &str, right: &str) -> bool {
    normalize_home_key(left) == normalize_home_key(right)
}
