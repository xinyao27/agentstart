pub(super) use crate::identity::random_uuid;
use std::time::{SystemTime, SystemTimeError, UNIX_EPOCH};

pub(super) fn now_millis() -> Result<u128, SystemTimeError> {
    Ok(SystemTime::now().duration_since(UNIX_EPOCH)?.as_millis())
}

pub(super) fn now_millis_or_zero() -> u128 {
    SystemTime::now()
        .duration_since(UNIX_EPOCH)
        .unwrap_or_default()
        .as_millis()
}
