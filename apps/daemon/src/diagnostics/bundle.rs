use std::fs::{self, OpenOptions};
use std::io::{self, Read};
use std::path::{Path, PathBuf};
use std::sync::Arc;
use std::sync::atomic::{AtomicBool, Ordering};

use base64::Engine;
use base64::engine::general_purpose::URL_SAFE_NO_PAD;
use chrono::{DateTime, SecondsFormat, Utc};
use serde_json::{Value, json};
use tokio::sync::OwnedSemaphorePermit;

use crate::transport::secure_file;

use super::trace_file::{configure_no_follow, is_regular_file, trace_family_paths};
use crate::redaction::{redact_support_text, redact_value};

const DEFAULT_LOOKBACK_MINUTES: u32 = 30;
const MAX_BUNDLE_BYTES: usize = 4 * 1024 * 1024;
const MAX_SOURCE_FILE_BYTES: u64 = 50 * 1024 * 1024;
const MAX_EXCERPT_CHARS: usize = 16_000;
const MAX_EXCERPT_LINE_CHARS: usize = 4_000;

pub(super) struct BundleMaterial {
    pub(super) bundle_submission_id: String,
    pub(super) bytes: u64,
    pub(super) excerpt: String,
    pub(super) excerpt_truncated: bool,
    pub(super) payload: Vec<u8>,
    pub(super) span_count: u32,
}

pub(super) struct PreparedPreview {
    path: Option<PathBuf>,
}

struct CollectionCancellation {
    canceled: Arc<AtomicBool>,
    is_finished: bool,
}

impl PreparedPreview {
    pub(super) fn commit(mut self) -> PathBuf {
        self.path
            .take()
            .expect("a prepared diagnostic preview has one path")
    }
}

impl Drop for PreparedPreview {
    fn drop(&mut self) {
        if let Some(path) = self.path.take() {
            remove_file(&path);
        }
    }
}

impl Drop for CollectionCancellation {
    fn drop(&mut self) {
        if !self.is_finished {
            self.canceled.store(true, Ordering::Relaxed);
        }
    }
}

pub(super) async fn collect(
    trace_file_path: PathBuf,
    app_version: String,
    lookback_minutes: Option<u32>,
    permit: OwnedSemaphorePermit,
) -> Result<BundleMaterial, io::Error> {
    let os_release = os_release().await;
    let canceled = Arc::new(AtomicBool::new(false));
    let worker_canceled = Arc::clone(&canceled);
    let mut cancellation = CollectionCancellation {
        canceled,
        is_finished: false,
    };
    let joined = tokio::task::spawn_blocking(move || {
        let _permit = permit;
        collect_sync(
            &trace_file_path,
            &app_version,
            lookback_minutes,
            &os_release,
            &worker_canceled,
        )
    })
    .await;
    cancellation.is_finished = true;
    joined.map_err(io::Error::other)?
}

fn collect_sync(
    trace_file_path: &Path,
    app_version: &str,
    lookback_minutes: Option<u32>,
    os_release: &str,
    canceled: &AtomicBool,
) -> Result<BundleMaterial, io::Error> {
    let lookback = lookback_minutes.unwrap_or(DEFAULT_LOOKBACK_MINUTES);
    let cutoff = Utc::now() - chrono::Duration::minutes(i64::from(lookback));
    let bundle_submission_id = bundle_id()?;
    let header = json!({
        "type": "bundle-header",
        "bundle_submission_id": bundle_submission_id,
        "app_version": app_version,
        "platform": platform(),
        "arch": architecture(),
        "os_release": os_release,
        "yiru_channel": channel(),
        "collected_at": Utc::now().to_rfc3339_opts(SecondsFormat::Millis, true),
        "schema_version": 1
    });
    let mut payload = serde_json::to_vec(&header).map_err(io::Error::other)?;
    payload.push(b'\n');
    let mut span_count = 0_u32;

    'files: for path in trace_paths(trace_file_path) {
        ensure_collection_active(canceled)?;
        let contents = match read_source(&path) {
            Ok(contents) => contents,
            Err(_) => continue,
        };
        for raw in contents.rsplit(|byte| *byte == b'\n') {
            ensure_collection_active(canceled)?;
            let raw = raw.strip_suffix(b"\r").unwrap_or(raw);
            if raw.is_empty() {
                continue;
            }
            let Ok(record) = serde_json::from_slice::<Value>(raw) else {
                continue;
            };
            if !record.is_object() || older_than(&record, cutoff) {
                continue;
            }
            let redacted = redact_value(record);
            let mut encoded = match serde_json::to_vec(&redacted) {
                Ok(encoded) => encoded,
                Err(_) => continue,
            };
            encoded.push(b'\n');
            if encoded.len() > MAX_BUNDLE_BYTES.saturating_sub(payload.len().min(MAX_BUNDLE_BYTES))
            {
                if encoded.len() > MAX_BUNDLE_BYTES.saturating_sub(header_size(&payload)) {
                    continue;
                }
                break 'files;
            }
            payload.extend_from_slice(&encoded);
            span_count = span_count.saturating_add(1);
        }
    }
    let (excerpt, excerpt_truncated) = diagnostic_excerpt(&payload);
    Ok(BundleMaterial {
        bundle_submission_id,
        bytes: u64::try_from(payload.len()).unwrap_or(u64::MAX),
        excerpt,
        excerpt_truncated,
        payload,
        span_count,
    })
}

