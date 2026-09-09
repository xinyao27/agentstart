use std::io::{Read, Write};

use serde::Deserialize;
use serde_json::{Value, json};
use thiserror::Error;

const MAX_REQUEST_BYTES: u64 = 8 * 1_024 * 1_024;

#[derive(Deserialize)]
#[serde(rename_all = "camelCase")]
struct Request {
    content: String,
    file_label: String,
    options: RequestOptions,
}

#[derive(Deserialize)]
#[serde(rename_all = "camelCase")]
struct RequestOptions {
    id_discriminator: Option<String>,
    id_suffix: Option<String>,
    imported_at: Option<String>,
    source_label: Option<String>,
}

#[derive(Debug, Error)]
pub(super) enum EntryError {
    #[error("theme parser input failed: {0}")]
    Input(#[source] std::io::Error),
    #[error("theme parser output failed: {0}")]
    Output(#[source] serde_json::Error),
    #[error("theme parser output flush failed: {0}")]
    Flush(#[source] std::io::Error),
}

pub(super) fn run() -> Result<(), EntryError> {
    let result = read_request().map_or_else(
        |reason| json!({ "ok": false, "reason": reason }),
        |request| {
            crate::settings::parse_warp_theme_entry(
                &request.content,
                &request.file_label,
                request.options.id_discriminator.as_deref(),
                request.options.id_suffix.as_deref(),
                request.options.imported_at.as_deref(),
                request.options.source_label.as_deref(),
            )
            .map_or_else(
                |reason| json!({ "ok": false, "reason": reason }),
                |theme| json!({ "ok": true, "theme": theme }),
            )
        },
    );
    let stdout = std::io::stdout();
    let mut output = stdout.lock();
    serde_json::to_writer(&mut output, &result).map_err(EntryError::Output)?;
    output.write_all(b"\n").map_err(EntryError::Flush)?;
    output.flush().map_err(EntryError::Flush)
}

fn read_request() -> Result<Request, String> {
    let stdin = std::io::stdin();
    let mut input = Vec::new();
    stdin
        .lock()
        .take(MAX_REQUEST_BYTES + 1)
        .read_to_end(&mut input)
        .map_err(|error| EntryError::Input(error).to_string())?;
    if input.len() as u64 > MAX_REQUEST_BYTES {
        return Err("Theme parser received an invalid request.".to_owned());
    }
    let value = serde_json::from_slice::<Value>(&input).map_err(|error| error.to_string())?;
    serde_json::from_value(value)
        .map_err(|_| "Theme parser received an invalid request.".to_owned())
}
