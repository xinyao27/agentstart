use std::path::Path;

use rusqlite::Connection;
use serde::Serialize;
use serde_json::Value;

use super::index::{ProfileError, ProfileSummary, ensure_profile_directory, load};

const MAX_STATE_BYTES: u64 = 128 * 1024 * 1024;

#[derive(Serialize)]
#[serde(rename_all = "camelCase")]
struct Presence {
    profile_id: String,
    profile_name: String,
    profile_kind: String,
    repo_id: String,
    repo_name: String,
}

pub(crate) fn find(
    root: &Path,
    path: &str,
    connection_id: Option<&str>,
    execution_host_id: Option<&str>,
    exclude_profile_id: Option<&str>,
) -> Result<Value, ProfileError> {
    let path = path.trim();
    if path.is_empty() {
        return Err(ProfileError::InvalidId);
    }
    let mut projects = Vec::new();
    for profile in load(root)?.profiles {
        if exclude_profile_id == Some(profile.id.as_str()) {
            continue;
        }
        let directory = ensure_profile_directory(root, &profile.id)?;
        projects.extend(find_json(
            &directory,
            &profile,
            path,
            connection_id,
            execution_host_id,
        )?);
        projects.extend(find_sqlite(&directory, &profile, path, execution_host_id)?);
    }
    projects.sort_by(|left, right| {
        (&left.profile_name, &left.repo_name, &left.repo_id).cmp(&(
            &right.profile_name,
            &right.repo_name,
            &right.repo_id,
        ))
    });
    projects.dedup_by(|left, right| {
        left.profile_id == right.profile_id && left.repo_id == right.repo_id
    });
    Ok(serde_json::json!({ "projects": projects }))
}

fn find_json(
    directory: &Path,
    profile: &ProfileSummary,
    path: &str,
    connection_id: Option<&str>,
    execution_host_id: Option<&str>,
) -> Result<Vec<Presence>, ProfileError> {
    let file = directory.join("yiru-data.json");
    let Some(repos) = read_json(&file)?
        .and_then(|value| value.get("repos").cloned())
        .and_then(|value| value.as_array().cloned())
    else {
        return Ok(Vec::new());
    };
    Ok(repos
        .into_iter()
        .filter_map(|repo| {
            let object = repo.as_object()?;
            let candidate_path = object.get("path")?.as_str()?;
            let candidate_connection = clean(object.get("connectionId").and_then(Value::as_str));
            let candidate_host =
                clean(object.get("executionHostId").and_then(Value::as_str)).unwrap_or("local");
            (paths_equal(candidate_path, path)
                && candidate_connection == clean(connection_id)
                && candidate_host == execution_host_id.unwrap_or("local"))
            .then(|| presence(profile, object))
        })
        .collect())
}

fn find_sqlite(
    directory: &Path,
    profile: &ProfileSummary,
    path: &str,
    execution_host_id: Option<&str>,
) -> Result<Vec<Presence>, ProfileError> {
    let file = directory.join("yiru.sqlite");
    if !super::leaf_file::exists(&file)? {
        return Ok(Vec::new());
    }
    let connection = Connection::open_with_flags(
        &file,
        rusqlite::OpenFlags::SQLITE_OPEN_READ_ONLY
            | rusqlite::OpenFlags::SQLITE_OPEN_NO_MUTEX
            | rusqlite::OpenFlags::SQLITE_OPEN_NOFOLLOW,
    )?;
    let Ok(mut statement) = connection
        .prepare("SELECT wire_id,path,host_id,display_name FROM project ORDER BY added_at,id")
    else {
        return Ok(Vec::new());
    };
    let Ok(rows) = statement.query_map([], |row| {
        Ok((
            row.get::<_, String>(0)?,
            row.get::<_, String>(1)?,
            row.get::<_, String>(2)?,
            row.get::<_, String>(3)?,
        ))
    }) else {
        return Ok(Vec::new());
    };
    Ok(rows
        .filter_map(Result::ok)
        .filter(|(_, candidate_path, host_id, _)| {
            paths_equal(candidate_path, path) && host_id == execution_host_id.unwrap_or("local")
        })
        .map(|(repo_id, _, _, name)| Presence {
            profile_id: profile.id.clone(),
            profile_name: profile.name.clone(),
            profile_kind: profile.kind.clone(),
            repo_id,
            repo_name: name,
        })
        .collect())
}

fn presence(profile: &ProfileSummary, repo: &serde_json::Map<String, Value>) -> Presence {
    let path = repo.get("path").and_then(Value::as_str).unwrap_or_default();
    Presence {
        profile_id: profile.id.clone(),
        profile_name: profile.name.clone(),
        profile_kind: profile.kind.clone(),
        repo_id: repo
            .get("id")
            .and_then(Value::as_str)
            .unwrap_or_default()
            .to_owned(),
        repo_name: repo
            .get("displayName")
            .and_then(Value::as_str)
            .unwrap_or(path)
            .to_owned(),
    }
}

fn read_json(path: &Path) -> Result<Option<Value>, ProfileError> {
    let Some(bytes) = super::leaf_file::read(path, MAX_STATE_BYTES)? else {
        return Ok(None);
    };
    Ok(serde_json::from_slice(&bytes).ok())
}

fn paths_equal(left: &str, right: &str) -> bool {
    let normalize = |value: &str| {
        let normalized = value.trim_end_matches(['/', '\\']).replace('\\', "/");
        if cfg!(target_os = "windows") {
            normalized.to_lowercase()
        } else {
            normalized
        }
    };
    normalize(left) == normalize(right)
}

fn clean(value: Option<&str>) -> Option<&str> {
    value.map(str::trim).filter(|value| !value.is_empty())
}
