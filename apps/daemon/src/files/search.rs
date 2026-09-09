use std::collections::HashMap;
use std::sync::Arc;

use regex::{Regex, RegexBuilder};
use serde_json::Value;
use tokio::sync::watch;

use crate::hosts::{
    ExecutionHost, HostCommand, HostCommandErrorKind, HostCommandOutputObserver,
    HostCommandOutputStream, HostCommandStreamControl, HostFilesystem, HostPaths,
};

use super::model::{FileSearchResult, SearchFileResult, SearchMatch, SearchOptions};
use super::{FilesAuthority, FilesError};

const DEFAULT_MAX_RESULTS: usize = 2_000;
const MAX_MATCHES_PER_FILE: usize = 100;
const MAX_LINE_CONTENT_LENGTH: usize = 500;
const SEARCH_MAX_OUTPUT_BYTES: usize = 64 * 1_024 * 1_024;
const SEARCH_TIMEOUT_MS: u64 = 15_000;

impl FilesAuthority {
    pub(crate) async fn search(
        &self,
        worktree: &str,
        mut options: SearchOptions,
    ) -> Result<FileSearchResult, FilesError> {
        let scope = self.scopes.resolve(worktree).await?;
        options.max_results = options.max_results.clamp(1, DEFAULT_MAX_RESULTS);
        let key = (scope.host.id().to_owned(), scope.path.clone());
        let (cancel_sender, cancel_receiver) = watch::channel(false);
        if let Some(previous) =
            super::lock(&self.searches).insert(key.clone(), cancel_sender.clone())
        {
            let _ = previous.send(true);
        }
        let result = search_rg(scope.host.clone(), &scope.path, &options, cancel_receiver).await;
        let mut searches = super::lock(&self.searches);
        if searches
            .get(&key)
            .is_some_and(|current| current.same_channel(&cancel_sender))
        {
            searches.remove(&key);
        }
        drop(searches);
        match result {
            Ok(result) => Ok(result),
            Err(FilesError::Host(error)) if error.kind() == HostCommandErrorKind::Cancelled => {
                Ok(FileSearchResult {
                    files: Vec::new(),
                    total_matches: 0,
                    truncated: true,
                })
            }
            Err(error) => Err(error),
        }
    }
}

async fn search_rg(
    host: Arc<dyn ExecutionHost>,
    root: &str,
    options: &SearchOptions,
    cancel: watch::Receiver<bool>,
) -> Result<FileSearchResult, FilesError> {
    let observer = Arc::new(RgStreamObserver::new(&host, root, options.max_results));
    let mut args = vec![
        "--json".to_owned(),
        "--hidden".to_owned(),
        "--glob".to_owned(),
        "!.git".to_owned(),
        "--max-count".to_owned(),
        MAX_MATCHES_PER_FILE.to_string(),
        "--max-filesize".to_owned(),
        "5M".to_owned(),
    ];
    if !options.case_sensitive {
        args.push("--ignore-case".to_owned());
    }
    if options.whole_word {
        args.push("--word-regexp".to_owned());
    }
    if !options.use_regex {
        args.push("--fixed-strings".to_owned());
    }
    if let Some(include) = options.include_pattern.as_deref() {
        for pattern in split_patterns(include) {
            args.extend(["--glob".to_owned(), pattern]);
        }
    }
    if let Some(exclude) = options.exclude_pattern.as_deref() {
        for pattern in split_patterns(exclude) {
            args.extend(["--glob".to_owned(), format!("!{pattern}")]);
        }
    }
    args.extend(["--".to_owned(), options.query.clone(), root.to_owned()]);
    let mut command = HostCommand::new("rg", args);
    command.cancel = Some(cancel.clone());
    command.cwd = Some(root.to_owned());
    command.max_output_bytes = Some(SEARCH_MAX_OUTPUT_BYTES);
    command.retain_stdout = false;
    command.output_observer = Some(observer.clone());
    command.timeout_ms = Some(SEARCH_TIMEOUT_MS);
    match host.exec(command).await {
        Ok(output) if matches!(output.exit_code, 0 | 1) => Ok(observer.result(true, false)),
        Ok(output) if output.exit_code == 127 => search_git(host, root, options, cancel).await,
        Ok(_) => Ok(empty_result()),
        Err(error) if error.kind() == HostCommandErrorKind::Spawn => {
            search_git(host, root, options, cancel).await
        }
        Err(error) if error.kind() == HostCommandErrorKind::Stopped => {
            Ok(observer.result(false, false))
        }
        Err(error) if error.kind() == HostCommandErrorKind::Cancelled => {
            Ok(observer.result(true, false))
        }
        Err(error)
            if matches!(
                error.kind(),
                HostCommandErrorKind::OutputLimit | HostCommandErrorKind::Timeout
            ) =>
        {
            Ok(observer.result(false, true))
        }
        Err(error) => Err(error.into()),
    }
}

