use yiru_protocol::protocol::v1::{Status, StatusCode};
use yiru_protocol::runtime::v1::{
    ClientEventsServiceSubscribeRequest, ClientEventsServiceUnsubscribeRequest,
    ClientEventsServiceUnsubscribeResponse,
};
use yiru_protocol::transport::{decode, encode};

use crate::rpc::protocol_call::ProtocolCallContext;

use super::ClientEventsRpc;
use super::protocol_values::event;

pub(in crate::rpc) async fn subscribe(
    rpc: &ClientEventsRpc,
    payload: &[u8],
    connection_id: &str,
    context: &ProtocolCallContext,
) -> Result<(), Status> {
    decode::<ClientEventsServiceSubscribeRequest>(payload)?;
    let mut subscription = rpc.authority.subscribe(connection_id);
    while let Some(subscription_event) = subscription.next().await {
        let is_end = matches!(
            subscription_event,
            crate::client_events::ClientSubscriptionEvent::End
        );
        context
            .send_stream_payload(encode(&event(subscription_event)))
            .await?;
        if is_end {
            break;
        }
    }
    Ok(())
}

pub(in crate::rpc) async fn unsubscribe(
    rpc: &ClientEventsRpc,
    payload: &[u8],
    connection_id: &str,
) -> Result<Vec<u8>, Status> {
    let request = decode::<ClientEventsServiceUnsubscribeRequest>(payload)?;
    if request.subscription_id.is_empty() {
        return Err(invalid_argument("Missing subscriptionId"));
    }
    let unsubscribed = rpc
        .authority
        .unsubscribe(connection_id, &request.subscription_id);
    Ok(encode(&ClientEventsServiceUnsubscribeResponse {
        unsubscribed,
    }))
}

fn invalid_argument(message: &str) -> Status {
    Status {
        code: StatusCode::InvalidArgument as i32,
        message: message.to_owned(),
        details: Vec::new(),
    }
}
