use std::collections::HashMap;
use std::fs::OpenOptions;
use std::path::{Path, PathBuf};
use std::time::Duration;

use regex::Regex;
use reqwest::header::{AUTHORIZATION, CONTENT_TYPE};
use serde_json::{Map, Value, json};

const QUOTA_URL: &str = "https://cloudcode-pa.googleapis.com/v1internal:retrieveUserQuota";
const PROJECT_URL: &str = "https://cloudcode-pa.googleapis.com/v1internal:loadCodeAssist";
const TOKEN_URL: &str = "https://oauth2.googleapis.com/token";
const FILE_BYTE_LIMIT: u64 = 2 * 1024 * 1024;
const BUNDLE_BYTE_LIMIT: u64 = 32 * 1024 * 1024;
const OAUTH_SUBPATH: &[&str] = &["dist", "src", "code_assist", "oauth2.js"];
const BINARY_LOOKUP_TIMEOUT: Duration = Duration::from_secs(5);

pub(super) async fn fetch(client: &reqwest::Client, enabled: bool) -> Value {
    if !enabled {
        return unavailable("Gemini CLI OAuth is disabled in settings");
    }
    match fetch_enabled(client).await {
        Ok(value) => value,
        Err(message) => result(&message, "error"),
    }
}

async fn fetch_enabled(client: &reqwest::Client) -> Result<Value, String> {
    if let Some(auth) = read_open_code_auth()? {
        return fetch_auth_json(client, auth).await;
    }
    let Some(credentials) = read_gemini_credentials()? else {
        return Ok(unavailable("Gemini CLI credentials not found"));
    };
    fetch_credentials(client, credentials).await
}

struct AuthJson {
    access: String,
    expires: f64,
    refresh: String,
}

struct Credentials {
    access_token: String,
    refresh_token: String,
    expiry_date: f64,
}

struct Refresh {
    access_token: String,
    expires_in: Option<f64>,
}

async fn fetch_auth_json(client: &reqwest::Client, auth: AuthJson) -> Result<Value, String> {
    let refresh_token = auth.refresh.split('|').next().unwrap_or_default();
    let access_token = if auth.expires < super::now_ms_lossy() || auth.access.is_empty() {
        let Some(refresh) = refresh_from_bundle(client, refresh_token).await? else {
            return Ok(result("Token refresh failed", "error"));
        };
        refresh.access_token
    } else {
        auth.access
    };
    let fallback_project = auth
        .refresh
        .split('|')
        .skip(1)
        .find(|value| !value.is_empty())
        .unwrap_or_default();
    let project = load_project(client, &access_token)
        .await
        .unwrap_or_else(|_| fallback_project.to_owned());
    if project.is_empty() {
        return Ok(result("Gemini project ID not found", "error"));
    }
    let first = fetch_quota(client, &access_token, &project).await?;
    if quota_is_unauthorized(&first)
        && let Some(refresh) = refresh_from_bundle(client, refresh_token).await?
    {
        let project = load_project(client, &refresh.access_token)
            .await
            .unwrap_or(project);
        return fetch_quota(client, &refresh.access_token, &project).await;
    }
    Ok(first)
}

