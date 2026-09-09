use crate::mobile::server::channel::MobileRpcMessage;
use yiru_protocol::transport::has_frame_preamble;

const MAX_BINARY_MESSAGE_BYTES: usize = 4 * 1024 * 1024;

pub(super) fn decode_binary(frame: Vec<u8>) -> Option<MobileRpcMessage> {
    (has_frame_preamble(&frame) && frame.len() <= MAX_BINARY_MESSAGE_BYTES)
        .then_some(MobileRpcMessage::Binary(frame))
}
