// Why: the profiles authority answers as `serde_json::Value` trees shared with
// the legacy JSON surface; this is the single place that reads those trees into
// the typed protobuf wire messages.
use serde_json::Value;
use yiru_protocol::protocol::v1::{Status, StatusCode};
use yiru_protocol::runtime::v1::{
    ShellYiruProfilesAvatar, ShellYiruProfilesAvatarKind, ShellYiruProfilesKind,
    ShellYiruProfilesProfile, ShellYiruProfilesProjectPresence,
    ShellYiruProfilesServiceCreateResponse, ShellYiruProfilesServiceFindResponse,
    ShellYiruProfilesServiceListResponse, ShellYiruProfilesServiceSwitchResponse,
    ShellYiruProfilesServiceTransferResponse, ShellYiruProfilesSwitchStatus,
    ShellYiruProfilesTransferMode, ShellYiruProfilesTransferStatus,
};

pub(super) fn list_value(document: &Value) -> Result<ShellYiruProfilesServiceListResponse, Status> {
    Ok(ShellYiruProfilesServiceListResponse {
        active_profile_id: text(document.get("activeProfileId")),
        profiles: profile_list(document.get("profiles"))?,
        multi_profile_ui: document.get("multiProfileUi").and_then(Value::as_bool) == Some(true),
    })
}

pub(super) fn create_value(
    document: &Value,
) -> Result<ShellYiruProfilesServiceCreateResponse, Status> {
    Ok(ShellYiruProfilesServiceCreateResponse {
        active_profile_id: text(document.get("activeProfileId")),
        profiles: profile_list(document.get("profiles"))?,
        profile: Some(profile_value(document.get("profile"))?),
    })
}

pub(super) fn switch_value(
    document: &Value,
) -> Result<ShellYiruProfilesServiceSwitchResponse, Status> {
    Ok(ShellYiruProfilesServiceSwitchResponse {
        status: match document.get("status").and_then(Value::as_str) {
            Some("already-active") => ShellYiruProfilesSwitchStatus::AlreadyActive,
            Some("relaunching") => ShellYiruProfilesSwitchStatus::Relaunching,
            _ => return Err(data_loss("Profile switch answered an unknown status")),
        } as i32,
    })
}

pub(super) fn transfer_value(
    document: &Value,
) -> Result<ShellYiruProfilesServiceTransferResponse, Status> {
    let status = match document.get("status").and_then(Value::as_str) {
        Some("transferred") => ShellYiruProfilesTransferStatus::Transferred,
        Some("duplicate-target") => ShellYiruProfilesTransferStatus::DuplicateTarget,
        _ => return Err(data_loss("Profile transfer answered an unknown status")),
    } as i32;
    let mode = match document.get("mode").and_then(Value::as_str) {
        Some("move") => ShellYiruProfilesTransferMode::Move,
        Some("copy") => ShellYiruProfilesTransferMode::Copy,
        _ => ShellYiruProfilesTransferMode::Unspecified,
    } as i32;
    Ok(ShellYiruProfilesServiceTransferResponse {
        status,
        mode: (mode != ShellYiruProfilesTransferMode::Unspecified as i32).then_some(mode),
        source_profile_id: text(document.get("sourceProfileId")),
        target_profile_id: text(document.get("targetProfileId")),
        source_repo_id: text(document.get("sourceRepoId")),
        target_repo_id: document
            .get("targetRepoId")
            .and_then(Value::as_str)
            .map(str::to_owned),
        duplicate_repo_id: document
            .get("duplicateRepoId")
            .and_then(Value::as_str)
            .map(str::to_owned),
        target_project_id: document
            .get("targetProjectId")
            .and_then(Value::as_str)
            .map(str::to_owned),
        will_relaunch: document.get("willRelaunch").and_then(Value::as_bool),
    })
}

pub(super) fn find_value(document: &Value) -> Result<ShellYiruProfilesServiceFindResponse, Status> {
    let projects = document
        .get("projects")
        .and_then(Value::as_array)
        .ok_or_else(|| data_loss("Profile search answered without a project list"))?;
    let mut presences = Vec::with_capacity(projects.len());
    for project in projects {
        presences.push(ShellYiruProfilesProjectPresence {
            profile_id: text(project.get("profileId")),
            profile_name: text(project.get("profileName")),
            profile_kind: match project.get("profileKind").and_then(Value::as_str) {
                Some("local") => ShellYiruProfilesKind::Local,
                _ => ShellYiruProfilesKind::Unspecified,
            } as i32,
            repo_id: text(project.get("repoId")),
            repo_name: text(project.get("repoName")),
        });
    }
    Ok(ShellYiruProfilesServiceFindResponse {
        projects: presences,
    })
}

fn profile_list(value: Option<&Value>) -> Result<Vec<ShellYiruProfilesProfile>, Status> {
    let profiles = value
        .and_then(Value::as_array)
        .ok_or_else(|| data_loss("Profile index answered without a profile list"))?;
    profiles
        .iter()
        .map(|profile| profile_value(Some(profile)))
        .collect()
}

fn profile_value(value: Option<&Value>) -> Result<ShellYiruProfilesProfile, Status> {
    let Some(profile) = value else {
        return Err(data_loss("Profile index answered with a missing profile"));
    };
    let avatar = profile.get("avatar");
    Ok(ShellYiruProfilesProfile {
        id: text(profile.get("id")),
        name: text(profile.get("name")),
        avatar: Some(ShellYiruProfilesAvatar {
            kind: match avatar
                .and_then(|avatar| avatar.get("kind"))
                .and_then(Value::as_str)
            {
                Some("initials") => ShellYiruProfilesAvatarKind::Initials,
                _ => ShellYiruProfilesAvatarKind::Unspecified,
            } as i32,
            initials: avatar
                .and_then(|avatar| avatar.get("initials"))
                .and_then(Value::as_str)
                .unwrap_or_default()
                .to_owned(),
            color: avatar
                .and_then(|avatar| avatar.get("color"))
                .and_then(Value::as_str)
                .unwrap_or_default()
                .to_owned(),
        }),
        kind: match profile.get("kind").and_then(Value::as_str) {
            Some("local") => ShellYiruProfilesKind::Local,
            _ => ShellYiruProfilesKind::Unspecified,
        } as i32,
        created_at: integer(profile.get("createdAt")),
        updated_at: integer(profile.get("updatedAt")),
        last_opened_at: integer(profile.get("lastOpenedAt")),
    })
}

fn text(value: Option<&Value>) -> String {
    value.and_then(Value::as_str).unwrap_or_default().to_owned()
}

fn integer(value: Option<&Value>) -> i64 {
    value
        .and_then(Value::as_i64)
        .or_else(|| {
            value
                .and_then(Value::as_f64)
                .filter(|value| value.is_finite())
                .map(|value| value as i64)
        })
        .unwrap_or_default()
}

fn data_loss(message: &str) -> Status {
    Status {
        code: StatusCode::DataLoss as i32,
        message: message.to_owned(),
        details: Vec::new(),
    }
}
