use agentstart_protocol::protocol::v1::{Status, StatusCode};
use agentstart_protocol::runtime::v1::updater_service_subscribe_status_response::Event;
use agentstart_protocol::runtime::v1::updater_status::State;
use agentstart_protocol::runtime::v1::{
    UpdaterAvailable, UpdaterChangelog, UpdaterChangelogRelease, UpdaterChecking,
    UpdaterDownloaded, UpdaterDownloading, UpdaterError as ProtocolUpdaterError, UpdaterIdle,
    UpdaterInstallMode, UpdaterNotAvailable, UpdaterServiceCheckRequest,
    UpdaterServiceCheckResponse, UpdaterServiceDownloadRequest, UpdaterServiceDownloadResponse,
    UpdaterServiceGetStatusRequest, UpdaterServiceGetStatusResponse,
    UpdaterServiceGetVersionRequest, UpdaterServiceGetVersionResponse,
    UpdaterServiceInstallRequest, UpdaterServiceInstallResponse,
    UpdaterServiceSubscribeStatusRequest, UpdaterServiceSubscribeStatusResponse, UpdaterSnapshot,
    UpdaterStatus, UpdaterSubscriptionReady, UpdaterSupport, UpdaterSupportReason,
};
use agentstart_protocol::transport::{decode, encode};

use crate::update::{UpdateCheckOptions, UpdateError};
use crate::updater::{
    DaemonUpdaterChangelog, DaemonUpdaterChangelogRelease, DaemonUpdaterError,
    DaemonUpdaterInstallMode, DaemonUpdaterSnapshot, DaemonUpdaterStatus, DaemonUpdaterSupport,
    DaemonUpdaterSupportReason,
};

use super::UpdaterRpc;
use crate::rpc::protocol_call::{
    ProtocolCallContext, ProtocolDeliveryGuard, ProtocolDeliveryOutcome, ProtocolHandlerResponse,
};

pub(in crate::rpc) fn get_version(rpc: &UpdaterRpc, payload: &[u8]) -> Result<Vec<u8>, Status> {
    let _ = decode::<UpdaterServiceGetVersionRequest>(payload)?;
    Ok(encode(&UpdaterServiceGetVersionResponse {
        version: rpc.updater.snapshot().app_version,
    }))
}

pub(in crate::rpc) fn get_status(rpc: &UpdaterRpc, payload: &[u8]) -> Result<Vec<u8>, Status> {
    let _ = decode::<UpdaterServiceGetStatusRequest>(payload)?;
    Ok(encode(&UpdaterServiceGetStatusResponse {
        snapshot: Some(protocol_snapshot(rpc.updater.snapshot())),
    }))
}

pub(in crate::rpc) async fn check(rpc: &UpdaterRpc, payload: &[u8]) -> Result<Vec<u8>, Status> {
    let request = decode::<UpdaterServiceCheckRequest>(payload)?;
    let snapshot = rpc
        .updater
        .check(UpdateCheckOptions {
            include_prerelease: request.include_prerelease,
            include_perf_prerelease: request.include_perf_prerelease,
        })
        .await
        .map_err(updater_status)?;
    Ok(encode(&UpdaterServiceCheckResponse {
        snapshot: Some(protocol_snapshot(snapshot)),
    }))
}

pub(in crate::rpc) fn download(rpc: &UpdaterRpc, payload: &[u8]) -> Result<Vec<u8>, Status> {
    let _ = decode::<UpdaterServiceDownloadRequest>(payload)?;
    let snapshot = rpc.updater.download().map_err(updater_status)?;
    Ok(encode(&UpdaterServiceDownloadResponse {
        snapshot: Some(protocol_snapshot(snapshot)),
    }))
}

pub(in crate::rpc) fn install(
    rpc: &UpdaterRpc,
    payload: &[u8],
) -> Result<ProtocolHandlerResponse, Status> {
    let _ = decode::<UpdaterServiceInstallRequest>(payload)?;
    let (result, pending) = rpc.updater.begin_install().map_err(updater_status)?;
    let payload = encode(&UpdaterServiceInstallResponse {
        accepted: result.accepted,
        from_version: result.from_version,
        target_version: result.target_version,
        runtime_id: result.runtime_id,
    });
    let delivery = ProtocolDeliveryGuard::new(move |outcome| match outcome {
        ProtocolDeliveryOutcome::Confirmed => pending.confirm(),
        ProtocolDeliveryOutcome::RolledBack => drop(pending),
    });
    Ok(ProtocolHandlerResponse::with_delivery(payload, delivery))
}

pub(in crate::rpc) async fn subscribe_status(
    rpc: &UpdaterRpc,
    payload: &[u8],
    context: &ProtocolCallContext,
) -> Result<(), Status> {
    let _ = decode::<UpdaterServiceSubscribeStatusRequest>(payload)?;
    let mut snapshots = rpc.updater.subscribe();
    let initial = snapshots.borrow_and_update().clone();
    context
        .send_stream_payload(encode(&UpdaterServiceSubscribeStatusResponse {
            event: Some(Event::Ready(UpdaterSubscriptionReady {
                snapshot: Some(protocol_snapshot(initial)),
            })),
        }))
        .await?;
    while snapshots.changed().await.is_ok() {
        let snapshot = snapshots.borrow_and_update().clone();
        context
            .send_stream_payload(encode(&UpdaterServiceSubscribeStatusResponse {
                event: Some(Event::Snapshot(protocol_snapshot(snapshot))),
            }))
            .await?;
    }
    Ok(())
}

