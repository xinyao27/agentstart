// Why: one redaction pass is shared by every outbound support surface —
// diagnostics bundles, crash reports and feedback — so a pattern added here
// protects all three rather than one copy drifting behind the others.
use std::sync::OnceLock;

use regex::Regex;
use serde_json::Value;

pub(crate) fn redact_value(value: Value) -> Value {
    match value {
        Value::String(value) => Value::String(redact_string(&value)),
        Value::Array(values) => Value::Array(values.into_iter().map(redact_value).collect()),
        Value::Object(values) => Value::Object(
            values
                .into_iter()
                .filter(|(key, _)| !blocked_key(key))
                .map(|(key, value)| (key, redact_value(value)))
                .collect(),
        ),
        value => value,
    }
}

pub(crate) fn redact_string(value: &str) -> String {
    let value = labeled().replace_all(value, "[redacted:labeled-kv]");
    let value = anthropic().replace_all(&value, "[redacted:anthropic-key]");
    let value = openai().replace_all(&value, "[redacted:openai-key]");
    let value = github().replace_all(&value, "[redacted:github-token]");
    let value = aws_access().replace_all(&value, "[redacted:aws-access-key-id]");
    let value = aws_secret().replace_all(&value, "[redacted:aws-secret-access-key]");
    let value = jwt().replace_all(&value, "[redacted:jwt]");
    let value = slack().replace_all(&value, "[redacted:slack-token]");
    let value = pem().replace_all(&value, "[redacted:pem]");
    let value = userinfo().replace_all(&value, "${scheme}[redacted]@");
    environment()
        .replace_all(&value, "${key}=[redacted:env-value]")
        .into_owned()
}

/// Scrubs filesystem paths only. Callers that also carry free-form user text
/// run [`redact_string`] first — [`redact_support_text`] does both in order.
pub(crate) fn redact_paths(value: &str) -> String {
    let value = unix_path().replace_all(value, "[redacted-path]");
    let value = windows_path().replace_all(&value, "[redacted-path]");
    unc_path()
        .replace_all(&value, "[redacted-path]")
        .into_owned()
}

pub(crate) fn redact_support_text(value: &str) -> String {
    redact_paths(&redact_string(value))
}

fn blocked_key(key: &str) -> bool {
    let lower = key.to_ascii_lowercase();
    let normalized = lower
        .chars()
        .filter(char::is_ascii_alphanumeric)
        .collect::<String>();
    matches!(
        lower.as_str(),
        "env"
            | "environment"
            | "env_vars"
            | "api_key"
            | "api-key"
            | "apikey"
            | "authorization"
            | "bearer"
            | "cookie"
            | "password"
            | "set-cookie"
            | "secret"
            | "token"
            | "access_token"
            | "refresh_token"
            | "proxy-authorization"
            | "headers.authorization"
            | "install_id"
            | "installid"
            | "distinct_id"
            | "distinctid"
    ) || [
        "apikey",
        "token",
        "secret",
        "password",
        "authorization",
        "bearer",
        "privkey",
        "privatekey",
    ]
    .iter()
    .any(|part| normalized.contains(part))
}

fn expression(cell: &'static OnceLock<Regex>, source: &str) -> &'static Regex {
    cell.get_or_init(|| Regex::new(source).expect("diagnostic redaction expression is valid"))
}

fn labeled() -> &'static Regex {
    static VALUE: OnceLock<Regex> = OnceLock::new();
    expression(
        &VALUE,
        r"(?i)\b(?:api[-_]?key|token|secret|password|bearer|authorization)\b\s*[:=]\s*(?:Bearer\s+\S+|Token\s+\S+|\S+)",
    )
}

fn anthropic() -> &'static Regex {
    static VALUE: OnceLock<Regex> = OnceLock::new();
    expression(&VALUE, r"sk-ant-[a-zA-Z0-9_-]{40,}")
}

fn openai() -> &'static Regex {
    static VALUE: OnceLock<Regex> = OnceLock::new();
    expression(&VALUE, r"sk-(?:proj-)?[a-zA-Z0-9_-]{32,}")
}

fn github() -> &'static Regex {
    static VALUE: OnceLock<Regex> = OnceLock::new();
    expression(&VALUE, r"gh[pousr]_[A-Za-z0-9]{36,}")
}

fn aws_access() -> &'static Regex {
    static VALUE: OnceLock<Regex> = OnceLock::new();
    expression(&VALUE, r"AKIA[0-9A-Z]{16}")
}

fn aws_secret() -> &'static Regex {
    static VALUE: OnceLock<Regex> = OnceLock::new();
    expression(
        &VALUE,
        r"(?i)aws_secret_access_key\s*[:=]\s*[A-Za-z0-9/+=]{40}",
    )
}

fn jwt() -> &'static Regex {
    static VALUE: OnceLock<Regex> = OnceLock::new();
    expression(
        &VALUE,
        r"eyJ[A-Za-z0-9_-]{10,}\.[A-Za-z0-9_-]{10,}\.[A-Za-z0-9_-]{10,}",
    )
}

fn slack() -> &'static Regex {
    static VALUE: OnceLock<Regex> = OnceLock::new();
    expression(&VALUE, r"xox[baprsoe]-[A-Za-z0-9-]{10,}")
}

fn pem() -> &'static Regex {
    static VALUE: OnceLock<Regex> = OnceLock::new();
    expression(
        &VALUE,
        r"(?s)-----BEGIN [A-Z ]+-----.+?-----END [A-Z ]+-----",
    )
}

fn userinfo() -> &'static Regex {
    static VALUE: OnceLock<Regex> = OnceLock::new();
    expression(&VALUE, r"(?P<scheme>https?://)[^/@\s]+@")
}

fn environment() -> &'static Regex {
    static VALUE: OnceLock<Regex> = OnceLock::new();
    expression(&VALUE, r"(?m)^\s*(?P<key>[A-Z_][A-Z0-9_]*)\s*=\s*\S.*$")
}

fn unix_path() -> &'static Regex {
    static VALUE: OnceLock<Regex> = OnceLock::new();
    expression(
        &VALUE,
        r#"/(?:Users|home|Applications|Library|System|Volumes|etc|media|mnt|opt|private|root|srv|tmp|usr|var)/[^"'`<>\n\r)]+"#,
    )
}

fn windows_path() -> &'static Regex {
    static VALUE: OnceLock<Regex> = OnceLock::new();
    expression(&VALUE, r#"(?i)[A-Z]:\\[^"'`<>\n\r)]+"#)
}

fn unc_path() -> &'static Regex {
    static VALUE: OnceLock<Regex> = OnceLock::new();
    expression(&VALUE, r#"\\\\[^\\\s"'`<>\n\r)]+\\[^"'`<>\n\r)]+"#)
}
