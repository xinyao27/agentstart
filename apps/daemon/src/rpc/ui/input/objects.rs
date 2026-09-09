use serde_json::{Map, Value, json};

use crate::ui::FEATURE_INTERACTION_IDS;

use super::collections::{reject_unknown, require_array, require_object};
use super::{
    Issues, child, invalid_type, parse_enum, parse_number, parse_positive_integer, parse_string,
};

pub(super) fn unknown_record(value: &Value, path: &[Value], issues: &mut Issues) -> Option<Value> {
    require_object(value, path, issues).map(|object| Value::Object(object.clone()))
}

pub(super) fn feature_interactions(
    value: &Value,
    path: &[Value],
    issues: &mut Issues,
) -> Option<Value> {
    let object = require_object(value, path, issues)?;
    let mut parsed = Map::new();
    for (id, value) in object {
        let record_path = child(path, id.clone());
        let Some(record) = require_object(value, &record_path, issues) else {
            continue;
        };
        let first_path = child(&record_path, "firstInteractedAt");
        let first = required(record, "firstInteractedAt", "number", &record_path, issues)
            .and_then(|value| parse_nonnegative_number(value, &first_path, issues));
        let count = record.get("interactionCount").and_then(|value| {
            parse_positive_integer(value, &child(&record_path, "interactionCount"), issues)
        });
        reject_unknown(
            record,
            &["firstInteractedAt", "interactionCount"],
            &record_path,
            issues,
        );
        if let Some(first) = first {
            let mut normalized = Map::from_iter([("firstInteractedAt".to_owned(), first)]);
            if let Some(count) = count {
                normalized.insert("interactionCount".to_owned(), count);
            }
            parsed.insert(id.clone(), Value::Object(normalized));
        }
        if !FEATURE_INTERACTION_IDS.contains(&id.as_str()) {
            issues.push(json!({
                "code": "custom",
                "message": format!("Unknown feature interaction id: {id}"),
                "path": record_path
            }));
        }
    }
    Some(Value::Object(parsed))
}

pub(super) fn workspace_cleanup(
    value: &Value,
    path: &[Value],
    issues: &mut Issues,
) -> Option<Value> {
    let object = require_object(value, path, issues)?;
    let dismissals_path = child(path, "dismissals");
    let dismissals = required(object, "dismissals", "object", path, issues)
        .and_then(|value| require_object(value, &dismissals_path, issues));
    let mut parsed = Map::new();
    if let Some(dismissals) = dismissals {
        for (id, value) in dismissals {
            let dismissal_path = child(&dismissals_path, id.clone());
            let Some(dismissal) = require_object(value, &dismissal_path, issues) else {
                continue;
            };
            let worktree_id = required_string(dismissal, "worktreeId", &dismissal_path, issues);
            let dismissed_at = required_number(dismissal, "dismissedAt", &dismissal_path, issues);
            let fingerprint = required_string(dismissal, "fingerprint", &dismissal_path, issues);
            let classifier =
                required_number(dismissal, "classifierVersion", &dismissal_path, issues);
            reject_unknown(
                dismissal,
                &[
                    "worktreeId",
                    "dismissedAt",
                    "fingerprint",
                    "classifierVersion",
                ],
                &dismissal_path,
                issues,
            );
            if let (Some(worktree_id), Some(dismissed_at), Some(fingerprint), Some(classifier)) =
                (worktree_id, dismissed_at, fingerprint, classifier)
            {
                parsed.insert(
                    id.clone(),
                    json!({
                        "worktreeId": worktree_id,
                        "dismissedAt": dismissed_at,
                        "fingerprint": fingerprint,
                        "classifierVersion": classifier
                    }),
                );
            }
        }
    }
    reject_unknown(object, &["dismissals"], path, issues);
    Some(json!({ "dismissals": parsed }))
}

pub(super) fn nullable_theme(value: &Value, path: &[Value], issues: &mut Issues) -> Option<Value> {
    if value.is_null() {
        Some(Value::Null)
    } else {
        theme(value, path, issues)
    }
}

