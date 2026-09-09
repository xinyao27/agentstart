use std::path::PathBuf;

use base64::Engine as _;
use regex::Regex;

use crate::transport::secure_file;

use super::AccountsError;

const COOKIE_BYTE_LIMIT: usize = 64 * 1024;
const COOKIE_ENVELOPE_PREFIX: &str = "yiru-minimax-cookie:v1:";
const COOKIE_PLAINTEXT_PREFIX: &str = "yiru-minimax-cookie:v1:plaintext:";

pub(crate) fn status() -> Result<bool, AccountsError> {
    let path = cookie_path()?;
    match std::fs::symlink_metadata(&path) {
        Ok(metadata) if metadata.file_type().is_file() && !metadata.file_type().is_symlink() => {
            secure_file::harden_existing_file(&path)?;
            Ok(true)
        }
        Ok(_) => Err(AccountsError::InvalidState),
        Err(error) if error.kind() == std::io::ErrorKind::NotFound => Ok(false),
        Err(error) => Err(error.into()),
    }
}

pub(crate) fn save(cookie: &str) -> Result<bool, AccountsError> {
    let cookie = cookie.trim();
    if cookie.is_empty()
        || cookie.len() > COOKIE_BYTE_LIMIT
        || cookie.chars().any(|character| character.is_control())
    {
        return Err(AccountsError::Input("cookie"));
    }
    let encoded = base64::engine::general_purpose::STANDARD.encode(cookie.as_bytes());
    secure_file::write_bytes(
        &cookie_path()?,
        format!("{COOKIE_PLAINTEXT_PREFIX}{encoded}").as_bytes(),
    )?;
    Ok(true)
}

pub(crate) fn read() -> Result<Option<String>, AccountsError> {
    let path = cookie_path()?;
    let metadata = match std::fs::symlink_metadata(&path) {
        Ok(metadata) if metadata.file_type().is_file() && !metadata.file_type().is_symlink() => {
            metadata
        }
        Ok(_) => return Err(AccountsError::InvalidState),
        Err(error) if error.kind() == std::io::ErrorKind::NotFound => return Ok(None),
        Err(error) => return Err(error.into()),
    };
    if metadata.len() > (COOKIE_PLAINTEXT_PREFIX.len() + COOKIE_BYTE_LIMIT * 2) as u64 {
        return Err(AccountsError::InvalidState);
    }
    secure_file::harden_existing_file(&path)?;
    let contents = std::fs::read_to_string(path)?;
    if let Some(encoded) = contents.strip_prefix(COOKIE_PLAINTEXT_PREFIX) {
        let decoded = base64::engine::general_purpose::STANDARD
            .decode(encoded)
            .map_err(|_| AccountsError::InvalidState)?;
        if decoded.len() > COOKIE_BYTE_LIMIT {
            return Err(AccountsError::InvalidState);
        }
        return String::from_utf8(decoded)
            .map(Some)
            .map_err(|_| AccountsError::InvalidState);
    }
    if contents.starts_with(COOKIE_ENVELOPE_PREFIX) || !looks_like_cookie_header(&contents) {
        return Err(AccountsError::InvalidState);
    }
    Ok(Some(contents.trim().to_owned()))
}

pub(crate) fn clear() -> Result<bool, AccountsError> {
    match std::fs::remove_file(cookie_path()?) {
        Ok(()) => Ok(false),
        Err(error) if error.kind() == std::io::ErrorKind::NotFound => Ok(false),
        Err(error) => Err(error.into()),
    }
}

fn cookie_path() -> Result<PathBuf, AccountsError> {
    crate::paths::resolve_local_home_path()
        .map(|home| home.join(".yiru").join("minimax-session-cookie.enc"))
        .ok_or(AccountsError::InvalidState)
}

fn looks_like_cookie_header(value: &str) -> bool {
    let value = value.trim();
    if value.is_empty() || value.chars().any(char::is_control) {
        return false;
    }
    let lower = value.to_ascii_lowercase();
    if lower.starts_with("cookie:") {
        return value
            .get("cookie:".len()..)
            .is_some_and(|rest| !rest.trim().is_empty());
    }
    Regex::new(r"(?:^|;\s*)[A-Za-z0-9_.-]+\s*=").is_ok_and(|expression| expression.is_match(value))
        || Regex::new(r#"(?:^|[;\s])[A-Za-z0-9_.-]+\s*:\s*["'][^"']+["']"#)
            .is_ok_and(|expression| expression.is_match(value))
}
