use std::time::{SystemTime, UNIX_EPOCH};

use super::MobileDeviceStoreError;
pub(super) use crate::identity::random_uuid;

pub(super) fn now_millis() -> Result<i64, MobileDeviceStoreError> {
    i64::try_from(SystemTime::now().duration_since(UNIX_EPOCH)?.as_millis())
        .map_err(MobileDeviceStoreError::storage)
}

pub(super) fn random_token() -> Result<String, MobileDeviceStoreError> {
    let mut bytes = [0_u8; 24];
    getrandom::fill(&mut bytes)?;
    Ok(bytes
        .into_iter()
        .map(|byte| format!("{byte:02x}"))
        .collect())
}
