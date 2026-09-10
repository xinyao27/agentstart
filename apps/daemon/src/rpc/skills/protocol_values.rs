// Why: the skills authority answers its scan, freshness, and directory
// results as plain `serde_json::Value` trees shared with the legacy JSON
// surface; this is the single place that reads those trees into the typed
// protobuf wire messages, so every handler shares one mapping.
use agentstart_protocol::protocol::v1::{Status, StatusCode};
use agentstart_protocol::runtime::v1::skill_directory_listing::Result as DirectoryResult;
use agentstart_protocol::runtime::v1::skill_file_read_result::Result as FileReadResult;
use agentstart_protocol::runtime::v1::skill_update_run::State as RunState;
use agentstart_protocol::runtime::v1::{
    DiscoveredSkill, SkillDirectoryEntry, SkillDirectoryErrorReason, SkillDirectoryListing,
    SkillDirectoryListingOk, SkillDiscoverySkippedReason, SkillDiscoverySource,
    SkillFileErrorReason, SkillFileReadOk, SkillFileReadResult, SkillFreshnessInstallation,
    SkillFreshnessInventory, SkillFreshnessStatus, SkillInstallationTopology, SkillPlacement,
    SkillProvider, SkillSourceKind, SkillUpdateFailureKind, SkillUpdateOperation,
    SkillUpdateRun as ProtocolRun, SkillUpdateRunError, SkillUpdateRunIdle, SkillUpdateRunRunning,
    SkillUpdateRunSubject, SkillUpdateRunSuccess, SkillUpdateStartFailureReason,
    SkillUpdateStartResult,
};

use crate::skills::{SkillRunStartFailure, SkillRunStartOutcome, SkillUpdateRun};

pub(super) fn start_outcome(outcome: SkillRunStartOutcome) -> SkillUpdateStartResult {
    let reason = match outcome.reason {
        None => SkillUpdateStartFailureReason::Unspecified,
        Some(SkillRunStartFailure::AlreadyRunning) => SkillUpdateStartFailureReason::AlreadyRunning,
        Some(SkillRunStartFailure::InvalidNames) => SkillUpdateStartFailureReason::InvalidNames,
        Some(SkillRunStartFailure::InvalidSource) => SkillUpdateStartFailureReason::InvalidSource,
        Some(SkillRunStartFailure::InvalidScope) => SkillUpdateStartFailureReason::InvalidScope,
    };
    SkillUpdateStartResult {
        started: outcome.started,
        reason: reason as i32,
    }
}

// Why: the legacy JSON transport surfaced `discover`/`freshness` string
// errors as a bare 500, so the protobuf surface mirrors that instead of
// inventing finer statuses the client never saw.
pub(super) fn internal_error() -> Status {
    status(StatusCode::Internal, "Internal server error")
}

pub(super) fn discovered_skill(value: &serde_json::Value) -> DiscoveredSkill {
    DiscoveredSkill {
        id: text(value, "id"),
        name: text(value, "name"),
        folder_name: text(value, "folderName"),
        description: opt_text(value, "description"),
        providers: providers(value),
        source_kind: source_kind(&text(value, "sourceKind")) as i32,
        source_label: text(value, "sourceLabel"),
        root_path: text(value, "rootPath"),
        placements: array(value, "placements")
            .iter()
            .map(skill_placement)
            .collect(),
        directory_path: text(value, "directoryPath"),
        skill_file_path: text(value, "skillFilePath"),
        installed: bool_field(value, "installed"),
        file_count: u32_field(value, "fileCount"),
        updated_at: opt_i64(value, "updatedAt"),
        install_source: opt_text(value, "installSource"),
    }
}

fn skill_placement(value: &serde_json::Value) -> SkillPlacement {
    SkillPlacement {
        id: text(value, "id"),
        root_id: text(value, "rootId"),
        root_path: text(value, "rootPath"),
        root_label: text(value, "rootLabel"),
        owner: opt_text(value, "owner"),
        providers: providers(value),
        source_kind: source_kind(&text(value, "sourceKind")) as i32,
        source_label: text(value, "sourceLabel"),
        directory_path: text(value, "directoryPath"),
        skill_file_path: text(value, "skillFilePath"),
        link_target_path: opt_text(value, "linkTargetPath"),
        topology: topology(&text(value, "topology")) as i32,
        file_count: u32_field(value, "fileCount"),
        updated_at: opt_i64(value, "updatedAt"),
    }
}

pub(super) fn discovery_source(value: &serde_json::Value) -> SkillDiscoverySource {
    SkillDiscoverySource {
        id: text(value, "id"),
        label: text(value, "label"),
        path: text(value, "path"),
        source_kind: source_kind(&text(value, "sourceKind")) as i32,
        providers: providers(value),
        owner: opt_text(value, "owner"),
        exists: bool_field(value, "exists"),
        skipped_reason: match opt_text(value, "skippedReason").as_deref() {
            Some("missing") => SkillDiscoverySkippedReason::Missing,
            _ => SkillDiscoverySkippedReason::Unspecified,
        } as i32,
    }
}

