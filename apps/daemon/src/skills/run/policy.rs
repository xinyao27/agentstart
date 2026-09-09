use serde_json::Value;

pub(crate) fn cli_args(
    operation: &str,
    names: &[String],
    source: Option<&str>,
    scope: Option<&Value>,
) -> Vec<String> {
    let mut args = vec!["--yes".to_owned(), "skills".to_owned()];
    match operation {
        "update" => {
            args.push("update".to_owned());
            args.extend(names.iter().cloned());
            args.extend(["--global".to_owned(), "-y".to_owned()]);
        }
        "install" => {
            args.push("add".to_owned());
            args.push(source.unwrap_or_default().to_owned());
            if !names.is_empty() {
                args.push("--skill".to_owned());
                args.extend(names.iter().cloned());
            }
            if scope
                .and_then(|value| value.get("kind"))
                .and_then(Value::as_str)
                == Some("global")
            {
                args.push("-g".to_owned());
            }
            args.push("-y".to_owned());
        }
        "remove" => {
            args.push("remove".to_owned());
            args.extend(names.iter().cloned());
            if scope
                .and_then(|value| value.get("kind"))
                .and_then(Value::as_str)
                == Some("global")
            {
                args.push("-g".to_owned());
            }
            args.push("-y".to_owned());
        }
        _ => {}
    }
    args
}
pub(crate) fn canonical_names(mut values: Vec<String>, allow_empty: bool) -> Option<Vec<String>> {
    values.sort();
    values.dedup();
    let valid = values.iter().all(|value| {
        let mut characters = value.chars();
        characters
            .next()
            .is_some_and(|character| character.is_ascii_lowercase() || character.is_ascii_digit())
            && characters.all(|character| {
                character.is_ascii_lowercase()
                    || character.is_ascii_digit()
                    || matches!(character, '.' | '_' | '-')
            })
    });
    (valid && (allow_empty || !values.is_empty())).then_some(values)
}

pub(crate) fn canonical_source(value: &str) -> Option<String> {
    let value = value.trim();
    if value.is_empty()
        || value.len() > 200
        || !value.chars().all(|character| {
            character.is_ascii_alphanumeric() || matches!(character, '.' | '_' | '/' | ':' | '-')
        })
    {
        return None;
    }
    if let Some(path) = value.strip_prefix("https://github.com/") {
        let mut parts = path.split('/');
        let owner = parts.next().unwrap_or_default();
        let name = parts.next().unwrap_or_default().trim_end_matches(".git");
        if valid_source_segment(owner) && valid_source_segment(name) {
            return Some(format!("{owner}/{name}"));
        }
        return None;
    }
    let mut parts = value.split('/');
    if let (Some(owner), Some(name), None) = (parts.next(), parts.next(), parts.next())
        && valid_source_segment(owner)
        && valid_source_segment(name)
    {
        return Some(format!("{owner}/{name}"));
    }
    let labels = value.split('.').collect::<Vec<_>>();
    (labels.len() >= 2 && labels.iter().all(valid_domain_label)).then(|| value.to_owned())
}

fn valid_source_segment(value: &str) -> bool {
    value
        .chars()
        .next()
        .is_some_and(|character| character.is_ascii_alphanumeric())
        && value.chars().all(|character| {
            character.is_ascii_alphanumeric() || matches!(character, '.' | '_' | '-')
        })
}

fn valid_domain_label(value: &&str) -> bool {
    !value.is_empty()
        && value
            .chars()
            .next()
            .is_some_and(|character| character.is_ascii_alphanumeric())
        && value
            .chars()
            .all(|character| character.is_ascii_alphanumeric() || character == '-')
}
