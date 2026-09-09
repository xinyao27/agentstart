use std::collections::VecDeque;
use std::sync::LazyLock;

use regex::Regex;
use url::Url;

const CANDIDATE_MAX_BYTES: usize = 4 * 1_024;
const RECENT_CANDIDATE_LIMIT: usize = 1_024;
const RECENT_CANDIDATE_TOTAL_BYTES: usize = 64 * 1_024;
const RECENT_OUTPUT_BYTES: usize = 64 * 1_024;
const OSC_SCAN_TAIL_BYTES: usize = 4 * 1_024;
const OSC7_PREFIX: &str = "\x1b]7;";

pub(super) struct TerminalPathProvenance {
    candidate_bytes: usize,
    is_windows: bool,
    osc_tail: String,
    recent_candidates: VecDeque<String>,
    recent_output: String,
}

impl TerminalPathProvenance {
    pub(super) fn new(is_windows: bool) -> Self {
        Self {
            candidate_bytes: 0,
            is_windows,
            osc_tail: String::new(),
            recent_candidates: VecDeque::new(),
            recent_output: String::new(),
        }
    }

    pub(super) fn observe(&mut self, text: &str) -> Option<String> {
        append_bounded(&mut self.recent_output, text, RECENT_OUTPUT_BYTES);
        let mut candidates = Vec::new();
        let cwd = self.observe_osc7(text);
        for line in text.split(['\r', '\n']) {
            if line.is_empty() || line.len() > CANDIDATE_MAX_BYTES {
                continue;
            }
            collect_line_candidates(line, &mut candidates);
        }
        self.append_candidates(&candidates);
        cwd
    }

    pub(super) fn append_invalid_marker(&mut self) {
        append_bounded(&mut self.recent_output, "�", RECENT_OUTPUT_BYTES);
        self.reset_boundary();
    }

    pub(super) fn clear_recent(&mut self) {
        self.candidate_bytes = 0;
        self.osc_tail.clear();
        self.recent_candidates.clear();
        self.recent_output.clear();
    }

    pub(super) fn has_recent_output_path(
        &self,
        path_text_or_absolute: &str,
        canonical: &str,
    ) -> bool {
        if recent_output_includes_path(&self.recent_output, path_text_or_absolute, canonical) {
            return true;
        }
        let candidates = provenance_candidates(path_text_or_absolute, canonical);
        self.recent_candidates
            .iter()
            .any(|recent| candidates.iter().any(|candidate| candidate == recent))
    }

    pub(super) fn reset_boundary(&mut self) {
        self.osc_tail.clear();
    }

    fn append_candidates(&mut self, candidates: &[String]) {
        for candidate in candidates {
            if candidate.len() > CANDIDATE_MAX_BYTES {
                continue;
            }
            self.candidate_bytes = self.candidate_bytes.saturating_add(candidate.len());
            self.recent_candidates.push_back(candidate.clone());
        }
        while self.recent_candidates.len() > RECENT_CANDIDATE_LIMIT
            || self.candidate_bytes > RECENT_CANDIDATE_TOTAL_BYTES
        {
            let Some(removed) = self.recent_candidates.pop_front() else {
                self.candidate_bytes = 0;
                break;
            };
            self.candidate_bytes = self.candidate_bytes.saturating_sub(removed.len());
        }
    }

    fn observe_osc7(&mut self, text: &str) -> Option<String> {
        if self.osc_tail.is_empty() && !text.contains("\x1b]") && !text.ends_with('\x1b') {
            return None;
        }
        let mut input = String::with_capacity(self.osc_tail.len().saturating_add(text.len()));
        input.push_str(&self.osc_tail);
        input.push_str(text);
        let mut search_start = 0;
        let mut cwd = None;
        while let Some(relative) = input[search_start..].find(OSC7_PREFIX) {
            let start = search_start + relative;
            let uri_start = start + OSC7_PREFIX.len();
            match osc_terminator(&input, uri_start) {
                OscTerminator::Complete { end, next } => {
                    if let Some(path) = self.parse_osc7_uri(&input[uri_start..end]) {
                        cwd = Some(path);
                    }
                    search_start = next;
                }
                OscTerminator::Invalid { next } => search_start = next,
                OscTerminator::Incomplete => break,
            }
        }
        self.osc_tail = osc_scan_tail(&input);
        cwd
    }

