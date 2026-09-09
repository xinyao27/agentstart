use super::ParsedBinding;

pub(super) fn normalize_key(token: &str) -> Option<String> {
    if token == " " {
        return Some("Space".to_owned());
    }
    let upper = token.trim().to_uppercase();
    if upper.len() == 1
        && upper
            .bytes()
            .next()
            .is_some_and(|value| value.is_ascii_uppercase() || value.is_ascii_digit())
    {
        return Some(upper);
    }
    if function_key(&upper) {
        return Some(upper);
    }
    key_alias(&upper).map(str::to_owned)
}

pub(super) fn safe_bare_key(parsed: &ParsedBinding) -> bool {
    if parsed.is_mod || parsed.is_meta || parsed.is_control || parsed.is_alt {
        return false;
    }
    if parsed.is_shift {
        return function_key(&parsed.key);
    }
    function_key(&parsed.key)
        || matches!(
            parsed.key.as_str(),
            "Backspace"
                | "Delete"
                | "Enter"
                | "Escape"
                | "Tab"
                | "ArrowLeft"
                | "ArrowRight"
                | "ArrowUp"
                | "ArrowDown"
                | "PageUp"
                | "PageDown"
        )
}

fn key_alias(key: &str) -> Option<&'static str> {
    Some(match key {
        "[" | "{" | "BRACKETLEFT" => "BracketLeft",
        "]" | "}" | "BRACKETRIGHT" => "BracketRight",
        "-" | "MINUS" => "Minus",
        "_" | "UNDERSCORE" => "Underscore",
        "=" | "EQUAL" => "Equal",
        "+" | "PLUS" => "Plus",
        "," | "COMMA" => "Comma",
        "." | "PERIOD" => "Period",
        "/" | "SLASH" => "Slash",
        "\\" | "BACKSLASH" => "Backslash",
        ";" | "SEMICOLON" => "Semicolon",
        "'" | "QUOTE" => "Quote",
        "`" | "BACKQUOTE" => "Backquote",
        "RETURN" | "ENTER" => "Enter",
        "ESC" | "ESCAPE" => "Escape",
        "SPACEBAR" | "SPACE" => "Space",
        "PGUP" | "PAGEUP" => "PageUp",
        "PGDN" | "PAGEDOWN" => "PageDown",
        "ARROWLEFT" | "LEFT" => "ArrowLeft",
        "ARROWRIGHT" | "RIGHT" => "ArrowRight",
        "ARROWUP" | "UP" => "ArrowUp",
        "ARROWDOWN" | "DOWN" => "ArrowDown",
        "BACKSPACE" => "Backspace",
        "DELETE" | "DEL" => "Delete",
        "INSERT" | "INS" => "Insert",
        "TAB" => "Tab",
        "NUMPADADD" | "ADD" => "NumpadAdd",
        "NUMPADSUBTRACT" | "SUBTRACT" => "NumpadSubtract",
        _ => return None,
    })
}

fn function_key(key: &str) -> bool {
    let Some(value) = key.strip_prefix('F') else {
        return false;
    };
    (value.len() == 1 && matches!(value.as_bytes()[0], b'1'..=b'9'))
        || (value.len() == 2
            && value
                .parse::<u8>()
                .is_ok_and(|value| (10..=24).contains(&value)))
}
