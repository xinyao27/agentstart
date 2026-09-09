pub(super) fn is_ecmascript_whitespace(character: char) -> bool {
    matches!(
        character,
        '\u{0009}'..='\u{000d}'
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

pub(super) fn trim(value: &str) -> &str {
    value.trim_matches(is_ecmascript_whitespace)
}

pub(super) fn trim_end(value: &str) -> &str {
    value.trim_end_matches(is_ecmascript_whitespace)
}

pub(super) fn utf16_len(value: &str) -> usize {
    value.encode_utf16().count()
}

pub(super) fn utf16_prefix(value: &str, maximum: usize) -> &str {
    if utf16_len(value) <= maximum {
        return value;
    }
    let mut units = 0;
    let mut end = 0;
    for (index, character) in value.char_indices() {
        let next = units + character.len_utf16();
        if next > maximum {
            break;
        }
        units = next;
        end = index + character.len_utf8();
    }
    &value[..end]
}

pub(super) fn normalize_crlf(value: &str) -> String {
    value.replace("\r\n", "\n")
}