pub(super) fn freshness_inventory(value: &serde_json::Value) -> SkillFreshnessInventory {
    SkillFreshnessInventory {
        installations: array(value, "installations")
            .iter()
            .map(freshness_installation)
            .collect(),
        eligible_update_names: string_array(value, "eligibleUpdateNames"),
        scanned_at: i64_field(value, "scannedAt"),
    }
}

fn freshness_installation(value: &serde_json::Value) -> SkillFreshnessInstallation {
    SkillFreshnessInstallation {
        id: text(value, "id"),
        name: text(value, "name"),
        root_id: text(value, "rootId"),
        providers: providers(value),
        source_kind: source_kind(&text(value, "sourceKind")) as i32,
        source_label: text(value, "sourceLabel"),
        unresolved_path: text(value, "unresolvedPath"),
        resolved_path: opt_text(value, "resolvedPath"),
        physical_identity: opt_text(value, "physicalIdentity"),
        topology: topology(&text(value, "topology")) as i32,
        status: match text(value, "status").as_str() {
            "current" => SkillFreshnessStatus::Current,
            "outdated" => SkillFreshnessStatus::Outdated,
            "newer-known" => SkillFreshnessStatus::NewerKnown,
            "unrecognized" => SkillFreshnessStatus::Unrecognized,
            "inaccessible" => SkillFreshnessStatus::Inaccessible,
            _ => SkillFreshnessStatus::Unspecified,
        } as i32,
        installed_release_revision: opt_u64(value, "installedReleaseRevision"),
        installed_app_version: opt_text(value, "installedAppVersion"),
        current_release_revision: u64_field(value, "currentReleaseRevision"),
        current_package_digest: text(value, "currentPackageDigest"),
        current_app_version: text(value, "currentAppVersion"),
        observed_package_digest: opt_text(value, "observedPackageDigest"),
        observed_git_tree_sha: opt_text(value, "observedGitTreeSha"),
        error_category: opt_text(value, "errorCategory"),
    }
}

pub(super) fn directory_listing(value: &serde_json::Value) -> SkillDirectoryListing {
    let result = if bool_field(value, "ok") {
        DirectoryResult::Ok(SkillDirectoryListingOk {
            files: array(value, "files")
                .iter()
                .map(|entry| SkillDirectoryEntry {
                    relative_path: text(entry, "relativePath"),
                    size: u64_field(entry, "size"),
                })
                .collect(),
            truncated: bool_field(value, "truncated"),
        })
    } else {
        DirectoryResult::Error(directory_error_reason(&text(value, "reason")) as i32)
    };
    SkillDirectoryListing {
        result: Some(result),
    }
}

fn directory_error_reason(reason: &str) -> SkillDirectoryErrorReason {
    match reason {
        "invalid-path" => SkillDirectoryErrorReason::InvalidPath,
        "unreadable" => SkillDirectoryErrorReason::Unreadable,
        _ => SkillDirectoryErrorReason::Unspecified,
    }
}

pub(super) fn file_read_result(value: &serde_json::Value) -> SkillFileReadResult {
    let result = if bool_field(value, "ok") {
        FileReadResult::Ok(SkillFileReadOk {
            content: text(value, "content"),
            truncated: bool_field(value, "truncated"),
        })
    } else {
        let reason = match text(value, "reason").as_str() {
            "invalid-path" => SkillFileErrorReason::InvalidPath,
            "unreadable" => SkillFileErrorReason::Unreadable,
            "binary" => SkillFileErrorReason::Binary,
            _ => SkillFileErrorReason::Unspecified,
        };
        FileReadResult::Error(reason as i32)
    };
    SkillFileReadResult {
        result: Some(result),
    }
}

pub(super) fn skill_update_run(run: SkillUpdateRun) -> ProtocolRun {
    let state = match run {
        SkillUpdateRun::Idle => RunState::Idle(SkillUpdateRunIdle {}),
        SkillUpdateRun::Running {
            operation,
            names,
            source,
            started_at,
            output,
            stopping,
        } => RunState::Running(SkillUpdateRunRunning {
            subject: Some(run_subject(operation, names, source)),
            started_at,
            output,
            stopping,
        }),
        SkillUpdateRun::Success {
            operation,
            names,
            source,
            finished_at,
            output,
        } => RunState::Success(SkillUpdateRunSuccess {
            subject: Some(run_subject(operation, names, source)),
            finished_at,
            output,
        }),
        SkillUpdateRun::Error {
            operation,
            names,
            source,
            finished_at,
            output,
            failed_names,
            kind,
            command,
            detail,
            exit_code,
        } => RunState::Error(SkillUpdateRunError {
            subject: Some(run_subject(operation, names, source)),
            finished_at,
            output,
            failed_names,
            kind: update_failure_kind(&kind) as i32,
            command,
            detail,
            exit_code,
        }),
    };
    ProtocolRun { state: Some(state) }
}

