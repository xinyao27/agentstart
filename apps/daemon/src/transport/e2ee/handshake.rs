use base64::Engine as _;
use base64::engine::general_purpose::STANDARD as BASE64;
use serde::{Deserialize, Serialize};
use x25519_dalek::{X25519_BASEPOINT_BYTES, x25519};

use super::schedule::{KeySchedule, derive_key_schedule};
use super::transcript::encode_transcript;
use super::{E2eeError, E2eeProfile, ReadyVocabulary};

const VERSION: u8 = 2;

pub(crate) struct ClientHandshake {
    client_nonce: [u8; 32],
    hello: Hello,
    hello_text: String,
    profile: E2eeProfile,
    secret_key: [u8; 32],
}

pub(crate) struct ServerHandshake {
    pub(crate) ready_text: String,
    pub(crate) schedule: KeySchedule,
}

#[derive(Clone, Serialize)]
#[serde(rename_all = "camelCase")]
pub(super) struct Hello {
    pub(super) r#type: String,
    pub(super) v: u8,
    pub(super) client_public_key_b64: String,
    pub(super) client_nonce_b64: String,
    pub(super) capabilities: Capabilities,
    pub(super) context: Context,
}

#[derive(Clone, Serialize)]
#[serde(rename_all = "camelCase")]
pub(super) struct Capabilities {
    pub(super) framing: [u8; 1],
    pub(super) payload_kinds: [String; 2],
}

#[derive(Deserialize)]
#[serde(deny_unknown_fields, rename_all = "camelCase")]
struct IncomingHello {
    r#type: String,
    v: f64,
    client_public_key_b64: String,
    client_nonce_b64: String,
    capabilities: IncomingCapabilities,
    context: Context,
}

#[derive(Deserialize)]
#[serde(deny_unknown_fields, rename_all = "camelCase")]
struct IncomingCapabilities {
    framing: [f64; 1],
    payload_kinds: [String; 2],
}

#[derive(Clone, Deserialize, Serialize)]
#[serde(deny_unknown_fields)]
pub(super) struct Context {
    pub(super) protocol: String,
    pub(super) initiator: String,
    pub(super) responder: String,
    pub(super) transport: String,
}

#[derive(Clone)]
pub(super) struct Ready {
    pub(super) client_nonce_b64: String,
    pub(super) context: Context,
    pub(super) server_nonce_b64: String,
    pub(super) server_public_key_b64: String,
    pub(super) selection: Selection,
    pub(super) r#type: String,
    pub(super) v: u8,
}

#[derive(Clone, Deserialize, Serialize)]
#[serde(deny_unknown_fields, rename_all = "camelCase")]
pub(super) struct Selection {
    pub(super) framing: u8,
    pub(super) payload_kinds: [String; 2],
}

#[derive(Deserialize, Serialize)]
#[serde(deny_unknown_fields, rename_all = "camelCase")]
struct MobileReady {
    client_nonce_b64: String,
    context: Context,
    desktop_nonce_b64: String,
    desktop_public_key_b64: String,
    selection: Selection,
    r#type: String,
    v: u8,
}

#[derive(Deserialize, Serialize)]
#[serde(deny_unknown_fields, rename_all = "camelCase")]
struct RuntimeReady {
    client_nonce_b64: String,
    context: Context,
    server_nonce_b64: String,
    server_public_key_b64: String,
    selection: Selection,
    r#type: String,
    v: u8,
}

impl ClientHandshake {
    pub(crate) fn create(profile: E2eeProfile) -> Result<Self, E2eeError> {
        let mut secret_key = [0_u8; 32];
        let mut client_nonce = [0_u8; 32];
        getrandom::fill(&mut secret_key)?;
        getrandom::fill(&mut client_nonce)?;
        let hello = Hello {
            r#type: "e2ee_hello".to_owned(),
            v: VERSION,
            client_public_key_b64: BASE64.encode(x25519(secret_key, X25519_BASEPOINT_BYTES)),
            client_nonce_b64: BASE64.encode(client_nonce),
            capabilities: Capabilities {
                framing: [VERSION],
                payload_kinds: ["text".to_owned(), "binary".to_owned()],
            },
            context: context(profile),
        };
        let hello_text = serde_json::to_string(&hello)?;
        Ok(Self {
            client_nonce,
            hello,
            hello_text,
            profile,
            secret_key,
        })
    }

