use agentstart_protocol::protocol::v1::Status;
use agentstart_protocol::runtime::v1::progress_events_service_event::Event;
use agentstart_protocol::runtime::v1::{
    ProgressEventsRepoCloneProgress, ProgressEventsServiceEvent,
    ProgressEventsServiceSubscribeRequest, ProgressEventsSubscribeReady,
};
use agentstart_protocol::transport::{decode, encode};

use crate::host_progress::HostProgressSubscriptionEvent;
use crate::rpc::protocol_call::ProtocolCallContext;

use super::HostProgressRpc;

pub(in crate::rpc) async fn subscribe(
    rpc: &HostProgressRpc,
    payload: &[u8],
    context: &ProtocolCallContext,
) -> Result<(), Status> {
    decode::<ProgressEventsServiceSubscribeRequest>(payload)?;
    let mut subscription = rpc.authority.subscribe();
    while let Some(event) = subscription.next().await {
        let is_end = matches!(event, HostProgressSubscriptionEvent::End);
        context
            .send_stream_payload(encode(&protocol_event(event)))
            .await?;
        if is_end {
            break;
        }
    }
    Ok(())
}

fn protocol_event(event: HostProgressSubscriptionEvent) -> ProgressEventsServiceEvent {
    let event = match event {
        HostProgressSubscriptionEvent::Ready { subscription_id } => {
            Event::Ready(ProgressEventsSubscribeReady { subscription_id })
        }
        HostProgressSubscriptionEvent::RepoCloneProgress { phase, percent } => {
            Event::RepoCloneProgress(ProgressEventsRepoCloneProgress {
                phase,
                percent: u32::from(percent),
            })
        }
        HostProgressSubscriptionEvent::End => Event::End(true),
    };
    ProgressEventsServiceEvent { event: Some(event) }
}
