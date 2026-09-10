use agentstart_protocol::protocol::v1::Status;
use agentstart_protocol::runtime::v1::{
    FeedbackServiceSubmitRequest, FeedbackServiceSubmitResponse,
};
use agentstart_protocol::transport::{decode, encode};

use crate::feedback::FeedbackSubmission;

use super::FeedbackRpc;

pub(in crate::rpc) async fn submit(rpc: &FeedbackRpc, payload: &[u8]) -> Result<Vec<u8>, Status> {
    let request = decode::<FeedbackServiceSubmitRequest>(payload)?;
    let submission = FeedbackSubmission {
        feedback: request.feedback,
        submit_anonymously: request.submit_anonymously.unwrap_or(false),
        github_login: request.github_login,
        github_email: request.github_email,
    };
    // Why: Support capture has no HTTP response status to expose through this result.
    let response = match rpc.feedback.submit(submission).await {
        Ok(()) => FeedbackServiceSubmitResponse {
            ok: true,
            status: None,
            error: None,
        },
        Err(error) => FeedbackServiceSubmitResponse {
            ok: false,
            status: None,
            error: Some(error),
        },
    };
    Ok(encode(&response))
}