    fn parse_osc7_uri(&self, value: &str) -> Option<String> {
        let parsed = Url::parse(value).ok()?;
        if parsed.scheme() != "file" {
            return None;
        }
        let hostname = parsed.host_str().unwrap_or_default();
        let mut path = decode_percent_escapes_strict(parsed.path())?;
        if self.is_windows
            && path.as_bytes().get(0..3).is_some_and(|bytes| {
                bytes[0] == b'/' && bytes[1].is_ascii_alphabetic() && bytes[2] == b':'
            })
        {
            path.remove(0);
        } else if self.is_windows
            && !hostname.is_empty()
            && !hostname.eq_ignore_ascii_case("localhost")
        {
            path = format!("\\\\{}{}", hostname, path.replace('/', "\\"));
        }
        (!path.is_empty()
            && path.len() <= CANDIDATE_MAX_BYTES
            && !path.chars().any(char::is_control))
        .then_some(path)
    }
}

enum OscTerminator {
    Complete { end: usize, next: usize },
    Incomplete,
    Invalid { next: usize },
}

fn osc_terminator(input: &str, uri_start: usize) -> OscTerminator {
    let bytes = input.as_bytes();
    let mut cursor = uri_start;
    while cursor < bytes.len() {
        match bytes[cursor] {
            0x07 => {
                return OscTerminator::Complete {
                    end: cursor,
                    next: cursor + 1,
                };
            }
            0x1b if bytes.get(cursor + 1) == Some(&b'\\') => {
                return OscTerminator::Complete {
                    end: cursor,
                    next: cursor + 2,
                };
            }
            0x1b => return OscTerminator::Invalid { next: cursor },
            _ => cursor += 1,
        }
    }
    OscTerminator::Incomplete
}

fn osc_scan_tail(input: &str) -> String {
    let last_osc = input.rfind("\x1b]");
    let last_escape = input.ends_with('\x1b').then_some(input.len() - 1);
    let Some(start) = last_osc.into_iter().chain(last_escape).max() else {
        return String::new();
    };
    let suffix = &input[start..];
    if suffix.contains('\x07') || suffix.contains("\x1b\\") {
        return String::new();
    }
    trailing_bytes(suffix, OSC_SCAN_TAIL_BYTES).to_owned()
}

