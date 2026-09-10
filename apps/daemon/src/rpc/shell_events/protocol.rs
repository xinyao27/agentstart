use agentstart_protocol::protocol::v1::{Status, StatusCode};
use agentstart_protocol::runtime::v1::shell_events_service_event::Event;
use agentstart_protocol::runtime::v1::{
    ShellEventsCursor, ShellEventsKeybindingsChanged, ShellEventsReady, ShellEventsResync,
    ShellEventsServiceEvent, ShellEventsServiceSubscribeRequest, ShellEventsStarNagHide,
    ShellEventsStarNagShow, ShellEventsStarNagSurface,
};
use agentstart_protocol::transport::{decode, encode};

use crate::rpc::keybindings::protocol_values::protocol_snapshot;
use crate::rpc::protocol_call::ProtocolCallContext;
use crate::rpc::star_nag::protocol::protocol_mode;
use crate::shell_events::{ShellEventCursor, ShellSubscriptionEvent};

use super::ShellEventsRpc;

pub(in crate::rpc) async fn subscribe(
    rpc: &ShellEventsRpc,
    payload: &[u8],
    context: &ProtocolCallContext,
) -> Result<(), Status> {
    let request = decode::<ShellEventsServiceSubscribeRequest>(payload)?;
    // Why: the replay cursor is the raw JSON sequence number the legacy
    // channel carried, so a non-finite double has no cursor to mean and is
    // refused instead of silently resubscribing from the head.
    let cursor = request.last_seen_seq.map(|seq| {
        serde_json::Number::from_f64(seq)
            .map(ShellEventCursor::from_number)
            .ok_or_else(|| invalid_argument("lastSeenSeq must be a finite number"))
    });
    let cursor = cursor.transpose()?;
    let mut subscription = rpc.authority.subscribe(cursor);
    while let Some(event) = subscription.next().await {
        context
            .send_stream_payload(encode(&protocol_event(event)))
            .await?;
    }
    Ok(())
}

fn protocol_event(event: ShellSubscriptionEvent) -> ShellEventsServiceEvent {
    let event = match event {
        ShellSubscriptionEvent::Ready { seq } => Event::Ready(ShellEventsReady {
            cursor: Some(cursor(&seq)),
        }),
        ShellSubscriptionEvent::Resync { seq } => Event::Resync(ShellEventsResync {
            cursor: Some(cursor(&seq)),
        }),
        ShellSubscriptionEvent::KeybindingsChanged { seq, snapshot } => {
            Event::KeybindingsChanged(ShellEventsKeybindingsChanged {
                cursor: Some(cursor(&seq)),
                snapshot: Some(protocol_snapshot(&snapshot)),
            })
        }
        ShellSubscriptionEvent::StarNagShow { seq, mode, surface } => {
            Event::StarNagShow(ShellEventsStarNagShow {
                cursor: Some(cursor(&seq)),
                mode: protocol_mode(mode) as i32,
                surface: match surface {
                    crate::star_nag::StarNagSurface::Card => ShellEventsStarNagSurface::Card,
                    crate::star_nag::StarNagSurface::Toast => ShellEventsStarNagSurface::Toast,
                } as i32,
            })
        }
        ShellSubscriptionEvent::StarNagHide { seq } => Event::StarNagHide(ShellEventsStarNagHide {
            cursor: Some(cursor(&seq)),
        }),
    };
    ShellEventsServiceEvent { event: Some(event) }
}

fn cursor(seq: &ShellEventCursor) -> ShellEventsCursor {
    ShellEventsCursor { seq: seq.value() }
}

fn invalid_argument(message: &str) -> Status {
    status(StatusCode::InvalidArgument, message)
}

fn status(code: StatusCode, message: &str) -> Status {
    Status {
        code: code as i32,
        message: message.to_owned(),
        details: Vec::new(),
    }
}