pub(super) fn theme_record(value: &Value, path: &[Value], issues: &mut Issues) -> Option<Value> {
    let object = require_object(value, path, issues)?;
    let parsed = object
        .iter()
        .filter_map(|(id, value)| {
            theme(value, &child(path, id.clone()), issues).map(|theme| (id.clone(), theme))
        })
        .collect();
    Some(Value::Object(parsed))
}

fn theme(value: &Value, path: &[Value], issues: &mut Issues) -> Option<Value> {
    let object = require_object(value, path, issues)?;
    let dots_path = child(path, "dots");
    let dots = required(object, "dots", "array", path, issues)
        .and_then(|value| parse_dots(value, &dots_path, issues));
    let harmony = required(object, "harmony", "string", path, issues).and_then(|value| {
        parse_enum(
            value,
            &child(path, "harmony"),
            &[
                "floating",
                "complementary",
                "singleAnalogous",
                "splitComplementary",
                "analogous",
                "triadic",
            ],
            issues,
        )
    });
    let opacity = required_number(object, "opacity", path, issues);
    let texture = required_number(object, "texture", path, issues);
    reject_unknown(
        object,
        &["dots", "harmony", "opacity", "texture"],
        path,
        issues,
    );
    match (dots, harmony, opacity, texture) {
        (Some(dots), Some(harmony), Some(opacity), Some(texture)) => Some(json!({
            "dots": dots,
            "harmony": harmony,
            "opacity": opacity,
            "texture": texture
        })),
        _ => None,
    }
}

fn parse_dots(value: &Value, path: &[Value], issues: &mut Issues) -> Option<Value> {
    let values = require_array(value, path, issues)?;
    let mut parsed = Vec::new();
    for (index, value) in values.iter().enumerate() {
        let dot_path = child(path, index);
        let Some(object) = require_object(value, &dot_path, issues) else {
            continue;
        };
        let x = required_number(object, "x", &dot_path, issues);
        let y = required_number(object, "y", &dot_path, issues);
        let mode = required(object, "mode", "string", &dot_path, issues).and_then(|value| {
            parse_enum(
                value,
                &child(&dot_path, "mode"),
                &["wheel", "tint", "grayscale"],
                issues,
            )
        });
        let lightness = required_number(object, "lightness", &dot_path, issues);
        reject_unknown(object, &["x", "y", "mode", "lightness"], &dot_path, issues);
        if let (Some(x), Some(y), Some(mode), Some(lightness)) = (x, y, mode, lightness) {
            parsed.push(json!({ "x": x, "y": y, "mode": mode, "lightness": lightness }));
        }
    }
    Some(Value::Array(parsed))
}

fn parse_nonnegative_number(value: &Value, path: &[Value], issues: &mut Issues) -> Option<Value> {
    let number = parse_number(value, path, issues)?;
    if number.as_f64().is_some_and(|number| number >= 0.0) {
        return Some(number);
    }
    issues.push(json!({
        "origin": "number",
        "code": "too_small",
        "minimum": 0,
        "inclusive": true,
        "path": path,
        "message": "Too small: expected number to be >=0"
    }));
    None
}

fn required<'a>(
    object: &'a Map<String, Value>,
    field: &str,
    expected: &str,
    path: &[Value],
    issues: &mut Issues,
) -> Option<&'a Value> {
    object.get(field).or_else(|| {
        issues.push(invalid_type(
            &child(path, field.to_owned()),
            expected,
            "undefined",
        ));
        None
    })
}

fn required_string(
    object: &Map<String, Value>,
    field: &str,
    path: &[Value],
    issues: &mut Issues,
) -> Option<Value> {
    required(object, field, "string", path, issues)
        .and_then(|value| parse_string(value, &child(path, field.to_owned()), issues))
}

fn required_number(
    object: &Map<String, Value>,
    field: &str,
    path: &[Value],
    issues: &mut Issues,
) -> Option<Value> {
    required(object, field, "number", path, issues)
        .and_then(|value| parse_number(value, &child(path, field.to_owned()), issues))
}
