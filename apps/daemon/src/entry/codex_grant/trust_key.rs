use std::path::PathBuf;

const EVENT_LABELS: &[&str] = &[
    "pre_tool_use",
    "permission_request",
    "post_tool_use",
    "pre_compact",
    "post_compact",
    "session_start",
    "user_prompt_submit",
    "subagent_start",
    "subagent_stop",
    "stop",
];

pub(super) fn normalize(key: &str) -> String {
    let Some(parsed) = parse(key) else {
        return crate::runtime_path::comparison_key(key);
    };
    let source = if parsed.source.starts_with("//") {
        parsed.source.to_owned()
    } else {
        normalize_source_path(parsed.source)
    };
    format!(
        "{}:{}:{}:{}",
        crate::runtime_path::comparison_key(&source),
        parsed.event,
        parsed.group,
        parsed.handler
    )
}

struct ParsedKey<'a> {
    event: &'a str,
    group: &'a str,
    handler: &'a str,
    source: &'a str,
}

fn parse(key: &str) -> Option<ParsedKey<'_>> {
    let mut fields = key.rsplitn(4, ':');
    let handler = fields.next()?;
    let group = fields.next()?;
    let event = fields.next()?;
    let source = fields.next()?;
    if source.is_empty()
        || !is_canonical_nonnegative_integer(group)
        || !is_canonical_nonnegative_integer(handler)
        || !EVENT_LABELS.contains(&event)
    {
        return None;
    }
    Some(ParsedKey {
        event,
        group,
        handler,
        source,
    })
}

fn is_canonical_nonnegative_integer(value: &str) -> bool {
    !value.is_empty()
        && value.bytes().all(|byte| byte.is_ascii_digit())
        && (value == "0" || !value.starts_with('0'))
}

fn normalize_source_path(source: &str) -> String {
    let source = strip_windows_device_prefix(source);
    if is_windows_absolute(&source) {
        return normalize_lexical(&source.replace('\\', "/"));
    }
    if source.starts_with('/') {
        return normalize_lexical(&source);
    }
    let current = std::env::current_dir().unwrap_or_else(|_| PathBuf::from("."));
    let joined = current.join(&source).to_string_lossy().into_owned();
    normalize_lexical(&joined.replace('\\', "/"))
}

fn strip_windows_device_prefix(source: &str) -> String {
    let lowercase = source.to_ascii_lowercase();
    for prefix in [r"\\?\unc\", r"\\.\unc\"] {
        if lowercase.starts_with(prefix) {
            return format!("\\\\{}", &source[prefix.len()..]);
        }
    }
    for prefix in [r"\\?\", r"\\.\"] {
        if lowercase.starts_with(prefix)
            && source
                .as_bytes()
                .get(prefix.len())
                .is_some_and(u8::is_ascii_alphabetic)
        {
            return source[prefix.len()..].to_owned();
        }
    }
    source.to_owned()
}

fn is_windows_absolute(source: &str) -> bool {
    let bytes = source.as_bytes();
    bytes.len() >= 3
        && bytes[0].is_ascii_alphabetic()
        && bytes[1] == b':'
        && matches!(bytes[2], b'/' | b'\\')
        || source.starts_with("\\\\")
}

fn normalize_lexical(source: &str) -> String {
    let (root, remainder) = split_root(source);
    let mut segments = Vec::new();
    for segment in remainder.split('/') {
        match segment {
            "" | "." => {}
            ".." if !segments.is_empty() => {
                segments.pop();
            }
            ".." if root.is_empty() => segments.push(segment),
            ".." => {}
            _ => segments.push(segment),
        }
    }
    let suffix = segments.join("/");
    if root.is_empty() {
        return if suffix.is_empty() {
            ".".to_owned()
        } else {
            suffix
        };
    }
    if suffix.is_empty() {
        return root;
    }
    format!("{root}{suffix}")
}

fn split_root(source: &str) -> (String, &str) {
    let bytes = source.as_bytes();
    if bytes.len() >= 3 && bytes[0].is_ascii_alphabetic() && bytes[1] == b':' && bytes[2] == b'/' {
        return (source[..3].to_owned(), &source[3..]);
    }
    if let Some(remainder) = source.strip_prefix("//") {
        let mut components = remainder.splitn(3, '/');
        let server = components.next().unwrap_or_default();
        let share = components.next().unwrap_or_default();
        let tail = components.next().unwrap_or_default();
        if !server.is_empty() && !share.is_empty() {
            return (format!("//{server}/{share}/"), tail);
        }
        return ("//".to_owned(), remainder);
    }
    if let Some(remainder) = source.strip_prefix('/') {
        return ("/".to_owned(), remainder);
    }
    (String::new(), source)
}