    pub(crate) fn hello_text(&self) -> &str {
        &self.hello_text
    }

    pub(crate) fn accept_ready(
        self,
        ready_text: &str,
        pinned_public_key: [u8; 32],
    ) -> Result<KeySchedule, E2eeError> {
        let ready = decode_ready(ready_text, self.profile)?;
        validate_ready(&ready, self.profile, &self.hello.client_nonce_b64)?;
        let server_public_key = decode_canonical_32(&ready.server_public_key_b64)?;
        if server_public_key != pinned_public_key {
            return Err(E2eeError::HelloInvalid);
        }
        let server_nonce = decode_canonical_32(&ready.server_nonce_b64)?;
        let transcript = encode_transcript(
            self.profile,
            &self.hello,
            &ready,
            &decode_canonical_32(&self.hello.client_public_key_b64)?,
            &server_public_key,
            &self.client_nonce,
            &server_nonce,
        );
        derive_key_schedule(
            self.profile,
            self.secret_key,
            server_public_key,
            self.client_nonce,
            server_nonce,
            &transcript,
        )
    }
}

impl ServerHandshake {
    pub(crate) fn accept(
        hello_text: &str,
        secret_key: [u8; 32],
        profile: E2eeProfile,
    ) -> Result<Self, E2eeError> {
        let hello = decode_hello(hello_text)?;
        validate_hello(&hello, profile)?;
        let client_public_key = decode_canonical_32(&hello.client_public_key_b64)?;
        let client_nonce = decode_canonical_32(&hello.client_nonce_b64)?;
        let mut server_nonce = [0_u8; 32];
        getrandom::fill(&mut server_nonce)?;
        let server_public_key = x25519(secret_key, X25519_BASEPOINT_BYTES);
        let ready = Ready {
            client_nonce_b64: hello.client_nonce_b64.clone(),
            context: hello.context.clone(),
            server_nonce_b64: BASE64.encode(server_nonce),
            server_public_key_b64: BASE64.encode(server_public_key),
            selection: Selection {
                framing: VERSION,
                payload_kinds: ["text".to_owned(), "binary".to_owned()],
            },
            r#type: "e2ee_ready".to_owned(),
            v: VERSION,
        };
        let transcript = encode_transcript(
            profile,
            &hello,
            &ready,
            &client_public_key,
            &server_public_key,
            &client_nonce,
            &server_nonce,
        );
        let schedule = derive_key_schedule(
            profile,
            secret_key,
            client_public_key,
            client_nonce,
            server_nonce,
            &transcript,
        )?;
        Ok(Self {
            ready_text: encode_ready(&ready, profile)?,
            schedule,
        })
    }
}

fn decode_hello(hello_text: &str) -> Result<Hello, E2eeError> {
    let hello =
        serde_json::from_str::<IncomingHello>(hello_text).map_err(|_| E2eeError::HelloInvalid)?;
    if hello.v != f64::from(VERSION) || hello.capabilities.framing != [f64::from(VERSION)] {
        return Err(E2eeError::HelloInvalid);
    }
    Ok(Hello {
        r#type: hello.r#type,
        v: VERSION,
        client_public_key_b64: hello.client_public_key_b64,
        client_nonce_b64: hello.client_nonce_b64,
        capabilities: Capabilities {
            framing: [VERSION],
            payload_kinds: hello.capabilities.payload_kinds,
        },
        context: hello.context,
    })
}

fn validate_hello(hello: &Hello, profile: E2eeProfile) -> Result<(), E2eeError> {
    if hello.r#type != "e2ee_hello"
        || hello.v != VERSION
        || hello.capabilities.framing != [VERSION]
        || hello.capabilities.payload_kinds != ["text", "binary"]
        || !valid_context(&hello.context, profile)
    {
        return Err(E2eeError::HelloInvalid);
    }
    Ok(())
}