async fn fetch_credentials(
    client: &reqwest::Client,
    mut credentials: Credentials,
) -> Result<Value, String> {
    if credentials.expiry_date < super::now_ms_lossy() {
        let Some(refresh) = refresh_from_bundle(client, &credentials.refresh_token).await? else {
            return Ok(result("Token refresh failed", "error"));
        };
        credentials.access_token = refresh.access_token;
        if let Some(expires_in) = refresh.expires_in {
            credentials.expiry_date = super::now_ms_lossy() + expires_in * 1_000.0;
        }
        save_gemini_credentials(&credentials)?;
    }
    let project = load_project(client, &credentials.access_token)
        .await
        .unwrap_or_default();
    if project.is_empty() {
        return Ok(result("Gemini project ID not found", "error"));
    }
    let first = fetch_quota(client, &credentials.access_token, &project).await?;
    if quota_is_unauthorized(&first)
        && let Some(refresh) = refresh_from_bundle(client, &credentials.refresh_token).await?
    {
        let project = load_project(client, &refresh.access_token)
            .await
            .unwrap_or_default();
        if !project.is_empty() {
            credentials.access_token = refresh.access_token;
            if let Some(expires_in) = refresh.expires_in {
                credentials.expiry_date = super::now_ms_lossy() + expires_in * 1_000.0;
            }
            save_gemini_credentials(&credentials)?;
            return fetch_quota(client, &credentials.access_token, &project).await;
        }
    }
    Ok(first)
}

async fn fetch_quota(
    client: &reqwest::Client,
    access_token: &str,
    project: &str,
) -> Result<Value, String> {
    let response = client
        .post(QUOTA_URL)
        .header(CONTENT_TYPE, "application/json")
        .header(AUTHORIZATION, format!("Bearer {access_token}"))
        .json(&json!({ "project": project }))
        .send()
        .await
        .map_err(|error| error.to_string())?;
    if !response.status().is_success() {
        return Ok(result(
            &format!("Quota fetch failed ({})", response.status().as_u16()),
            "error",
        ));
    }
    let payload = response
        .json::<Value>()
        .await
        .map_err(|error| error.to_string())?;
    let raw_buckets = payload
        .as_array()
        .or_else(|| payload.get("buckets").and_then(Value::as_array))
        .into_iter()
        .flatten()
        .filter_map(bucket)
        .collect::<Vec<_>>();
    let buckets = deduplicate(raw_buckets);
    let session = buckets
        .iter()
        .max_by(|left, right| left.used_percent.total_cmp(&right.used_percent))
        .map(|bucket| bucket.window.clone());
    Ok(json!({
        "provider": "gemini",
        "session": session,
        "weekly": null,
        "buckets": buckets.into_iter().map(|bucket| {
            let mut value = bucket.window.as_object().cloned().unwrap_or_default();
            value.insert("name".to_owned(), Value::String(bucket.name));
            Value::Object(value)
        }).collect::<Vec<_>>(),
        "updatedAt": super::now_ms_lossy(),
        "error": null,
        "status": "ok"
    }))
}

fn quota_is_unauthorized(value: &Value) -> bool {
    value.get("status").and_then(Value::as_str) == Some("error")
        && value
            .get("error")
            .and_then(Value::as_str)
            .is_some_and(|error| error.contains("401"))
}

async fn load_project(client: &reqwest::Client, access_token: &str) -> Result<String, String> {
    let response = client
        .post(PROJECT_URL)
        .header(CONTENT_TYPE, "application/json")
        .header(AUTHORIZATION, format!("Bearer {access_token}"))
        .json(&json!({ "metadata": { "ideType": "GEMINI_CLI", "pluginType": "GEMINI" } }))
        .send()
        .await
        .map_err(|error| error.to_string())?;
    if !response.status().is_success() {
        return Err(format!(
            "Failed to load Gemini project ID (HTTP {})",
            response.status().as_u16()
        ));
    }
    response
        .json::<Value>()
        .await
        .map_err(|error| error.to_string())?
        .get("cloudaicompanionProject")
        .and_then(Value::as_str)
        .filter(|value| !value.is_empty())
        .map(str::to_owned)
        .ok_or_else(|| "Gemini project ID not found in API response".to_owned())
}

