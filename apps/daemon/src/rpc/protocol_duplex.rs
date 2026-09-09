use tokio::sync::mpsc;

use super::protocol_connection::INITIAL_CALL_CREDIT_BYTES;

const INPUT_QUEUE_DEPTH: usize = 256;

pub(super) struct DuplexRequest {
    pub(super) credit: u64,
    pub(super) receiver: Option<mpsc::Receiver<Vec<u8>>>,
    pub(super) sender: Option<mpsc::Sender<Vec<u8>>>,
}

impl DuplexRequest {
    pub(super) fn new() -> Self {
        let (sender, receiver) = mpsc::channel(INPUT_QUEUE_DEPTH);
        Self {
            credit: INITIAL_CALL_CREDIT_BYTES,
            receiver: Some(receiver),
            sender: Some(sender),
        }
    }
}