fn protocol_snapshot(snapshot: DaemonUpdaterSnapshot) -> UpdaterSnapshot {
    UpdaterSnapshot {
        app_version: snapshot.app_version,
        runtime_id: snapshot.runtime_id,
        support: Some(protocol_support(snapshot.support)),
        status: Some(protocol_update_status(snapshot.status)),
    }
}

fn protocol_support(support: DaemonUpdaterSupport) -> UpdaterSupport {
    UpdaterSupport {
        install_mode: match support.install_mode {
            DaemonUpdaterInstallMode::SupervisedHeadlessServe => {
                UpdaterInstallMode::SupervisedHeadlessServe
            }
            DaemonUpdaterInstallMode::UnsupportedHeadlessServe => {
                UpdaterInstallMode::UnsupportedHeadlessServe
            }
        } as i32,
        automatic: support.automatic,
        reason: match support.reason {
            DaemonUpdaterSupportReason::Available => UpdaterSupportReason::Available,
            DaemonUpdaterSupportReason::ManualServiceUpdateRequired => {
                UpdaterSupportReason::ManualServiceUpdateRequired
            }
            DaemonUpdaterSupportReason::UnpackagedBuild => UpdaterSupportReason::UnpackagedBuild,
            DaemonUpdaterSupportReason::UpdaterUnavailable => {
                UpdaterSupportReason::UpdaterUnavailable
            }
        } as i32,
    }
}

fn protocol_update_status(status: DaemonUpdaterStatus) -> UpdaterStatus {
    let state = match status {
        DaemonUpdaterStatus::Idle => State::Idle(UpdaterIdle {}),
        DaemonUpdaterStatus::Checking { user_initiated } => State::Checking(UpdaterChecking {
            user_initiated: Some(user_initiated),
        }),
        DaemonUpdaterStatus::Available {
            changelog,
            release_url,
            version,
        } => State::Available(UpdaterAvailable {
            version,
            active_nudge_id: None,
            release_url,
            changelog: changelog.map(protocol_changelog),
        }),
        DaemonUpdaterStatus::NotAvailable { user_initiated } => {
            State::NotAvailable(UpdaterNotAvailable {
                user_initiated: Some(user_initiated),
            })
        }
        DaemonUpdaterStatus::Downloading { percent, version } => {
            State::Downloading(UpdaterDownloading {
                percent: u32::from(percent),
                version,
                active_nudge_id: None,
            })
        }
        DaemonUpdaterStatus::Downloaded {
            release_url,
            version,
        } => State::Downloaded(UpdaterDownloaded {
            version,
            release_url,
            active_nudge_id: None,
        }),
        DaemonUpdaterStatus::Error {
            message,
            user_initiated,
        } => State::Error(ProtocolUpdaterError {
            message,
            user_initiated,
            active_nudge_id: None,
        }),
    };
    UpdaterStatus { state: Some(state) }
}

fn protocol_changelog(changelog: DaemonUpdaterChangelog) -> UpdaterChangelog {
    UpdaterChangelog {
        release: Some(protocol_changelog_release(changelog.release)),
        releases_behind: changelog.releases_behind,
    }
}

fn protocol_changelog_release(release: DaemonUpdaterChangelogRelease) -> UpdaterChangelogRelease {
    UpdaterChangelogRelease {
        title: release.title,
        description: release.description,
        media_url: release.media_url,
        release_notes_url: release.release_notes_url,
    }
}

fn updater_status(error: DaemonUpdaterError) -> Status {
    let code = match error {
        DaemonUpdaterError::ManualRequired
        | DaemonUpdaterError::NotAvailable
        | DaemonUpdaterError::NotDownloaded
        | DaemonUpdaterError::InvalidState => StatusCode::FailedPrecondition,
        DaemonUpdaterError::InProgress => StatusCode::Aborted,
        DaemonUpdaterError::Update(ref error) => update_error_status(error),
    };
    Status {
        code: code as i32,
        message: error.code().to_owned(),
        details: Vec::new(),
    }
}

fn update_error_status(error: &UpdateError) -> StatusCode {
    match error {
        UpdateError::CurrentExecutable(_)
        | UpdateError::CurrentVersionInvalid
        | UpdateError::DevelopmentBuild
        | UpdateError::UseNpm
        | UpdateError::UseHomebrew
        | UpdateError::AppUpdateRequired
        | UpdateError::PlatformUnsupported
        | UpdateError::ExecutableDirectory
        | UpdateError::ExecutableName => StatusCode::FailedPrecondition,
        UpdateError::HttpClient(_)
        | UpdateError::Request(_)
        | UpdateError::DownloadRequest(_)
        | UpdateError::Status(_) => StatusCode::Unavailable,
        UpdateError::InvalidRelease
        | UpdateError::ReleaseResponseTooLarge
        | UpdateError::InsecureUrl
        | UpdateError::ArtifactUnavailable
        | UpdateError::ArtifactTooLarge
        | UpdateError::ChecksumAmbiguous
        | UpdateError::ChecksumMissing
        | UpdateError::ChecksumMismatch => StatusCode::DataLoss,
        #[cfg(target_os = "macos")]
        UpdateError::SignatureInvalid(_) | UpdateError::SignatureOutputTooLarge => {
            StatusCode::DataLoss
        }
        #[cfg(target_os = "macos")]
        UpdateError::SignatureTimeout => StatusCode::DeadlineExceeded,
        UpdateError::ComputerUseHelper(_)
        | UpdateError::Io(_)
        | UpdateError::Random(_)
        | UpdateError::ReplacementLaunch(_)
        | UpdateError::Service(_)
        | UpdateError::Clock(_) => StatusCode::Internal,
        #[cfg(target_os = "macos")]
        UpdateError::SignatureIo(_) => StatusCode::Internal,
    }
}