fn validate_ready(
    ready: &Ready,
    profile: E2eeProfile,
    client_nonce_b64: &str,
) -> Result<(), E2eeError> {
    if ready.r#type != "e2ee_ready"
        || ready.v != VERSION
        || ready.client_nonce_b64 != client_nonce_b64
        || ready.selection.framing != VERSION
        || ready.selection.payload_kinds != ["text", "binary"]
        || !valid_context(&ready.context, profile)
    {
        return Err(E2eeError::HelloInvalid);
    }
    Ok(())
}

fn context(profile: E2eeProfile) -> Context {
    Context {
        protocol: profile.protocol.to_owned(),
        initiator: profile.initiator.to_owned(),
        responder: profile.responder.to_owned(),
        transport: profile.transport.to_owned(),
    }
}

fn valid_context(context: &Context, profile: E2eeProfile) -> bool {
    context.protocol == profile.protocol
        && context.initiator == profile.initiator
        && context.responder == profile.responder
        && context.transport == profile.transport
}

fn decode_ready(ready_text: &str, profile: E2eeProfile) -> Result<Ready, E2eeError> {
    match profile.vocabulary {
        ReadyVocabulary::Mobile => {
            let ready = serde_json::from_str::<MobileReady>(ready_text)
                .map_err(|_| E2eeError::HelloInvalid)?;
            Ok(Ready {
                client_nonce_b64: ready.client_nonce_b64,
                context: ready.context,
                server_nonce_b64: ready.desktop_nonce_b64,
                server_public_key_b64: ready.desktop_public_key_b64,
                selection: ready.selection,
                r#type: ready.r#type,
                v: ready.v,
            })
        }
        ReadyVocabulary::Runtime => {
            let ready = serde_json::from_str::<RuntimeReady>(ready_text)
                .map_err(|_| E2eeError::HelloInvalid)?;
            Ok(Ready {
                client_nonce_b64: ready.client_nonce_b64,
                context: ready.context,
                server_nonce_b64: ready.server_nonce_b64,
                server_public_key_b64: ready.server_public_key_b64,
                selection: ready.selection,
                r#type: ready.r#type,
                v: ready.v,
            })
        }
    }
}

fn encode_ready(ready: &Ready, profile: E2eeProfile) -> Result<String, E2eeError> {
    match profile.vocabulary {
        ReadyVocabulary::Mobile => serde_json::to_string(&MobileReady {
            client_nonce_b64: ready.client_nonce_b64.clone(),
            context: ready.context.clone(),
            desktop_nonce_b64: ready.server_nonce_b64.clone(),
            desktop_public_key_b64: ready.server_public_key_b64.clone(),
            selection: ready.selection.clone(),
            r#type: ready.r#type.clone(),
            v: ready.v,
        })
        .map_err(E2eeError::from),
        ReadyVocabulary::Runtime => serde_json::to_string(&RuntimeReady {
            client_nonce_b64: ready.client_nonce_b64.clone(),
            context: ready.context.clone(),
            server_nonce_b64: ready.server_nonce_b64.clone(),
            server_public_key_b64: ready.server_public_key_b64.clone(),
            selection: ready.selection.clone(),
            r#type: ready.r#type.clone(),
            v: ready.v,
        })
        .map_err(E2eeError::from),
    }
}

pub(super) fn decode_canonical_32(value: &str) -> Result<[u8; 32], E2eeError> {
    if value.len() != 44
        || !value.ends_with('=')
        || !value[..43]
            .bytes()
            .all(|byte| byte.is_ascii_alphanumeric() || matches!(byte, b'+' | b'/'))
    {
        return Err(E2eeError::HelloInvalid);
    }
    let bytes = BASE64.decode(value).map_err(|_| E2eeError::HelloInvalid)?;
    let bytes = <[u8; 32]>::try_from(bytes).map_err(|_| E2eeError::HelloInvalid)?;
    if BASE64.encode(bytes) != value {
        return Err(E2eeError::HelloInvalid);
    }
    Ok(bytes)
}
