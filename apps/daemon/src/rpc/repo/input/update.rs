use serde_json::{Map, Value, json};

pub(crate) fn normalize_badge(value: &Value) -> Option<String> {
    let value = crate::repositories::ecmascript::trim(value.as_str()?);
    let value = value.strip_prefix('#').unwrap_or(value);
    if !matches!(value.len(), 3 | 6) || !value.bytes().all(|byte| byte.is_ascii_hexdigit()) {
        return None;
    }
    let value = value.to_ascii_lowercase();
    Some(if value.len() == 3 {
        format!(
            "#{}{}{}{}{}{}",
            &value[0..1],
            &value[0..1],
            &value[1..2],
            &value[1..2],
            &value[2..3],
            &value[2..3]
        )
    } else {
        format!("#{value}")
    })
}

pub(crate) fn sanitize_repo_icon(value: &Value) -> Option<Value> {
    if value.is_null() {
        return Some(Value::Null);
    }
    let icon = value.as_object()?;
    match icon.get("type").and_then(Value::as_str) {
        Some("lucide") => {
            let name = crate::repositories::ecmascript::trim(icon.get("name")?.as_str()?);
            let mut chars = name.chars();
            if name.len() > 40
                || !chars
                    .next()
                    .is_some_and(|character| character.is_ascii_alphabetic())
                || !chars.all(|character| character.is_ascii_alphanumeric())
            {
                None
            } else {
                Some(json!({ "type":"lucide", "name":name }))
            }
        }
        Some("emoji") => {
            let emoji = crate::repositories::ecmascript::trim(icon.get("emoji")?.as_str()?);
            (!emoji.is_empty() && emoji.encode_utf16().count() <= 16)
                .then(|| json!({ "type":"emoji", "emoji":emoji }))
        }
        Some("image") => sanitize_image(icon),
        _ => None,
    }
}

fn sanitize_image(icon: &Map<String, Value>) -> Option<Value> {
    let src = crate::repositories::ecmascript::trim(icon.get("src")?.as_str()?);
    let source = icon.get("source")?.as_str()?;
    if crate::repositories::ecmascript::utf16_len(src) > 400 * 1024
        || !matches!(source, "upload" | "file" | "favicon" | "github")
    {
        return None;
    }
    let supported = match source {
        "upload" | "file" => is_png_data_url(src),
        "github" => https_url(src).is_some_and(|url| {
            url.host_str() == Some("github.com") && is_github_avatar_path(url.path())
        }),
        "favicon" => https_url(src).is_some_and(|url| {
            url.host_str() == Some("www.google.com") && url.path() == "/s2/favicons"
        }),
        _ => false,
    };
    if !supported {
        return None;
    }
    let label = icon
        .get("label")
        .and_then(Value::as_str)
        .map(crate::repositories::ecmascript::trim)
        .filter(|value| !value.is_empty())
        .map(|value| crate::repositories::ecmascript::truncate_utf16(value, 80));
    let mut output = Map::new();
    output.insert("type".to_owned(), json!("image"));
    output.insert("src".to_owned(), json!(src));
    output.insert("source".to_owned(), json!(source));
    if let Some(label) = label {
        output.insert("label".to_owned(), json!(label));
    }
    Some(Value::Object(output))
}

fn is_png_data_url(value: &str) -> bool {
    const PREFIX: &str = "data:image/png;base64,";
    let Some(prefix) = value.get(..PREFIX.len()) else {
        return false;
    };
    if !prefix.eq_ignore_ascii_case(PREFIX) {
        return false;
    }
    let encoded = &value[PREFIX.len()..];
    !encoded.is_empty()
        && encoded.chars().all(|character| {
            character.is_ascii_alphanumeric()
                || matches!(character, '+' | '/' | '=')
                || crate::repositories::ecmascript::is_whitespace(character)
        })
}

fn is_github_avatar_path(path: &str) -> bool {
    let Some(name) = path.strip_prefix('/') else {
        return false;
    };
    let Some(suffix) = name.get(name.len().saturating_sub(4)..) else {
        return false;
    };
    name.len() > 4 && !name.contains('/') && suffix.eq_ignore_ascii_case(".png")
}

fn https_url(value: &str) -> Option<url::Url> {
    let url = url::Url::parse(value).ok()?;
    (url.scheme() == "https").then_some(url)
}
