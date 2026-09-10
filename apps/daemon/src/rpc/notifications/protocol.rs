use agentstart_protocol::protocol::v1::{Status, StatusCode};
use agentstart_protocol::runtime::v1::load_custom_sound_response::Event as SoundEvent;
use agentstart_protocol::runtime::v1::replay_notification_event::Event;
use agentstart_protocol::runtime::v1::subscribe_response::Event as SubscribeEvent;
use agentstart_protocol::runtime::v1::{
    DismissRequest, DismissResponse, GetMissedSinceRequest, GetMissedSinceResponse,
    LoadCustomSoundRequest, LoadCustomSoundResponse, NotificationDismiss, NotificationDispatch,
    NotificationReportReason, NotificationSoundAssetChunk, NotificationSoundAssetStart,
    NotificationSoundNotModified, NotificationSoundUnavailable as ProtocolSoundUnavailable,
    NotificationSoundUnavailableReason, NotificationSource as ProtocolNotificationSource,
    ReplayNotificationEvent, ReportRequest, ReportResponse, SubscribeRequest, SubscribeResponse,
    SubscriptionReady,
};
use agentstart_protocol::transport::{decode, encode};

use crate::notifications::{
    MobileNotificationEvent, NotificationAuthority, NotificationError, NotificationSoundAuthority,
    NotificationSoundLoad, NotificationSoundUnavailable, NotificationSource,
    ReplayableNotification,
};

use super::super::protocol_call::ProtocolCallContext;
use super::NotificationsRpc;
use super::input::ReportInput;

const NOTIFICATION_SOUND_CHUNK_BYTES: usize = 256 * 1024;

pub(in crate::rpc) async fn dismiss(
    rpc: &NotificationsRpc,
    payload: &[u8],
    shell_connection_id: Option<String>,
) -> Result<Vec<u8>, Status> {
    let request = decode::<DismissRequest>(payload)?;
    let dismissed = rpc
        .dismiss(request.notification_ids, shell_connection_id.as_deref())
        .await
        .map_err(report_status)?;
    Ok(encode(&DismissResponse {
        dismissed: u32::try_from(dismissed).unwrap_or(u32::MAX),
    }))
}

pub(in crate::rpc) async fn report(
    rpc: &NotificationsRpc,
    payload: &[u8],
    shell_connection_id: Option<String>,
) -> Result<Vec<u8>, Status> {
    let request = decode::<ReportRequest>(payload)?;
    let input = report_input(request)?;
    let outcome = rpc
        .report(input, shell_connection_id.as_deref())
        .await
        .map_err(report_status)?;
    Ok(encode(&ReportResponse {
        delivered: outcome.delivered,
        reason: outcome
            .reason
            .as_deref()
            .map(protocol_reason)
            .map(i32::from),
    }))
}

fn report_input(request: ReportRequest) -> Result<ReportInput, Status> {
    let source = match request.source() {
        ProtocolNotificationSource::AgentTaskComplete => NotificationSource::AgentTaskComplete,
        ProtocolNotificationSource::TerminalBell => NotificationSource::TerminalBell,
        ProtocolNotificationSource::Test => NotificationSource::Test,
        ProtocolNotificationSource::Unspecified => {
            return Err(status(
                StatusCode::InvalidArgument,
                "Notification source is invalid",
            ));
        }
    };
    Ok(ReportInput {
        agent_interrupted: request.agent_interrupted,
        agent_last_assistant_message: request.agent_last_assistant_message,
        agent_prompt: request.agent_prompt,
        agent_state: request.agent_state,
        agent_tool_input: request.agent_tool_input,
        agent_tool_name: request.agent_tool_name,
        agent_type: request.agent_type,
        has_multiple_active_repos: request.has_multiple_active_repos,
        is_active_worktree: request.is_active_worktree,
        notification_id: request.notification_id,
        pane_key: request.pane_key,
        repo_label: request.repo_label,
        require_display_confirmation: request.require_display_confirmation,
        source,
        terminal_title: request.terminal_title,
        worktree_id: request.worktree_id,
        worktree_label: request.worktree_label,
    })
}

fn protocol_reason(reason: &str) -> NotificationReportReason {
    match reason {
        "disabled" => NotificationReportReason::Disabled,
        "source-disabled" => NotificationReportReason::SourceDisabled,
        "cooldown" => NotificationReportReason::Cooldown,
        "shell-unavailable" => NotificationReportReason::ShellUnavailable,
        "suppressed-focus" => NotificationReportReason::SuppressedFocus,
        "not-supported" => NotificationReportReason::NotSupported,
        "not-displayed" => NotificationReportReason::NotDisplayed,
        "blocked-by-system" => NotificationReportReason::BlockedBySystem,
        _ => NotificationReportReason::Unspecified,
    }
}

fn report_status(error: NotificationError) -> Status {
    // Why: the legacy notifications verbs answered every authority failure with
    // a bare 500, so the protobuf surface mirrors that instead of inventing
    // finer statuses the client never saw.
    status(StatusCode::Internal, &error.to_string())
}