fn ensure_collection_active(canceled: &AtomicBool) -> Result<(), io::Error> {
    if canceled.load(Ordering::Relaxed) {
        Err(io::Error::new(
            io::ErrorKind::Interrupted,
            "diagnostic collection was canceled",
        ))
    } else {
        Ok(())
    }
}

pub(super) async fn write_preview(
    preview_file_path: PathBuf,
    payload: Vec<u8>,
) -> Result<PreparedPreview, io::Error> {
    tokio::task::spawn_blocking(move || {
        secure_file::write_bytes(&preview_file_path, &payload).map_err(io::Error::other)?;
        Ok(PreparedPreview {
            path: Some(preview_file_path),
        })
    })
    .await
    .map_err(io::Error::other)?
}

fn header_size(payload: &[u8]) -> usize {
    payload
        .iter()
        .position(|byte| *byte == b'\n')
        .map_or(payload.len(), |index| index + 1)
}

fn bundle_id() -> Result<String, io::Error> {
    let mut bytes = [0_u8; 16];
    getrandom::fill(&mut bytes).map_err(io::Error::other)?;
    Ok(URL_SAFE_NO_PAD.encode(bytes))
}

fn trace_paths(path: &Path) -> Vec<PathBuf> {
    trace_family_paths(path)
        .into_iter()
        .filter(|candidate| {
            fs::symlink_metadata(candidate).is_ok_and(|metadata| {
                is_regular_file(&metadata) && metadata.len() <= MAX_SOURCE_FILE_BYTES
            })
        })
        .collect()
}

fn read_source(path: &Path) -> Result<Vec<u8>, io::Error> {
    let before = fs::symlink_metadata(path)?;
    if !is_regular_file(&before) || before.len() > MAX_SOURCE_FILE_BYTES {
        return Err(io::Error::new(
            io::ErrorKind::InvalidData,
            "diagnostic source is not a bounded regular file",
        ));
    }
    let mut options = OpenOptions::new();
    options.read(true);
    configure_no_follow(&mut options);
    let mut file = options.open(path)?;
    let opened = file.metadata()?;
    if !is_regular_file(&opened)
        || opened.len() != before.len()
        || !same_file(path, &file, &before, &opened)?
    {
        return Err(io::Error::new(
            io::ErrorKind::InvalidData,
            "diagnostic source changed while opening",
        ));
    }
    let mut contents = Vec::with_capacity(usize::try_from(opened.len()).unwrap_or(0));
    file.by_ref()
        .take(MAX_SOURCE_FILE_BYTES.saturating_add(1))
        .read_to_end(&mut contents)?;
    if u64::try_from(contents.len()).unwrap_or(u64::MAX) > MAX_SOURCE_FILE_BYTES {
        return Err(io::Error::new(
            io::ErrorKind::InvalidData,
            "diagnostic source exceeds the byte limit",
        ));
    }
    let after = file.metadata()?;
    if !same_file(path, &file, &opened, &after)?
        || after.len() != opened.len()
        || after.modified().ok() != opened.modified().ok()
    {
        return Err(io::Error::new(
            io::ErrorKind::InvalidData,
            "diagnostic source changed while reading",
        ));
    }
    Ok(contents)
}

#[cfg(unix)]
fn same_file(
    _path: &Path,
    _file: &fs::File,
    left: &fs::Metadata,
    right: &fs::Metadata,
) -> io::Result<bool> {
    use std::os::unix::fs::MetadataExt;

    Ok(left.dev() == right.dev() && left.ino() == right.ino())
}

#[cfg(windows)]
fn same_file(
    path: &Path,
    file: &fs::File,
    _left: &fs::Metadata,
    _right: &fs::Metadata,
) -> io::Result<bool> {
    Ok(same_file::Handle::from_file(file.try_clone()?)? == same_file::Handle::from_path(path)?)
}

#[cfg(not(any(unix, windows)))]
fn same_file(
    _path: &Path,
    _file: &fs::File,
    _left: &fs::Metadata,
    _right: &fs::Metadata,
) -> io::Result<bool> {
    Ok(false)
}

fn older_than(record: &Value, cutoff: DateTime<Utc>) -> bool {
    if let Some(end_time) = record.get("endTimeUnixNano").and_then(Value::as_str)
        && let Ok(nanos) = end_time.parse::<i128>()
    {
        let cutoff_nanos = i128::from(cutoff.timestamp()) * 1_000_000_000
            + i128::from(cutoff.timestamp_subsec_nanos());
        return nanos < cutoff_nanos;
    }
    record
        .get("ts")
        .and_then(Value::as_str)
        .and_then(|timestamp| DateTime::parse_from_rfc3339(timestamp).ok())
        .is_some_and(|timestamp| timestamp < cutoff)
}

