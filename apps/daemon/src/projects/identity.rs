use std::time::{SystemTime, UNIX_EPOCH};

use super::ProjectCatalogError;

pub(crate) fn now_millis() -> Result<i64, ProjectCatalogError> {
    i64::try_from(SystemTime::now().duration_since(UNIX_EPOCH)?.as_millis())
        .map_err(ProjectCatalogError::storage)
}

pub(crate) fn random_uuid() -> Result<String, ProjectCatalogError> {
    let mut bytes = [0_u8; 16];
    getrandom::fill(&mut bytes)?;
    bytes[6] = (bytes[6] & 0x0f) | 0x40;
    bytes[8] = (bytes[8] & 0x3f) | 0x80;
    Ok(format!(
        "{:02x}{:02x}{:02x}{:02x}-{:02x}{:02x}-{:02x}{:02x}-{:02x}{:02x}-{:02x}{:02x}{:02x}{:02x}{:02x}{:02x}",
        bytes[0],
        bytes[1],
        bytes[2],
        bytes[3],
        bytes[4],
        bytes[5],
        bytes[6],
        bytes[7],
        bytes[8],
        bytes[9],
        bytes[10],
        bytes[11],
        bytes[12],
        bytes[13],
        bytes[14],
        bytes[15]
    ))
}