async fn refresh_from_bundle(
    client: &reqwest::Client,
    refresh_token: &str,
) -> Result<Option<Refresh>, String> {
    if refresh_token.is_empty() {
        return Ok(None);
    }
    let Some((client_id, client_secret)) = oauth_client_credentials().await? else {
        return Ok(None);
    };
    let body = url::form_urlencoded::Serializer::new(String::new())
        .append_pair("client_id", &client_id)
        .append_pair("client_secret", &client_secret)
        .append_pair("refresh_token", refresh_token)
        .append_pair("grant_type", "refresh_token")
        .finish();
    let response = client
        .post(TOKEN_URL)
        .header(CONTENT_TYPE, "application/x-www-form-urlencoded")
        .body(body)
        .send()
        .await
        .map_err(|error| error.to_string())?;
    if !response.status().is_success() {
        return Ok(None);
    }
    let value = response
        .json::<Value>()
        .await
        .map_err(|error| error.to_string())?;
    Ok(value
        .get("access_token")
        .and_then(Value::as_str)
        .filter(|value| !value.is_empty())
        .map(|access_token| Refresh {
            access_token: access_token.to_owned(),
            expires_in: value
                .get("expires_in")
                .and_then(Value::as_f64)
                .filter(|value| value.is_finite()),
        }))
}

fn read_open_code_auth() -> Result<Option<AuthJson>, String> {
    for path in open_code_auth_paths() {
        let Some(value) = read_json_if_present(&path)? else {
            continue;
        };
        let Some(google) = value.get("google").and_then(Value::as_object) else {
            return Ok(None);
        };
        if google.get("type").and_then(Value::as_str) != Some("oauth") {
            return Ok(None);
        }
        return Ok(Some(AuthJson {
            access: google
                .get("access")
                .and_then(Value::as_str)
                .unwrap_or_default()
                .to_owned(),
            expires: google
                .get("expires")
                .and_then(Value::as_f64)
                .unwrap_or_default(),
            refresh: google
                .get("refresh")
                .and_then(Value::as_str)
                .unwrap_or_default()
                .to_owned(),
        }));
    }
    Ok(None)
}

fn read_gemini_credentials() -> Result<Option<Credentials>, String> {
    let Some(path) = gemini_credentials_path() else {
        return Ok(None);
    };
    let Some(value) = read_json_if_present(&path)? else {
        return Ok(None);
    };
    let Some(object) = value.as_object() else {
        return Ok(None);
    };
    Ok(credentials(object))
}

fn credentials(object: &Map<String, Value>) -> Option<Credentials> {
    Some(Credentials {
        access_token: object.get("access_token")?.as_str()?.to_owned(),
        refresh_token: object.get("refresh_token")?.as_str()?.to_owned(),
        expiry_date: object.get("expiry_date")?.as_f64()?,
    })
}

fn save_gemini_credentials(credentials: &Credentials) -> Result<(), String> {
    use std::io::Write as _;

    let path = gemini_credentials_path().ok_or_else(|| "Gemini home is unavailable".to_owned())?;
    let parent = path
        .parent()
        .ok_or_else(|| "Gemini credential path is invalid".to_owned())?;
    std::fs::create_dir_all(parent).map_err(|error| error.to_string())?;
    let file_name = path
        .file_name()
        .and_then(|value| value.to_str())
        .ok_or_else(|| "Gemini credential path is invalid".to_owned())?;
    let suffix = super::random_uuid().map_err(|error| error.to_string())?;
    let temporary = path.with_file_name(format!("{file_name}.{}.{suffix}.tmp", std::process::id()));
    let contents = serde_json::to_vec_pretty(&json!({
        "access_token": credentials.access_token,
        "refresh_token": credentials.refresh_token,
        "expiry_date": credentials.expiry_date
    }))
    .map_err(|error| error.to_string())?;
    let mut options = OpenOptions::new();
    options.write(true).create_new(true);
    configure_sensitive_create(&mut options);
    let mut file = options
        .open(&temporary)
        .map_err(|error| error.to_string())?;
    let prepared = file
        .write_all(&contents)
        .and_then(|()| file.write_all(b"\n"))
        .and_then(|()| file.sync_all());
    drop(file);
    if let Err(error) = prepared {
        let _ = std::fs::remove_file(&temporary);
        return Err(error.to_string());
    }
    if let Err(error) = crate::atomic_file_replace::replace(&temporary, &path) {
        let _ = std::fs::remove_file(&temporary);
        return Err(error.to_string());
    }
    sync_parent(parent).map_err(|error| error.to_string())?;
    Ok(())
}

