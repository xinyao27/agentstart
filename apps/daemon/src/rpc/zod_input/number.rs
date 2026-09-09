use serde_json::{Value, json};

use super::{InputIssues, PathSegment, invalid_type_issue, path_json, value_type};

const MAX_SAFE_INTEGER: i64 = 9_007_199_254_740_991;
const MIN_SAFE_INTEGER: i64 = -9_007_199_254_740_991;

pub(crate) fn parse_integer(
    value: Option<&Value>,
    path: &[PathSegment],
    is_positive: bool,
    maximum: Option<i64>,
    issues: &mut InputIssues,
) -> Option<i64> {
    let Some(number) = value.and_then(Value::as_f64) else {
        issues.push(invalid_type_issue(path, "number", value_type(value)));
        return None;
    };
    if number.fract() != 0.0 {
        issues.push(json!({
            "expected": "int",
            "format": "safeint",
            "code": "invalid_type",
            "path": path_json(path),
            "message": "Invalid input: expected int, received number"
        }));
        return None;
    }
    let mut valid = safe_integer_issues(number, path, issues);
    if is_positive && number <= 0.0 {
        issues.push(json!({
            "origin": "number",
            "code": "too_small",
            "minimum": 0,
            "inclusive": false,
            "path": path_json(path),
            "message": "Too small: expected number to be >0"
        }));
        valid = false;
    }
    if let Some(maximum) = maximum
        && number > maximum as f64
    {
        issues.push(json!({
            "origin": "number",
            "code": "too_big",
            "maximum": maximum,
            "inclusive": true,
            "path": path_json(path),
            "message": format!("Too big: expected number to be <={maximum}")
        }));
        valid = false;
    }
    valid.then_some(number as i64)
}

fn safe_integer_issues(number: f64, path: &[PathSegment], issues: &mut InputIssues) -> bool {
    if number < MIN_SAFE_INTEGER as f64 {
        issues.push(json!({
            "code": "too_small",
            "minimum": MIN_SAFE_INTEGER,
            "note": "Integers must be within the safe integer range.",
            "origin": "int",
            "inclusive": true,
            "path": path_json(path),
            "message": "Too small: expected int to be >=-9007199254740991"
        }));
        false
    } else if number > MAX_SAFE_INTEGER as f64 {
        issues.push(json!({
            "code": "too_big",
            "maximum": MAX_SAFE_INTEGER,
            "note": "Integers must be within the safe integer range.",
            "origin": "int",
            "inclusive": true,
            "path": path_json(path),
            "message": "Too big: expected int to be <=9007199254740991"
        }));
        false
    } else {
        true
    }
}
