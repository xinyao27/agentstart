use rusqlite::{Connection, OptionalExtension};

use super::identity::{now_millis, random_token, random_uuid};
use super::{MobileDevice, MobileDeviceStoreError};

type MobileDeviceRow = (String, String, String, i64, i64);

const SELECT_DEVICE: &str = "SELECT id, name, token, paired_at, last_seen_at FROM mobile_device";

pub(super) fn get_or_create_named(
    connection: &Connection,
    name: String,
) -> Result<MobileDevice, MobileDeviceStoreError> {
    if let Some(device) = find_by_name(connection, &name)? {
        return Ok(device);
    }
    create(connection, name)
}

pub(super) fn get_or_create_pending(
    connection: &Connection,
    name: String,
    rotate: bool,
) -> Result<MobileDevice, MobileDeviceStoreError> {
    let Some(mut existing) = find_by_name(connection, &name)? else {
        return create(connection, name);
    };
    if existing.last_seen_at > 0 {
        return create(connection, next_available_name(connection, &name)?);
    }
    if !rotate {
        return Ok(existing);
    }
    let token = random_token()?;
    let paired_at = now_millis()?;
    connection
        .execute(
            "UPDATE mobile_device
             SET token = ?1, paired_at = ?2
             WHERE id = ?3",
            rusqlite::params![token, paired_at, existing.id],
        )
        .map_err(MobileDeviceStoreError::storage)?;
    existing.token = token;
    existing.paired_at = paired_at;
    Ok(existing)
}

pub(super) fn list_paired(
    connection: &Connection,
) -> Result<Vec<MobileDevice>, MobileDeviceStoreError> {
    let mut statement = connection
        .prepare(&format!(
            "{SELECT_DEVICE}
             WHERE last_seen_at > 0
             ORDER BY last_seen_at DESC"
        ))
        .map_err(MobileDeviceStoreError::storage)?;
    let rows = statement
        .query_map([], read_row)
        .map_err(MobileDeviceStoreError::storage)?;
    rows.map(|row| hydrate(row.map_err(MobileDeviceStoreError::storage)?))
        .collect()
}

pub(super) fn remove(
    connection: &Connection,
    device_id: &str,
) -> Result<bool, MobileDeviceStoreError> {
    connection
        .execute("DELETE FROM mobile_device WHERE id = ?1", [device_id])
        .map(|changes| changes == 1)
        .map_err(MobileDeviceStoreError::storage)
}

fn validate_token(
    connection: &Connection,
    token: &str,
) -> Result<Option<MobileDevice>, MobileDeviceStoreError> {
    find_one(
        connection,
        &format!("{SELECT_DEVICE} WHERE token = ?1"),
        token,
    )
}

pub(super) fn authenticate_token(
    connection: &Connection,
    token: &str,
) -> Result<Option<MobileDevice>, MobileDeviceStoreError> {
    let Some(device) = validate_token(connection, token)? else {
        return Ok(None);
    };
    mark_seen(connection, &device.id)?;
    Ok(Some(device))
}

pub(super) fn mark_seen(
    connection: &Connection,
    device_id: &str,
) -> Result<(), MobileDeviceStoreError> {
    connection
        .execute(
            "UPDATE mobile_device SET last_seen_at = ?1 WHERE id = ?2",
            rusqlite::params![now_millis()?, device_id],
        )
        .map(|_| ())
        .map_err(MobileDeviceStoreError::storage)
}

fn find_by_name(
    connection: &Connection,
    name: &str,
) -> Result<Option<MobileDevice>, MobileDeviceStoreError> {
    find_one(
        connection,
        &format!("{SELECT_DEVICE} WHERE name = ?1"),
        name,
    )
}

fn find_one(
    connection: &Connection,
    query: &str,
    value: &str,
) -> Result<Option<MobileDevice>, MobileDeviceStoreError> {
    connection
        .query_row(query, [value], read_row)
        .optional()
        .map_err(MobileDeviceStoreError::storage)?
        .map(hydrate)
        .transpose()
}

fn create(connection: &Connection, name: String) -> Result<MobileDevice, MobileDeviceStoreError> {
    let device = MobileDevice {
        id: random_uuid()?,
        last_seen_at: 0,
        name,
        paired_at: now_millis()?,
        token: random_token()?,
    };
    connection
        .execute(
            "INSERT INTO mobile_device(id, name, token, paired_at, last_seen_at)
             VALUES (?1, ?2, ?3, ?4, ?5)",
            rusqlite::params![
                device.id,
                device.name,
                device.token,
                device.paired_at,
                device.last_seen_at,
            ],
        )
        .map_err(MobileDeviceStoreError::storage)?;
    Ok(device)
}

fn next_available_name(
    connection: &Connection,
    base_name: &str,
) -> Result<String, MobileDeviceStoreError> {
    for suffix in 2_u64.. {
        let candidate = format!("{base_name} ({suffix})");
        if find_by_name(connection, &candidate)?.is_none() {
            return Ok(candidate);
        }
    }
    unreachable!()
}

fn read_row(row: &rusqlite::Row<'_>) -> Result<MobileDeviceRow, rusqlite::Error> {
    Ok((
        row.get(0)?,
        row.get(1)?,
        row.get(2)?,
        row.get(3)?,
        row.get(4)?,
    ))
}

fn hydrate(row: MobileDeviceRow) -> Result<MobileDevice, MobileDeviceStoreError> {
    let (id, name, token, paired_at, last_seen_at) = row;
    Ok(MobileDevice {
        id,
        last_seen_at,
        name,
        paired_at,
        token,
    })
}