async fn search_git(
    host: Arc<dyn ExecutionHost>,
    root: &str,
    options: &SearchOptions,
    cancel: watch::Receiver<bool>,
) -> Result<FileSearchResult, FilesError> {
    let mut args = vec![
        "-c".to_owned(),
        "submodule.recurse=false".to_owned(),
        "grep".to_owned(),
        "-n".to_owned(),
        "-I".to_owned(),
        "--null".to_owned(),
        "--no-color".to_owned(),
        "--untracked".to_owned(),
        "--no-recurse-submodules".to_owned(),
    ];
    if !options.case_sensitive {
        args.push("-i".to_owned());
    }
    if options.whole_word {
        args.push("-w".to_owned());
    }
    args.push(
        if options.use_regex {
            "--extended-regexp"
        } else {
            "--fixed-strings"
        }
        .to_owned(),
    );
    args.extend(["-e".to_owned(), options.query.clone(), "--".to_owned()]);
    let mut has_pathspec = false;
    if let Some(include) = options.include_pattern.as_deref() {
        for pattern in split_patterns(include) {
            args.push(git_glob_pathspec(&pattern, false));
            has_pathspec = true;
        }
    }
    if let Some(exclude) = options.exclude_pattern.as_deref() {
        for pattern in split_patterns(exclude) {
            args.push(git_glob_pathspec(&pattern, true));
            has_pathspec = true;
        }
    }
    if !has_pathspec {
        args.push(".".to_owned());
    }
    let mut command = HostCommand::new("git", args);
    command.cancel = Some(cancel);
    command.cwd = Some(root.to_owned());
    command.max_output_bytes = Some(SEARCH_MAX_OUTPUT_BYTES);
    command.timeout_ms = Some(SEARCH_TIMEOUT_MS);
    let output = match host.exec(command).await {
        Ok(output) => output,
        Err(error) if error.kind() == HostCommandErrorKind::Cancelled => return Err(error.into()),
        Err(_) => return Ok(empty_result()),
    };
    if !matches!(output.exit_code, 0 | 1) {
        return Ok(empty_result());
    }
    parse_git(&host, root, &output.stdout, options)
}

struct RgStreamObserver {
    state: std::sync::Mutex<RgStreamState>,
}

struct RgStreamState {
    accumulator: RgAccumulator,
    pending: Vec<u8>,
}

struct RgAccumulator {
    files: Vec<SearchFileResult>,
    indices: HashMap<String, usize>,
    maximum: usize,
    paths: HostPaths,
    root: String,
    total_matches: usize,
    truncated: bool,
}

impl RgStreamObserver {
    fn new(host: &Arc<dyn ExecutionHost>, root: &str, maximum: usize) -> Self {
        Self {
            state: std::sync::Mutex::new(RgStreamState {
                accumulator: RgAccumulator {
                    files: Vec::new(),
                    indices: HashMap::new(),
                    maximum,
                    paths: HostFilesystem::new(host.clone()).paths(),
                    root: root.to_owned(),
                    total_matches: 0,
                    truncated: false,
                },
                pending: Vec::new(),
            }),
        }
    }

    fn result(&self, include_pending: bool, force_truncated: bool) -> FileSearchResult {
        let mut state = super::lock(&self.state);
        if include_pending && !state.pending.is_empty() {
            let pending = std::mem::take(&mut state.pending);
            let line = String::from_utf8_lossy(&pending);
            state.accumulator.ingest(&line);
        }
        FileSearchResult {
            files: state.accumulator.files.clone(),
            total_matches: state.accumulator.total_matches,
            truncated: force_truncated || state.accumulator.truncated,
        }
    }
}