pub(in crate::rpc) async fn load_custom_sound(
    authority: &NotificationSoundAuthority,
    payload: &[u8],
    context: &ProtocolCallContext,
) -> Result<(), Status> {
    let request = decode::<LoadCustomSoundRequest>(payload)?;
    if request
        .cached_asset_id
        .as_deref()
        .is_some_and(|value| !valid_sound_asset_id(value))
    {
        return Err(status(
            StatusCode::InvalidArgument,
            "cached_asset_id is invalid",
        ));
    }
    let sound = authority.load(request.cached_asset_id.as_deref()).await;
    match sound {
        Ok(NotificationSoundLoad::NotModified) => {
            send_sound_event(
                context,
                SoundEvent::NotModified(NotificationSoundNotModified {}),
            )
            .await?;
        }
        Ok(NotificationSoundLoad::Loaded(sound)) => {
            let byte_length = i64::try_from(sound.bytes.len()).map_err(|_| {
                status(
                    StatusCode::ResourceExhausted,
                    "Notification sound byte length cannot be represented",
                )
            })?;
            send_sound_event(
                context,
                SoundEvent::Start(NotificationSoundAssetStart {
                    asset_id: sound.asset_id,
                    mime_type: sound.mime_type.to_owned(),
                    byte_length,
                }),
            )
            .await?;
            for chunk in sound.bytes.chunks(NOTIFICATION_SOUND_CHUNK_BYTES) {
                send_sound_event(
                    context,
                    SoundEvent::Chunk(NotificationSoundAssetChunk {
                        data: chunk.to_vec(),
                    }),
                )
                .await?;
            }
        }
        Err(reason) => {
            send_sound_event(
                context,
                SoundEvent::Unavailable(ProtocolSoundUnavailable {
                    reason: protocol_sound_unavailable(reason) as i32,
                }),
            )
            .await?;
        }
    }
    Ok(())
}

async fn send_sound_event(context: &ProtocolCallContext, event: SoundEvent) -> Result<(), Status> {
    context
        .send_stream_payload(encode(&LoadCustomSoundResponse { event: Some(event) }))
        .await
}

fn valid_sound_asset_id(value: &str) -> bool {
    let Some(digest) = value.strip_prefix("sha256:") else {
        return false;
    };
    digest.len() == 64
        && digest
            .as_bytes()
            .iter()
            .all(|byte| byte.is_ascii_digit() || matches!(byte, b'a'..=b'f'))
}

fn protocol_sound_unavailable(
    reason: NotificationSoundUnavailable,
) -> NotificationSoundUnavailableReason {
    match reason {
        NotificationSoundUnavailable::InvalidPath => {
            NotificationSoundUnavailableReason::InvalidPath
        }
        NotificationSoundUnavailable::MissingPath => {
            NotificationSoundUnavailableReason::MissingPath
        }
        NotificationSoundUnavailable::ReadFailed => NotificationSoundUnavailableReason::ReadFailed,
        NotificationSoundUnavailable::TooLarge => NotificationSoundUnavailableReason::TooLarge,
        NotificationSoundUnavailable::UnsupportedType => {
            NotificationSoundUnavailableReason::UnsupportedType
        }
    }
}

pub(in crate::rpc) async fn get_missed_since(
    authority: &NotificationAuthority,
    payload: &[u8],
) -> Result<Vec<u8>, Status> {
    let request = decode::<GetMissedSinceRequest>(payload)?;
    if request.last_seen_sequence < 0 {
        return Err(status(
            StatusCode::InvalidArgument,
            "last_seen_sequence must be non-negative",
        ));
    }
    let notifications = authority
        .missed_since(request.last_seen_sequence)
        .await
        .map_err(notification_status)?
        .into_iter()
        .map(replay_event)
        .collect::<Result<Vec<_>, _>>()?;
    Ok(encode(&GetMissedSinceResponse { notifications }))
}

pub(in crate::rpc) async fn subscribe(
    authority: &NotificationAuthority,
    payload: &[u8],
    context: &ProtocolCallContext,
) -> Result<(), Status> {
    let _ = decode::<SubscribeRequest>(payload)?;
    let after_sequence = authority
        .latest_sequence()
        .await
        .map_err(notification_status)?;
    let mut subscription = authority
        .open_subscription(after_sequence)
        .await
        .map_err(notification_status)?;
    context
        .send_stream_payload(encode(&SubscribeResponse {
            event: Some(SubscribeEvent::Ready(SubscriptionReady {})),
        }))
        .await?;
    while let Some(notification) = subscription.next().await.map_err(notification_status)? {
        context
            .send_stream_payload(encode(&SubscribeResponse {
                event: Some(SubscribeEvent::Notification(replay_event(notification)?)),
            }))
            .await?;
    }
    Ok(())
}

fn replay_event(notification: ReplayableNotification) -> Result<ReplayNotificationEvent, Status> {
    if notification.notification_seq <= 0 {
        return Err(status(
            StatusCode::DataLoss,
            "Stored notification sequence is not positive",
        ));
    }
    let event = match notification.event {
        MobileNotificationEvent::Notification {
            body,
            notification_id,
            source,
            title,
            worktree_id,
        } => Event::Notification(NotificationDispatch {
            source: protocol_source(source) as i32,
            title,
            body,
            worktree_id,
            notification_id,
        }),
        MobileNotificationEvent::Dismiss { notification_id } => {
            Event::Dismiss(NotificationDismiss { notification_id })
        }
    };
    Ok(ReplayNotificationEvent {
        sequence: notification.notification_seq,
        event: Some(event),
    })
}

fn protocol_source(source: NotificationSource) -> ProtocolNotificationSource {
    match source {
        NotificationSource::AgentTaskComplete => ProtocolNotificationSource::AgentTaskComplete,
        NotificationSource::TerminalBell => ProtocolNotificationSource::TerminalBell,
        NotificationSource::Test => ProtocolNotificationSource::Test,
    }
}

fn notification_status(error: NotificationError) -> Status {
    let code = match error {
        NotificationError::WorkerUnavailable => StatusCode::Unavailable,
        NotificationError::Clock(_)
        | NotificationError::Random(_)
        | NotificationError::InsertFailed
        | NotificationError::Storage(_) => StatusCode::Internal,
    };
    status(code, "Notification replay could not be read")
}

fn status(code: StatusCode, message: &str) -> Status {
    Status {
        code: code as i32,
        message: message.to_owned(),
        details: Vec::new(),
    }
}
