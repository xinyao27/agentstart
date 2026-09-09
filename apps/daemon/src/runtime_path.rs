pub(crate) fn equal(left: &str, right: &str) -> bool {
    comparison_key(left) == comparison_key(right)
}

pub(crate) fn comparison_key(path: &str) -> String {
    let is_windows = is_windows_absolute(path);
    let mut normalized = if is_windows {
        collapse_slashes(&path.replace('\\', "/"))
    } else {
        collapse_slashes(path)
    };
    if normalized != "/" && !is_windows_drive_root(&normalized) {
        normalized.truncate(normalized.trim_end_matches('/').len());
    }
    if let Some(wsl) = normalize_wsl_unc(&normalized) {
        return wsl;
    }
    if is_windows {
        normalized.to_ascii_lowercase()
    } else {
        normalized
    }
}

fn is_windows_absolute(path: &str) -> bool {
    let bytes = path.as_bytes();
    bytes.len() >= 3
        && bytes[0].is_ascii_alphabetic()
        && bytes[1] == b':'
        && matches!(bytes[2], b'/' | b'\\')
        || path.starts_with("\\\\")
        || path.starts_with("//")
}

fn is_windows_drive_root(path: &str) -> bool {
    let bytes = path.as_bytes();
    bytes.len() == 3 && bytes[0].is_ascii_alphabetic() && bytes[1] == b':' && bytes[2] == b'/'
}

fn collapse_slashes(path: &str) -> String {
    let is_unc = path.starts_with("//");
    let mut normalized = String::with_capacity(path.len());
    let mut previous_was_slash = false;
    for character in path.chars() {
        if character == '/' {
            if !previous_was_slash {
                normalized.push(character);
            }
            previous_was_slash = true;
        } else {
            normalized.push(character);
            previous_was_slash = false;
        }
    }
    if is_unc && !normalized.starts_with("//") {
        normalized.insert(0, '/');
    }
    normalized
}

fn normalize_wsl_unc(path: &str) -> Option<String> {
    let remainder = path.strip_prefix("//")?;
    let (server, remainder) = remainder.split_once('/')?;
    if !server.eq_ignore_ascii_case("wsl.localhost") && !server.eq_ignore_ascii_case("wsl$") {
        return None;
    }
    let (distribution, suffix) = remainder
        .split_once('/')
        .map_or((remainder, ""), |(distribution, suffix)| {
            (distribution, suffix)
        });
    let suffix = if is_drvfs_suffix(suffix) {
        suffix.to_ascii_lowercase()
    } else {
        suffix.to_owned()
    };
    Some(if suffix.is_empty() {
        format!("//wsl.localhost/{}", distribution.to_ascii_lowercase())
    } else {
        format!(
            "//wsl.localhost/{}/{}",
            distribution.to_ascii_lowercase(),
            suffix
        )
    })
}

fn is_drvfs_suffix(suffix: &str) -> bool {
    let Some(remainder) = suffix.strip_prefix("mnt/") else {
        return false;
    };
    let bytes = remainder.as_bytes();
    bytes.first().is_some_and(u8::is_ascii_alphabetic)
        && (bytes.len() == 1 || bytes.get(1) == Some(&b'/'))
}
