use serde_json::Value;

use super::{InputIssues, PathSegment, invalid_type_issue, value_type};

pub(crate) fn parse_string(
    value: Option<&Value>,
    path: &[PathSegment],
    issues: &mut InputIssues,
) -> Option<String> {
    let Some(value) = value.and_then(Value::as_str) else {
        issues.push(invalid_type_issue(path, "string", value_type(value)));
        return None;
    };
    Some(value.to_owned())
}

// Why: shared with the protobuf handlers so the legacy zod rule and the
// proto request rule cannot disagree about what counts as an id.
pub(crate) fn is_uuid(value: &str) -> bool {
    if matches!(
        value,
        "00000000-0000-0000-0000-000000000000" | "ffffffff-ffff-ffff-ffff-ffffffffffff"
    ) {
        return true;
    }
    let bytes = value.as_bytes();
    bytes.len() == 36
        && [8, 13, 18, 23]
            .into_iter()
            .all(|index| bytes[index] == b'-')
        && bytes
            .iter()
            .enumerate()
            .all(|(index, byte)| [8, 13, 18, 23].contains(&index) || byte.is_ascii_hexdigit())
        && matches!(bytes[14], b'1'..=b'8')
        && matches!(bytes[19], b'8' | b'9' | b'a'..=b'b' | b'A'..=b'B')
}

// Why: shared with the protobuf handlers so the legacy zod rule and the
// proto request rule cannot disagree about what counts as a URL.
pub(crate) fn normalize_url(value: &str) -> Option<String> {
    let trimmed = value.trim_matches(is_ecmascript_whitespace);
    let normalized = trimmed
        .chars()
        .filter(|character| !matches!(character, '\t' | '\n' | '\r'))
        .collect::<String>();
    url::Url::parse(&normalized).ok().map(|_| normalized)
}

pub(crate) fn trim_ecmascript_whitespace(value: &str) -> &str {
    value.trim_matches(is_ecmascript_whitespace)
}

fn is_ecmascript_whitespace(character: char) -> bool {
    matches!(
        character,
        '\u{0009}'
            ..='\u{000d}'
                | '\u{0020}'
                | '\u{00a0}'
                | '\u{1680}'
                | '\u{2000}'..='\u{200a}'
                | '\u{2028}'
                | '\u{2029}'
                | '\u{202f}'
                | '\u{205f}'
                | '\u{3000}'
                | '\u{feff}'
    )
}
