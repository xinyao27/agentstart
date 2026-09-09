mod model;
mod operations;
mod session;
mod trust_key;

use std::io::{self, Read, Write};

use serde_json::{Value, json};

use model::{GrantError, parse_request};

const REQUEST_MAX_BYTES: u64 = 16 * 1_024 * 1_024;

pub(super) async fn run() -> Result<(), io::Error> {
    let mut raw = Vec::new();
    io::stdin()
        .take(REQUEST_MAX_BYTES + 1)
        .read_to_end(&mut raw)?;
    let envelope = if u64::try_from(raw.len()).unwrap_or(u64::MAX) > REQUEST_MAX_BYTES {
        failure(&GrantError::Message(format!(
            "trust-grant request exceeded {REQUEST_MAX_BYTES} bytes"
        )))
    } else {
        match parse_request(&raw) {
            Ok(request) => match operations::execute(request).await {
                Ok(result) => json!({ "ok": true, "result": result }),
                Err(error) => failure(&error),
            },
            Err(error) => failure(&error),
        }
    };
    let mut output = serde_json::to_vec(&envelope).map_err(io::Error::other)?;
    output.push(b'\n');
    let stdout = io::stdout();
    let mut stdout = stdout.lock();
    stdout.write_all(&output)?;
    stdout.flush()
}

fn failure(error: &GrantError) -> Value {
    let mut envelope = serde_json::Map::new();
    envelope.insert("ok".to_owned(), Value::Bool(false));
    envelope.insert(
        "errorName".to_owned(),
        Value::String(error.error_name().to_owned()),
    );
    envelope.insert("message".to_owned(), Value::String(error.to_string()));
    if error.is_unsupported() {
        envelope.insert("unsupported".to_owned(), Value::Bool(true));
    }
    Value::Object(envelope)
}
