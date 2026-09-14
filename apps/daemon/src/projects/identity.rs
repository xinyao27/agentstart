use std::time::{SystemTime, UNIX_EPOCH};

use super::ProjectCatalogError;
pub(crate) use crate::identity::random_uuid;

pub(crate) fn now_millis() -> Result<i64, ProjectCatalogError> {
    i64::try_from(SystemTime::now().duration_since(UNIX_EPOCH)?.as_millis())
        .map_err(ProjectCatalogError::storage)
}