async fn oauth_client_credentials() -> Result<Option<(String, String)>, String> {
    let Some(binary) = gemini_binary().await else {
        return Ok(None);
    };
    let binary = std::fs::canonicalize(&binary).unwrap_or(binary);
    for candidate in known_oauth_paths(&binary) {
        if let Some(credentials) = parse_oauth_file(&candidate, BUNDLE_BYTE_LIMIT) {
            return Ok(Some(credentials));
        }
    }
    let Some(package) = find_package_root(&binary) else {
        return Ok(None);
    };
    for candidate in [
        append(
            &package.join("node_modules/@google/gemini-cli-core"),
            OAUTH_SUBPATH,
        ),
        append(&package, OAUTH_SUBPATH),
    ] {
        if let Some(credentials) = parse_oauth_file(&candidate, BUNDLE_BYTE_LIMIT) {
            return Ok(Some(credentials));
        }
    }
    let bundle = package.join("bundle");
    let entries = match std::fs::read_dir(bundle) {
        Ok(entries) => entries,
        Err(_) => return Ok(None),
    };
    for entry in entries.flatten().take(512) {
        let path = entry.path();
        if path.extension().and_then(|value| value.to_str()) != Some("js") {
            continue;
        }
        if let Some(credentials) = parse_oauth_file(&path, BUNDLE_BYTE_LIMIT) {
            return Ok(Some(credentials));
        }
    }
    Ok(None)
}

async fn gemini_binary() -> Option<PathBuf> {
    let finder = if cfg!(target_os = "windows") {
        "where"
    } else {
        "which"
    };
    let mut command = tokio::process::Command::new(finder);
    command.arg("gemini").kill_on_drop(true);
    if let Ok(Ok(output)) = tokio::time::timeout(BINARY_LOOKUP_TIMEOUT, command.output()).await
        && output.status.success()
        && let Some(path) = String::from_utf8_lossy(&output.stdout)
            .lines()
            .map(str::trim)
            .find(|value| !value.is_empty())
            .map(PathBuf::from)
        && path.is_file()
    {
        return Some(path);
    }
    if cfg!(target_os = "windows") {
        return None;
    }
    let home = crate::paths::resolve_local_home_path()?;
    [
        PathBuf::from("/usr/local/bin/gemini"),
        PathBuf::from("/opt/homebrew/bin/gemini"),
        home.join(".local/bin/gemini"),
        home.join("bin/gemini"),
    ]
    .into_iter()
    .find(|path| path.is_file())
}

fn known_oauth_paths(binary: &Path) -> Vec<PathBuf> {
    let Some(bin_dir) = binary.parent() else {
        return Vec::new();
    };
    let Some(base) = bin_dir.parent() else {
        return Vec::new();
    };
    [
        base.join(
            "libexec/lib/node_modules/@google/gemini-cli/node_modules/@google/gemini-cli-core",
        ),
        base.join("lib/node_modules/@google/gemini-cli/node_modules/@google/gemini-cli-core"),
        base.join("share/gemini-cli/node_modules/@google/gemini-cli-core"),
        base.join("../gemini-cli-core"),
        base.join("node_modules/@google/gemini-cli-core"),
    ]
    .into_iter()
    .map(|path| append(&path, OAUTH_SUBPATH))
    .collect()
}