fn run_subject(
    operation: String,
    names: Vec<String>,
    source: Option<String>,
) -> SkillUpdateRunSubject {
    SkillUpdateRunSubject {
        operation: update_operation(&operation) as i32,
        names,
        source,
    }
}

fn update_operation(value: &str) -> SkillUpdateOperation {
    match value {
        "update" => SkillUpdateOperation::Update,
        "install" => SkillUpdateOperation::Install,
        "remove" => SkillUpdateOperation::Remove,
        _ => SkillUpdateOperation::Unspecified,
    }
}

fn update_failure_kind(value: &str) -> SkillUpdateFailureKind {
    match value {
        "launch-failed" => SkillUpdateFailureKind::LaunchFailed,
        "command-exited" => SkillUpdateFailureKind::CommandExited,
        "incomplete" => SkillUpdateFailureKind::Incomplete,
        _ => SkillUpdateFailureKind::Unspecified,
    }
}

fn source_kind(value: &str) -> SkillSourceKind {
    match value {
        "home" => SkillSourceKind::Home,
        "repo" => SkillSourceKind::Repo,
        "bundled" => SkillSourceKind::Bundled,
        "plugin" => SkillSourceKind::Plugin,
        _ => SkillSourceKind::Unspecified,
    }
}

fn topology(value: &str) -> SkillInstallationTopology {
    match value {
        "canonical-copy" => SkillInstallationTopology::CanonicalCopy,
        "provider-alias" => SkillInstallationTopology::ProviderAlias,
        "independent-copy" => SkillInstallationTopology::IndependentCopy,
        "external-link" => SkillInstallationTopology::ExternalLink,
        "broken-link" => SkillInstallationTopology::BrokenLink,
        "read-only" => SkillInstallationTopology::ReadOnly,
        "repo-scope" => SkillInstallationTopology::RepoScope,
        "plugin-cache" => SkillInstallationTopology::PluginCache,
        "unknown" => SkillInstallationTopology::Unknown,
        _ => SkillInstallationTopology::Unspecified,
    }
}

fn providers(value: &serde_json::Value) -> Vec<i32> {
    string_array(value, "providers")
        .iter()
        .map(|provider| match provider.as_str() {
            "codex" => SkillProvider::Codex,
            "claude" => SkillProvider::Claude,
            "agent-skills" => SkillProvider::AgentSkills,
            _ => SkillProvider::Unspecified,
        } as i32)
        .collect()
}

fn text(value: &serde_json::Value, field: &str) -> String {
    value
        .get(field)
        .and_then(serde_json::Value::as_str)
        .unwrap_or_default()
        .to_owned()
}

fn opt_text(value: &serde_json::Value, field: &str) -> Option<String> {
    value
        .get(field)
        .and_then(serde_json::Value::as_str)
        .map(str::to_owned)
}

fn bool_field(value: &serde_json::Value, field: &str) -> bool {
    value
        .get(field)
        .and_then(serde_json::Value::as_bool)
        .unwrap_or(false)
}

fn u32_field(value: &serde_json::Value, field: &str) -> u32 {
    value
        .get(field)
        .and_then(serde_json::Value::as_u64)
        .and_then(|value| u32::try_from(value).ok())
        .unwrap_or(0)
}

fn u64_field(value: &serde_json::Value, field: &str) -> u64 {
    value
        .get(field)
        .and_then(serde_json::Value::as_u64)
        .unwrap_or(0)
}

fn opt_u64(value: &serde_json::Value, field: &str) -> Option<u64> {
    value.get(field).and_then(serde_json::Value::as_u64)
}

fn i64_field(value: &serde_json::Value, field: &str) -> i64 {
    value
        .get(field)
        .and_then(serde_json::Value::as_i64)
        .unwrap_or(0)
}

fn opt_i64(value: &serde_json::Value, field: &str) -> Option<i64> {
    value.get(field).and_then(serde_json::Value::as_i64)
}

fn array(value: &serde_json::Value, field: &str) -> Vec<serde_json::Value> {
    value
        .get(field)
        .and_then(serde_json::Value::as_array)
        .cloned()
        .unwrap_or_default()
}

fn string_array(value: &serde_json::Value, field: &str) -> Vec<String> {
    array(value, field)
        .iter()
        .filter_map(serde_json::Value::as_str)
        .map(str::to_owned)
        .collect()
}

fn status(code: StatusCode, message: &str) -> Status {
    Status {
        code: code as i32,
        message: message.to_owned(),
        details: Vec::new(),
    }
}
