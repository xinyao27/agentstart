mod discovery;
mod parser;
mod scanner;

use std::path::Path;
use std::sync::{Arc, OnceLock};
use std::time::{Duration, Instant, SystemTime, UNIX_EPOCH};

use serde_json::{Value, json};
use tokio::io::AsyncReadExt;
use tokio::sync::Semaphore;

const YAML_WORKERS: usize = 2;

static YAML_WORKER_PERMITS: OnceLock<Arc<Semaphore>> = OnceLock::new();

pub(super) fn parse_entry(
    content: &str,
    file_label: &str,
    id_discriminator: &str,
    id_suffix: Option<&str>,
    source_label: &str,
    imported_at: &str,
) -> Result<Value, String> {
    parser::parse(
        content,
        file_label,
        id_discriminator,
        id_suffix,
        source_label,
        imported_at,
    )
}

pub(super) async fn preview(kind: &str) -> Value {
    if kind != "auto" {
        return json!({
            "found": false, "canceled": true, "desktopOnly": true,
            "themes": [], "skippedFiles": []
        });
    }
    let started = Instant::now();
    let (files, mut skipped) = scanner::scan(started).await;
    let mut themes = Vec::new();
    let mut ids = std::collections::HashMap::<String, usize>::new();
    let imported_at = timestamp();
    for file in files {
        let bytes = match read_theme(&file.path).await {
            Ok(bytes) => bytes,
            Err(reason) => {
                skipped.push(json!({ "label": file.label, "reason": reason }));
                continue;
            }
        };
        let content = match String::from_utf8(bytes) {
            Ok(content) => content,
            Err(_) => {
                skipped.push(json!({ "label": file.label, "reason": "Invalid UTF-8." }));
                continue;
            }
        };
        match parse_theme(
            content,
            file.label.clone(),
            file.source_label,
            imported_at.clone(),
        )
        .await
        {
            Ok(mut theme) => {
                let id = theme
                    .get("id")
                    .and_then(Value::as_str)
                    .unwrap_or_default()
                    .to_owned();
                let count = ids
                    .entry(id.clone())
                    .and_modify(|count| *count += 1)
                    .or_insert(1);
                if *count > 1 {
                    let id = format!("{id}-{count}");
                    if let Some(theme) = theme.as_object_mut() {
                        theme.insert("id".to_owned(), Value::String(id.clone()));
                        theme.insert(
                            "selectionValue".to_owned(),
                            Value::String(format!("custom:{id}")),
                        );
                    }
                }
                themes.push(theme);
            }
            Err(reason) => skipped.push(json!({ "label": file.label, "reason": reason })),
        }
        if started.elapsed() >= Duration::from_secs(5) {
            skipped.push(json!({ "label": "Warp themes", "reason": "Preview budget expired before all theme files were scanned." }));
            break;
        }
    }
    json!({
        "found": !themes.is_empty(), "sourceLabel": "Warp themes",
        "themes": themes, "skippedFiles": skipped
    })
}

async fn parse_theme(
    content: String,
    label: String,
    source_label: String,
    imported_at: String,
) -> Result<Value, String> {
    let semaphore = YAML_WORKER_PERMITS
        .get_or_init(|| Arc::new(Semaphore::new(YAML_WORKERS)))
        .clone();
    let permit = semaphore
        .acquire_owned()
        .await
        .map_err(|_| "Could not parse theme file.".to_owned())?;
    tokio::task::spawn_blocking(move || {
        let _permit = permit;
        parser::parse(&content, &label, &label, None, &source_label, &imported_at)
    })
    .await
    .map_err(|_| "Could not parse theme file.".to_owned())?
}

async fn read_theme(path: &Path) -> Result<Vec<u8>, String> {
    let metadata = tokio::fs::metadata(path)
        .await
        .map_err(|_| "Could not read file.".to_owned())?;
    if !metadata.is_file() {
        return Err("Not a file.".to_owned());
    }
    if metadata.len() > 1_000_000 {
        return Err(format!(
            "File is too large to import ({} bytes, limit 1000000).",
            metadata.len()
        ));
    }
    let file = tokio::fs::File::open(path)
        .await
        .map_err(|_| "Could not read file.".to_owned())?;
    let mut bytes = Vec::with_capacity(metadata.len() as usize);
    file.take(1_000_001)
        .read_to_end(&mut bytes)
        .await
        .map_err(|_| "Could not read file.".to_owned())?;
    if bytes.len() > 1_000_000 {
        return Err(format!(
            "File is too large to import ({} bytes, limit 1000000).",
            bytes.len()
        ));
    }
    Ok(bytes)
}

pub(super) fn timestamp() -> String {
    let elapsed = SystemTime::now()
        .duration_since(UNIX_EPOCH)
        .unwrap_or_default();
    let seconds = i64::try_from(elapsed.as_secs()).unwrap_or(i64::MAX);
    let days = seconds.div_euclid(86_400) + 719_468;
    let era = if days >= 0 { days } else { days - 146_096 } / 146_097;
    let day_of_era = days - era * 146_097;
    let year_of_era =
        (day_of_era - day_of_era / 1_460 + day_of_era / 36_524 - day_of_era / 146_096) / 365;
    let mut year = year_of_era + era * 400;
    let day_of_year = day_of_era - (365 * year_of_era + year_of_era / 4 - year_of_era / 100);
    let month_prime = (5 * day_of_year + 2) / 153;
    let day = day_of_year - (153 * month_prime + 2) / 5 + 1;
    let month = month_prime + if month_prime < 10 { 3 } else { -9 };
    year += i64::from(month <= 2);
    let day_seconds = seconds.rem_euclid(86_400);
    format!(
        "{year:04}-{month:02}-{day:02}T{:02}:{:02}:{:02}.{:03}Z",
        day_seconds / 3_600,
        day_seconds % 3_600 / 60,
        day_seconds % 60,
        elapsed.subsec_millis()
    )
}