fn find_package_root(binary: &Path) -> Option<PathBuf> {
    let mut current = binary.parent().map(Path::to_path_buf)?;
    for _ in 0..=8 {
        if package_name(&current.join("package.json")).as_deref() == Some("@google/gemini-cli") {
            return Some(current);
        }
        for candidate in [
            current.join("lib/node_modules/@google/gemini-cli"),
            current.join("node_modules/@google/gemini-cli"),
        ] {
            if candidate.join("package.json").is_file() {
                return Some(candidate);
            }
        }
        let Some(parent) = current.parent().map(Path::to_path_buf) else {
            break;
        };
        if parent == current {
            break;
        }
        current = parent;
    }
    None
}

fn package_name(path: &Path) -> Option<String> {
    read_json_if_present(path)
        .ok()
        .flatten()
        .and_then(|value| value.get("name").and_then(Value::as_str).map(str::to_owned))
}

fn parse_oauth_file(path: &Path, limit: u64) -> Option<(String, String)> {
    let contents = read_file_if_present(path, limit).ok().flatten()?;
    let client_id = Regex::new(r#"OAUTH_CLIENT_ID\s*=\s*[\"']([^\"']+)[\"']"#)
        .ok()?
        .captures(&contents)
        .and_then(|capture| capture.get(1))
        .map(|value| value.as_str().to_owned());
    let client_secret = Regex::new(r#"OAUTH_CLIENT_SECRET\s*=\s*[\"']([^\"']+)[\"']"#)
        .ok()?
        .captures(&contents)
        .and_then(|capture| capture.get(1))
        .map(|value| value.as_str().to_owned());
    client_id.zip(client_secret)
}

fn read_json_if_present(path: &Path) -> Result<Option<Value>, String> {
    let Some(contents) = read_file_if_present(path, FILE_BYTE_LIMIT)? else {
        return Ok(None);
    };
    serde_json::from_str(&contents)
        .map(Some)
        .map_err(|error| error.to_string())
}

fn read_file_if_present(path: &Path, limit: u64) -> Result<Option<String>, String> {
    let metadata = match std::fs::metadata(path) {
        Ok(metadata) => metadata,
        Err(error) if error.kind() == std::io::ErrorKind::NotFound => return Ok(None),
        Err(error) => return Err(error.to_string()),
    };
    if !metadata.is_file() || metadata.len() > limit {
        return Ok(None);
    }
    std::fs::read_to_string(path)
        .map(Some)
        .map_err(|error| error.to_string())
}

fn open_code_auth_paths() -> Vec<PathBuf> {
    let mut paths = Vec::new();
    if let Some(value) = std::env::var_os("APPDATA") {
        paths.push(PathBuf::from(value).join("opencode/auth.json"));
    }
    if let Some(value) = std::env::var_os("XDG_DATA_HOME") {
        paths.push(PathBuf::from(value).join("opencode/auth.json"));
    }
    if let Some(home) = crate::paths::resolve_local_home_path() {
        paths.push(home.join(".local/share/opencode/auth.json"));
        paths.push(home.join("Library/Application Support/opencode/auth.json"));
    }
    paths
}

fn gemini_credentials_path() -> Option<PathBuf> {
    crate::paths::resolve_local_home_path().map(|home| home.join(".gemini/oauth_creds.json"))
}

fn append(root: &Path, components: &[&str]) -> PathBuf {
    components
        .iter()
        .fold(root.to_path_buf(), |path, component| path.join(component))
}

#[cfg(unix)]
fn configure_sensitive_create(options: &mut OpenOptions) {
    use std::os::unix::fs::OpenOptionsExt as _;

    options.mode(0o600).custom_flags(nix::libc::O_NOFOLLOW);
}

#[cfg(windows)]
fn configure_sensitive_create(options: &mut OpenOptions) {
    use std::os::windows::fs::OpenOptionsExt as _;

    const FILE_FLAG_OPEN_REPARSE_POINT: u32 = 0x0020_0000;
    options.custom_flags(FILE_FLAG_OPEN_REPARSE_POINT);
}

#[cfg(not(any(unix, windows)))]
fn configure_sensitive_create(_options: &mut OpenOptions) {}

#[cfg(unix)]
fn sync_parent(path: &Path) -> std::io::Result<()> {
    std::fs::File::open(path)?.sync_all()
}

#[cfg(not(unix))]
fn sync_parent(_path: &Path) -> std::io::Result<()> {
    Ok(())
}

struct Bucket {
    model: String,
    name: String,
    used_percent: f64,
    window: Value,
}

fn bucket(value: &Value) -> Option<Bucket> {
    let object = value.as_object()?;
    let remaining = object
        .get("remainingFraction")?
        .as_f64()
        .filter(|value| value.is_finite())?;
    let reset = object.get("resetTime")?.as_str()?;
    let model = object.get("modelId")?.as_str()?.to_owned();
    let used = ((1.0 - remaining) * 100.0).round().clamp(0.0, 100.0);
    let resets_at = chrono::DateTime::parse_from_rfc3339(reset)
        .ok()
        .map(|time| time.timestamp_millis() as f64);
    Some(Bucket {
        name: bucket_name(&model),
        model,
        used_percent: used,
        window: super::window(used, 60, resets_at),
    })
}

fn deduplicate(buckets: Vec<Bucket>) -> Vec<Bucket> {
    let mut positions = HashMap::<String, usize>::new();
    let mut output: Vec<Bucket> = Vec::new();
    for bucket in buckets {
        let resets = bucket
            .window
            .get("resetsAt")
            .map(Value::to_string)
            .unwrap_or_else(|| "null".to_owned());
        let key = format!("{}-{resets}", bucket.used_percent);
        let Some(position) = positions.get(&key).copied() else {
            positions.insert(key, output.len());
            output.push(bucket);
            continue;
        };
        let existing = &output[position];
        let existing_known = known_bucket_name(&existing.model).is_some();
        let current_known = known_bucket_name(&bucket.model).is_some();
        if current_known && !existing_known
            || current_known == existing_known && bucket.name.len() < existing.name.len()
        {
            output[position] = bucket;
        }
    }
    output
}

fn bucket_name(model: &str) -> String {
    known_bucket_name(model).map_or_else(
        || {
            model
                .strip_prefix("gemini-")
                .unwrap_or(model)
                .split('-')
                .map(|part| {
                    let mut characters = part.chars();
                    characters.next().map_or_else(String::new, |first| {
                        first.to_uppercase().collect::<String>() + characters.as_str()
                    })
                })
                .collect::<Vec<_>>()
                .join(" ")
        },
        str::to_owned,
    )
}

fn known_bucket_name(model: &str) -> Option<&'static str> {
    Some(match model {
        "gemini-3.1-pro" => "3.1 Pro",
        "gemini-3.1-flash" => "3.1 Flash",
        "gemini-3.1-flash-lite" => "3.1 Flash Lite",
        "gemini-3.0-pro" => "3.0 Pro",
        "gemini-3.0-flash" => "3.0 Flash",
        "gemini-2.5-pro" => "Pro",
        "gemini-2.5-flash" => "Flash",
        "gemini-2.5-flash-lite" => "Flash Lite",
        "gemini-2.0-pro" => "2.0 Pro",
        "gemini-2.0-flash" => "2.0 Flash",
        "gemini-2.0-flash-lite" => "2.0 Flash Lite",
        "gemini-1.5-pro" => "1.5 Pro",
        "gemini-1.5-flash" => "1.5 Flash",
        "gemini-exp" | "gemini-experimental" => "Exp",
        _ => return None,
    })
}

fn unavailable(message: &str) -> Value {
    result(message, "unavailable")
}

fn result(message: &str, status: &str) -> Value {
    json!({
        "provider": "gemini",
        "session": null,
        "weekly": null,
        "updatedAt": super::now_ms_lossy(),
        "error": message,
        "status": status
    })
}