fn diagnostic_excerpt(payload: &[u8]) -> (String, bool) {
    let text = String::from_utf8_lossy(payload);
    let nonempty_count = text.lines().filter(|line| !line.is_empty()).count();
    let mut selected = Vec::new();
    let mut remaining = MAX_EXCERPT_CHARS;
    let mut truncated = false;
    for line in text.lines().rev().filter(|line| !line.is_empty()) {
        let sanitized = truncate_utf16(&redact_support_text(line), MAX_EXCERPT_LINE_CHARS);
        if sanitized.is_empty() {
            continue;
        }
        let separator = usize::from(!selected.is_empty());
        let available = remaining.saturating_sub(separator);
        let line_length = sanitized.encode_utf16().count();
        if available == 0 || line_length > available {
            if available > 0 {
                selected.push(truncate_utf16(&sanitized, available));
            }
            truncated = true;
            break;
        }
        selected.push(sanitized);
        remaining = remaining.saturating_sub(line_length + separator);
    }
    if selected.is_empty() {
        return (
            "[no diagnostic records available]".to_owned(),
            !payload.is_empty(),
        );
    }
    selected.reverse();
    let selected_count = selected.len();
    (
        selected.join("\n"),
        truncated || selected_count != nonempty_count,
    )
}

fn truncate_utf16(value: &str, limit: usize) -> String {
    let mut units = 0;
    value
        .chars()
        .take_while(|character| {
            let next = units + character.len_utf16();
            if next > limit {
                return false;
            }
            units = next;
            true
        })
        .collect()
}

fn platform() -> &'static str {
    match std::env::consts::OS {
        "macos" => "darwin",
        "windows" => "win32",
        value => value,
    }
}

fn architecture() -> &'static str {
    match std::env::consts::ARCH {
        "x86_64" => "x64",
        "aarch64" => "arm64",
        value => value,
    }
}

fn channel() -> &'static str {
    match std::env::var("YIRU_BUILD_IDENTITY").as_deref() {
        Ok("stable") => "stable",
        Ok("rc") => "rc",
        _ => "dev",
    }
}

async fn os_release() -> String {
    #[cfg(windows)]
    let output = tokio::process::Command::new("cmd")
        .args(["/C", "ver"])
        .output()
        .await;
    #[cfg(not(windows))]
    let output = tokio::process::Command::new("uname")
        .arg("-r")
        .output()
        .await;
    output
        .ok()
        .filter(|output| output.status.success())
        .map(|output| String::from_utf8_lossy(&output.stdout).trim().to_owned())
        .unwrap_or_default()
}

pub(super) fn trace_family_size(path: &Path) -> u64 {
    trace_paths(path)
        .into_iter()
        .filter_map(|path| fs::symlink_metadata(path).ok())
        .filter(is_regular_file)
        .fold(0_u64, |total, metadata| {
            total.saturating_add(metadata.len())
        })
}

pub(super) fn remove_file(path: &Path) {
    match fs::remove_file(path) {
        Ok(()) => {}
        Err(error) if error.kind() == io::ErrorKind::NotFound => {}
        Err(_) => {}
    }
}

pub(super) fn preview_file_is_safe(path: &Path) -> bool {
    path.file_name()
        .and_then(|name| name.to_str())
        .is_some_and(|name| {
            name.ends_with(".ndjson")
                && name
                    .strip_suffix(".ndjson")
                    .is_some_and(valid_bundle_submission_id)
        })
}

pub(super) fn preview_file_can_open(path: &Path) -> bool {
    preview_file_is_safe(path)
        && fs::symlink_metadata(path).is_ok_and(|metadata| {
            is_regular_file(&metadata) && metadata.len() <= MAX_BUNDLE_BYTES as u64
        })
}

pub(super) fn abandoned_preview_file_is_safe(path: &Path) -> bool {
    if preview_file_is_safe(path) {
        return true;
    }
    let Some(name) = path.file_name().and_then(|name| name.to_str()) else {
        return false;
    };
    let Some((bundle_submission_id, staging)) = name.split_once(".ndjson.") else {
        return false;
    };
    let mut parts = staging.split('.');
    let (Some(process_id), Some(random), Some("tmp"), None) =
        (parts.next(), parts.next(), parts.next(), parts.next())
    else {
        return false;
    };
    valid_bundle_submission_id(bundle_submission_id)
        && !process_id.is_empty()
        && process_id.bytes().all(|byte| byte.is_ascii_digit())
        && random.len() == 32
        && random.bytes().all(|byte| byte.is_ascii_hexdigit())
}

pub(super) fn valid_bundle_submission_id(value: &str) -> bool {
    (16..=64).contains(&value.len())
        && value
            .bytes()
            .all(|byte| byte.is_ascii_alphanumeric() || matches!(byte, b'_' | b'-'))
}
