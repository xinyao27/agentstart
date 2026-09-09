pub(super) fn requested(value: Option<&str>) -> Option<&str> {
    value.map(trim).filter(|value| !value.is_empty())
}

fn trim(value: &str) -> &str {
    value.trim_matches(is_whitespace)
}

fn is_whitespace(character: char) -> bool {
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