fn collect_line_candidates(line: &str, candidates: &mut Vec<String>) {
    static FILE_URI: LazyLock<Option<Regex>> =
        LazyLock::new(|| Regex::new(r#"(?i)file://([^/\s]*)(/[^\s\x1b"'<>)]*)"#).ok());
    static TEMP_OR_DRIVE: LazyLock<Option<Regex>> = LazyLock::new(|| {
        Regex::new(r#"(?:/(?:tmp|private/tmp)/|[A-Za-z]:[\\/])[^\r\n\x1b"'<>]+"#).ok()
    });
    static EXTENSION_PATH: LazyLock<Option<Regex>> = LazyLock::new(|| {
        Regex::new(r#"/[^\r\n\x1b"'<>]*\.[A-Za-z0-9_+-]+(?:[#:\s][^\r\n\x1b"'<>]*)?"#).ok()
    });

    if let Some(regex) = FILE_URI.as_ref() {
        for capture in regex.captures_iter(line) {
            let authority = capture.get(1).map_or("", |value| value.as_str());
            let Some(uri_path) = capture.get(2).map(|value| value.as_str()) else {
                continue;
            };
            let decoded = decode_percent_escapes(uri_path);
            let value = if is_loopback_authority(authority) {
                decoded
            } else {
                format!("//{authority}{decoded}")
            };
            push_candidate(candidates, &value);
        }
    }
    if let Some(regex) = TEMP_OR_DRIVE.as_ref() {
        for matched in regex.find_iter(line) {
            if !is_inside_nonlocal_file_uri(line, matched.start()) {
                push_candidate(candidates, matched.as_str());
            }
        }
    }
    if let Some(regex) = EXTENSION_PATH.as_ref() {
        for matched in regex.find_iter(line) {
            if !is_inside_nonlocal_file_uri(line, matched.start()) {
                push_candidate(candidates, matched.as_str());
            }
        }
    }
}

fn push_candidate(candidates: &mut Vec<String>, value: &str) {
    let Some(candidate) = trim_candidate(value) else {
        return;
    };
    let drive_alias = candidate
        .as_bytes()
        .get(0..4)
        .is_some_and(|bytes| {
            bytes[0] == b'/'
                && bytes[1].is_ascii_alphabetic()
                && bytes[2] == b':'
                && matches!(bytes[3], b'/' | b'\\')
        })
        .then(|| candidate[1..].to_owned());
    candidates.push(candidate);
    if let Some(drive_alias) = drive_alias {
        candidates.push(drive_alias);
    }
}

fn trim_candidate(value: &str) -> Option<String> {
    static EXTENSION: LazyLock<Option<Regex>> = LazyLock::new(|| {
        Regex::new(r"(?i)\.[A-Za-z0-9_+-]+(?:#L\d+(?:C\d+)?|(?::\d+)?(?::\d+)?)?").ok()
    });
    static LOCATOR: LazyLock<Option<Regex>> =
        LazyLock::new(|| Regex::new(r"(?i)(?:#L\d+(?:C\d+)?|:\d+(?::\d+)?)$").ok());
    let mut candidate = value.trim().trim_end_matches([')', ',', ';', '.']);
    if candidate.is_empty()
        || candidate.len() > CANDIDATE_MAX_BYTES
        || candidate.chars().any(char::is_control)
    {
        return None;
    }
    let mut selected_end = None;
    if let Some(regex) = EXTENSION.as_ref() {
        for extension in regex.find_iter(candidate) {
            let suffix = &candidate[extension.end()..];
            if !suffix.is_empty() && !suffix.chars().next().is_some_and(char::is_whitespace) {
                continue;
            }
            let text = &candidate[..extension.end()];
            if count_path_starts(text) > 1 {
                continue;
            }
            if extension.end() < candidate.len()
                || selected_end.is_none()
                || selected_end
                    .is_some_and(|start| candidate[start..extension.end()].contains(['/', '\\']))
            {
                selected_end = Some(extension.end());
            }
        }
    }
    if let Some(end) = selected_end {
        candidate = &candidate[..end];
    }
    let candidate = LOCATOR.as_ref().map_or_else(
        || candidate.to_owned(),
        |regex| regex.replace(candidate, "").into_owned(),
    );
    if candidate.is_empty() || candidate.len() > CANDIDATE_MAX_BYTES {
        None
    } else {
        Some(candidate)
    }
}

fn count_path_starts(value: &str) -> usize {
    static PATH_START: LazyLock<Option<Regex>> =
        LazyLock::new(|| Regex::new(r"(?:^|\s)(?:~[\\/]|[\\/]|\.{1,2}[\\/]|[A-Za-z]:[\\/])").ok());
    PATH_START
        .as_ref()
        .map_or(usize::MAX, |regex| regex.find_iter(value).count())
}

fn is_inside_nonlocal_file_uri(output: &str, path_start: usize) -> bool {
    static FILE_URI_PREFIX: LazyLock<Option<Regex>> =
        LazyLock::new(|| Regex::new(r"(?i)file://([^/\s]*)$").ok());
    FILE_URI_PREFIX
        .as_ref()
        .and_then(|regex| regex.captures(&output[..path_start]))
        .and_then(|capture| capture.get(1))
        .is_some_and(|authority| !is_loopback_authority(authority.as_str()))
}

fn is_loopback_authority(authority: &str) -> bool {
    matches!(
        authority.to_ascii_lowercase().as_str(),
        "" | "localhost" | "127.0.0.1" | "::1" | "[::1]"
    )
}

fn decode_percent_escapes(value: &str) -> String {
    let bytes = value.as_bytes();
    let mut decoded = String::with_capacity(value.len());
    let mut cursor = 0;
    while cursor < bytes.len() {
        if bytes[cursor] != b'%' {
            let Some(character) = value[cursor..].chars().next() else {
                break;
            };
            decoded.push(character);
            cursor += character.len_utf8();
            continue;
        }
        let start = cursor;
        let mut escaped = Vec::new();
        while cursor + 2 < bytes.len() && bytes[cursor] == b'%' {
            let Some(high) = hex(bytes[cursor + 1]) else {
                break;
            };
            let Some(low) = hex(bytes[cursor + 2]) else {
                break;
            };
            escaped.push((high << 4) | low);
            cursor += 3;
        }
        if escaped.is_empty() {
            decoded.push('%');
            cursor += 1;
        } else if let Ok(text) = std::str::from_utf8(&escaped) {
            decoded.push_str(text);
        } else {
            decoded.push_str(&value[start..cursor]);
        }
    }
    decoded
}

fn decode_percent_escapes_strict(value: &str) -> Option<String> {
    let bytes = value.as_bytes();
    let mut decoded = String::with_capacity(value.len());
    let mut cursor = 0;
    while cursor < bytes.len() {
        if bytes[cursor] != b'%' {
            let character = value[cursor..].chars().next()?;
            decoded.push(character);
            cursor += character.len_utf8();
            continue;
        }
        let mut escaped = Vec::new();
        while bytes.get(cursor) == Some(&b'%') {
            let high = hex(*bytes.get(cursor + 1)?)?;
            let low = hex(*bytes.get(cursor + 2)?)?;
            escaped.push((high << 4) | low);
            cursor += 3;
        }
        decoded.push_str(std::str::from_utf8(&escaped).ok()?);
    }
    Some(decoded)
}

fn hex(byte: u8) -> Option<u8> {
    match byte {
        b'0'..=b'9' => Some(byte - b'0'),
        b'a'..=b'f' => Some(byte - b'a' + 10),
        b'A'..=b'F' => Some(byte - b'A' + 10),
        _ => None,
    }
}

fn recent_output_includes_path(
    recent_output: &str,
    path_text_or_absolute: &str,
    canonical: &str,
) -> bool {
    let candidates = [path_text_or_absolute.trim(), canonical.trim()];
    if candidates.iter().any(|candidate| {
        !candidate.is_empty() && output_contains_path_candidate(recent_output, candidate)
    }) {
        return true;
    }
    let decoded = decode_percent_escapes(recent_output);
    decoded != recent_output
        && candidates.iter().any(|candidate| {
            !candidate.is_empty() && output_contains_path_candidate(&decoded, candidate)
        })
}

fn output_contains_path_candidate(output: &str, candidate: &str) -> bool {
    output.match_indices(candidate).any(|(start, _)| {
        is_path_candidate_start_boundary(output, start)
            && is_path_candidate_end_boundary(output, start.saturating_add(candidate.len()))
    })
}

fn is_path_candidate_start_boundary(output: &str, start: usize) -> bool {
    if start == 0 {
        return true;
    }
    let prefix = &output[..start];
    if prefix.ends_with("file://") {
        return true;
    }
    let candidate = &output[start..];
    if is_drive_path(candidate) && ends_with_loopback_file_uri(prefix, true) {
        return true;
    }
    if ends_with_loopback_file_uri(prefix, false) {
        return true;
    }
    prefix
        .chars()
        .next_back()
        .is_none_or(|character| !is_path_candidate_continuation(character))
}

fn is_path_candidate_end_boundary(output: &str, end: usize) -> bool {
    let Some(suffix) = output.get(end..) else {
        return false;
    };
    let Some(next) = suffix.chars().next() else {
        return true;
    };
    if next == ':' && is_line_locator(&suffix[1..]) {
        return true;
    }
    !is_path_candidate_continuation(next)
}

fn is_line_locator(value: &str) -> bool {
    let bytes = value.as_bytes();
    let mut cursor = 0;
    while bytes.get(cursor).is_some_and(u8::is_ascii_digit) {
        cursor += 1;
    }
    if cursor == 0 {
        return false;
    }
    if bytes.get(cursor) == Some(&b':') {
        cursor += 1;
        let column_start = cursor;
        while bytes.get(cursor).is_some_and(u8::is_ascii_digit) {
            cursor += 1;
        }
        if cursor == column_start {
            return false;
        }
    }
    bytes.get(cursor).is_none_or(|byte| !byte.is_ascii_digit())
}

fn is_path_candidate_continuation(character: char) -> bool {
    character.is_ascii_alphanumeric()
        || matches!(
            character,
            '.' | '_' | '~' | '/' | '%' | '+' | '@' | '\\' | '(' | ')' | '[' | ']' | '-'
        )
}

fn is_drive_path(value: &str) -> bool {
    value.as_bytes().get(0..3).is_some_and(|bytes| {
        bytes[0].is_ascii_alphabetic() && bytes[1] == b':' && matches!(bytes[2], b'/' | b'\\')
    })
}

fn ends_with_loopback_file_uri(prefix: &str, trailing_slash: bool) -> bool {
    const AUTHORITIES: &[&str] = &["", "localhost", "127.0.0.1", "::1", "[::1]"];
    AUTHORITIES.iter().any(|authority| {
        let suffix = if trailing_slash {
            format!("file://{authority}/")
        } else {
            format!("file://{authority}")
        };
        prefix
            .get(prefix.len().saturating_sub(suffix.len())..)
            .is_some_and(|value| value.eq_ignore_ascii_case(&suffix))
    })
}

fn provenance_candidates(path_text_or_absolute: &str, canonical: &str) -> Vec<String> {
    let mut candidates = Vec::with_capacity(4);
    for value in [path_text_or_absolute, canonical] {
        let value = value.trim();
        if value.is_empty() {
            continue;
        }
        candidates.push(value.to_owned());
        if let Some(alias) = wsl_output_alias(value) {
            candidates.push(alias);
        }
    }
    candidates
}

fn wsl_output_alias(value: &str) -> Option<String> {
    let lower = value.to_ascii_lowercase();
    let remainder = lower
        .strip_prefix("\\\\wsl.localhost\\")
        .or_else(|| lower.strip_prefix("\\\\wsl$\\"))?;
    let distribution_bytes = remainder.find('\\')?;
    if distribution_bytes == 0 {
        return None;
    }
    let path_start = value.len().saturating_sub(remainder.len()) + distribution_bytes;
    let linux_path = value.get(path_start..)?.replace('\\', "/");
    Some(if linux_path.starts_with('/') {
        linux_path
    } else {
        format!("/{linux_path}")
    })
}

fn append_bounded(buffer: &mut String, value: &str, maximum: usize) {
    if value.len() >= maximum {
        buffer.clear();
        buffer.push_str(trailing_bytes(value, maximum));
        return;
    }
    buffer.push_str(value);
    if buffer.len() <= maximum {
        return;
    }
    let retained = trailing_bytes(buffer, maximum).to_owned();
    *buffer = retained;
}

fn trailing_bytes(value: &str, maximum: usize) -> &str {
    if value.len() <= maximum {
        return value;
    }
    let mut start = value.len() - maximum;
    while !value.is_char_boundary(start) {
        start += 1;
    }
    &value[start..]
}