impl HostCommandOutputObserver for RgStreamObserver {
    fn observe(&self, stream: HostCommandOutputStream, bytes: &[u8]) -> HostCommandStreamControl {
        if stream == HostCommandOutputStream::Stderr {
            return HostCommandStreamControl::Continue;
        }
        let mut state = super::lock(&self.state);
        state.pending.extend_from_slice(bytes);
        let mut consumed = 0;
        let mut control = HostCommandStreamControl::Continue;
        while let Some(end) = state.pending[consumed..]
            .iter()
            .position(|byte| *byte == b'\n')
            .map(|offset| consumed + offset)
        {
            let line = String::from_utf8_lossy(&state.pending[consumed..end]).into_owned();
            consumed = end + 1;
            if state.accumulator.ingest(&line) == HostCommandStreamControl::Stop {
                control = HostCommandStreamControl::Stop;
                break;
            }
        }
        state.pending.drain(..consumed);
        control
    }
}

impl RgAccumulator {
    fn ingest(&mut self, line: &str) -> HostCommandStreamControl {
        if self.total_matches >= self.maximum {
            return HostCommandStreamControl::Stop;
        }
        let Ok(message) = serde_json::from_str::<Value>(line) else {
            return HostCommandStreamControl::Continue;
        };
        if message.get("type").and_then(Value::as_str) != Some("match") {
            return HostCommandStreamControl::Continue;
        }
        let Some(data) = message.get("data") else {
            return HostCommandStreamControl::Continue;
        };
        let Some(file_path) = data
            .pointer("/path/text")
            .and_then(Value::as_str)
            .map(str::to_owned)
        else {
            return HostCommandStreamControl::Continue;
        };
        let relative_path = self
            .paths
            .relative(&self.root, &file_path)
            .replace('\\', "/");
        let line_number = data
            .get("line_number")
            .and_then(Value::as_u64)
            .and_then(|value| usize::try_from(value).ok())
            .unwrap_or(0);
        let line_content = data
            .pointer("/lines/text")
            .and_then(Value::as_str)
            .unwrap_or("")
            .trim_end_matches('\n');
        let submatches = data
            .get("submatches")
            .and_then(Value::as_array)
            .cloned()
            .unwrap_or_default();
        let submatches = if submatches.is_empty() {
            vec![serde_json::json!({ "start": 0, "end": usize::from(!line_content.is_empty()) })]
        } else {
            submatches
        };
        for submatch in submatches {
            if self.total_matches >= self.maximum {
                self.truncated = true;
                break;
            }
            let start = submatch
                .get("start")
                .and_then(Value::as_u64)
                .and_then(|value| usize::try_from(value).ok())
                .unwrap_or(0);
            let end = submatch
                .get("end")
                .and_then(Value::as_u64)
                .and_then(|value| usize::try_from(value).ok())
                .unwrap_or(start);
            let index = *self.indices.entry(file_path.clone()).or_insert_with(|| {
                self.files.push(SearchFileResult {
                    file_path: file_path.clone(),
                    match_count: 0,
                    matches: Vec::new(),
                    relative_path: relative_path.clone(),
                });
                self.files.len() - 1
            });
            let result = &mut self.files[index];
            result.matches.push(clamp_match(
                line_content,
                line_number,
                start,
                end.saturating_sub(start),
            ));
            result.match_count += 1;
            self.total_matches += 1;
            if self.total_matches >= self.maximum {
                self.truncated = true;
                break;
            }
        }
        if self.truncated {
            HostCommandStreamControl::Stop
        } else {
            HostCommandStreamControl::Continue
        }
    }
}

