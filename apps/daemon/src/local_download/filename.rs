const WINDOWS_RESERVED_NAMES: &[&str] = &["aux", "con", "conin$", "conout$", "nul", "prn"];

pub(super) fn sanitize(remote_basename: &str) -> String {
    let sanitized = remote_basename
        .chars()
        .map(|character| {
            if character < ' '
                || matches!(
                    character,
                    '<' | '>' | ':' | '"' | '/' | '\\' | '|' | '?' | '*'
                )
            {
                '_'
            } else {
                character
            }
        })
        .collect::<String>()
        .trim_end_matches(['.', ' '])
        .to_owned();
    if sanitized.is_empty() || is_windows_reserved(&sanitized) {
        "download".to_owned()
    } else {
        sanitized
    }
}

fn is_windows_reserved(name: &str) -> bool {
    let basename = name.split('.').next().unwrap_or_default().to_lowercase();
    WINDOWS_RESERVED_NAMES.contains(&basename.as_str())
        || reserved_numbered_name(&basename, "com")
        || reserved_numbered_name(&basename, "lpt")
}

fn reserved_numbered_name(name: &str, prefix: &str) -> bool {
    name.strip_prefix(prefix).is_some_and(|suffix| {
        matches!(
            suffix,
            "1" | "2" | "3" | "4" | "5" | "6" | "7" | "8" | "9" | "¹" | "²" | "³"
        )
    })
}
