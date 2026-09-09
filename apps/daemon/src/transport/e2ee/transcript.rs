use super::E2eeProfile;
use super::handshake::{Hello, Ready};

pub(super) fn encode_transcript(
    profile: E2eeProfile,
    hello: &Hello,
    ready: &Ready,
    client_public_key: &[u8; 32],
    server_public_key: &[u8; 32],
    client_nonce: &[u8; 32],
    server_nonce: &[u8; 32],
) -> Vec<u8> {
    let forward = profile.forward_label;
    let reverse = profile.reverse_label;
    let fields = [
        field("domain", profile.transcript_domain.as_bytes()),
        field(&format!("{forward}.type"), hello.r#type.as_bytes()),
        field(&format!("{forward}.version"), &uint32(2)),
        field(&format!("{forward}.client-public-key"), client_public_key),
        field(&format!("{forward}.client-nonce"), client_nonce),
        field(
            &format!("{forward}.capabilities.framing"),
            &number_list(&[2]),
        ),
        field(
            &format!("{forward}.capabilities.payload-kinds"),
            &string_list(&["text", "binary"]),
        ),
        field(
            &format!("{forward}.context.protocol"),
            hello.context.protocol.as_bytes(),
        ),
        field(
            &format!("{forward}.context.initiator"),
            hello.context.initiator.as_bytes(),
        ),
        field(
            &format!("{forward}.context.responder"),
            hello.context.responder.as_bytes(),
        ),
        field(
            &format!("{forward}.context.transport"),
            hello.context.transport.as_bytes(),
        ),
        field(&format!("{reverse}.type"), ready.r#type.as_bytes()),
        field(&format!("{reverse}.version"), &uint32(2)),
        field(
            &format!("{reverse}.{}", profile.server_public_key_label),
            server_public_key,
        ),
        field(&format!("{reverse}.client-nonce-echo"), client_nonce),
        field(
            &format!("{reverse}.{}", profile.server_nonce_label),
            server_nonce,
        ),
        field(&format!("{reverse}.selection.framing"), &uint32(2)),
        field(
            &format!("{reverse}.selection.payload-kinds"),
            &string_list(&["text", "binary"]),
        ),
        field(
            &format!("{reverse}.context.protocol"),
            ready.context.protocol.as_bytes(),
        ),
        field(
            &format!("{reverse}.context.initiator"),
            ready.context.initiator.as_bytes(),
        ),
        field(
            &format!("{reverse}.context.responder"),
            ready.context.responder.as_bytes(),
        ),
        field(
            &format!("{reverse}.context.transport"),
            ready.context.transport.as_bytes(),
        ),
    ];
    let capacity = fields.iter().map(Vec::len).sum();
    let mut output = Vec::with_capacity(capacity);
    for field in fields {
        output.extend(field);
    }
    output
}

fn field(name: &str, value: &[u8]) -> Vec<u8> {
    let mut output = Vec::with_capacity(8 + name.len() + value.len());
    output.extend(uint32(name.len()));
    output.extend(name.as_bytes());
    output.extend(uint32(value.len()));
    output.extend(value);
    output
}

fn number_list(values: &[u32]) -> Vec<u8> {
    let mut output = Vec::with_capacity(4 + values.len() * 4);
    output.extend(uint32(values.len()));
    for value in values {
        output.extend(value.to_be_bytes());
    }
    output
}

fn string_list(values: &[&str]) -> Vec<u8> {
    let capacity = 4 + values.iter().map(|value| 4 + value.len()).sum::<usize>();
    let mut output = Vec::with_capacity(capacity);
    output.extend(uint32(values.len()));
    for value in values {
        output.extend(uint32(value.len()));
        output.extend(value.as_bytes());
    }
    output
}

fn uint32(value: impl TryInto<u32>) -> [u8; 4] {
    value.try_into().ok().unwrap_or(u32::MAX).to_be_bytes()
}