fn parse_git(
    host: &Arc<dyn ExecutionHost>,
    root: &str,
    output: &str,
    options: &SearchOptions,
) -> Result<FileSearchResult, FilesError> {
    let matcher = build_matcher(options).ok();
    let paths = HostFilesystem::new(host.clone()).paths();
    let mut files = Vec::<SearchFileResult>::new();
    let mut indices = HashMap::<String, usize>::new();
    let mut total_matches = 0;
    let mut truncated = false;
    for raw in output.lines() {
        let Some((relative_path, remainder)) = raw.split_once('\0') else {
            continue;
        };
        let Some((line_number, line_content)) = remainder
            .split_once('\0')
            .or_else(|| remainder.split_once(':'))
        else {
            continue;
        };
        let line_number = line_number.parse::<usize>().unwrap_or(0);
        let file_path = paths.resolve(root, &[relative_path]);
        let matches = matcher
            .as_ref()
            .map(|matcher| {
                matcher
                    .find_iter(line_content)
                    .map(|matched| {
                        (
                            matched.start(),
                            matched.end().saturating_sub(matched.start()),
                        )
                    })
                    .collect::<Vec<_>>()
            })
            .filter(|matches| !matches.is_empty())
            .unwrap_or_else(|| vec![(0, line_content.len())]);
        for (start, length) in matches {
            let index = *indices.entry(file_path.clone()).or_insert_with(|| {
                files.push(SearchFileResult {
                    file_path: file_path.clone(),
                    match_count: 0,
                    matches: Vec::new(),
                    relative_path: relative_path.replace('\\', "/"),
                });
                files.len() - 1
            });
            let result = &mut files[index];
            result
                .matches
                .push(clamp_match(line_content, line_number, start, length));
            result.match_count += 1;
            total_matches += 1;
            if total_matches >= options.max_results {
                truncated = true;
                break;
            }
        }
        if truncated {
            break;
        }
    }
    Ok(FileSearchResult {
        files,
        total_matches,
        truncated,
    })
}

fn empty_result() -> FileSearchResult {
    FileSearchResult {
        files: Vec::new(),
        total_matches: 0,
        truncated: false,
    }
}

fn git_glob_pathspec(pattern: &str, exclude: bool) -> String {
    let pattern = if pattern.contains('/') {
        pattern.to_owned()
    } else {
        format!("**/{pattern}")
    };
    if exclude {
        format!(":(exclude,glob){pattern}")
    } else {
        format!(":(glob){pattern}")
    }
}

fn build_matcher(options: &SearchOptions) -> Result<Regex, FilesError> {
    let source = if options.use_regex {
        options.query.clone()
    } else {
        regex::escape(&options.query)
    };
    let source = if options.whole_word {
        format!(r"\b(?:{source})\b")
    } else {
        source
    };
    RegexBuilder::new(&source)
        .case_insensitive(!options.case_sensitive)
        .build()
        .map_err(|_| FilesError::InvalidInput("invalid search expression"))
}

fn clamp_match(content: &str, line: usize, start: usize, length: usize) -> SearchMatch {
    let characters = content.chars().collect::<Vec<_>>();
    if characters.len() <= MAX_LINE_CONTENT_LENGTH {
        return SearchMatch {
            column: start.saturating_add(1),
            display_column: None,
            display_match_length: None,
            line,
            line_content: content.to_owned(),
            match_length: length,
        };
    }
    let clamped_length = length.min(MAX_LINE_CONTENT_LENGTH);
    let remaining = MAX_LINE_CONTENT_LENGTH - clamped_length;
    let mut window_start = start.saturating_sub(remaining / 2);
    let window_end = characters.len().min(window_start + MAX_LINE_CONTENT_LENGTH);
    window_start = window_end.saturating_sub(MAX_LINE_CONTENT_LENGTH);
    let mut snippet = characters[window_start..window_end]
        .iter()
        .collect::<String>();
    let mut display_column = start.saturating_sub(window_start).saturating_add(1);
    if window_start > 0 {
        snippet.insert(0, '…');
        display_column += 1;
    }
    if window_end < characters.len() {
        snippet.push('…');
    }
    SearchMatch {
        column: start.saturating_add(1),
        display_column: Some(display_column),
        display_match_length: Some(clamped_length),
        line,
        line_content: snippet,
        match_length: length,
    }
}

fn split_patterns(value: &str) -> Vec<String> {
    let mut patterns = Vec::new();
    let mut current = String::new();
    let mut escaping = false;
    for character in value.chars() {
        if escaping {
            current.push('\\');
            current.push(character);
            escaping = false;
        } else if character == '\\' {
            escaping = true;
        } else if character == ',' {
            if !current.trim().is_empty() {
                patterns.push(current.trim().to_owned());
            }
            current.clear();
        } else {
            current.push(character);
        }
    }
    if escaping {
        current.push('\\');
    }
    if !current.trim().is_empty() {
        patterns.push(current.trim().to_owned());
    }
    patterns
}
