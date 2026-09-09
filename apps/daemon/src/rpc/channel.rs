use std::sync::Arc;
use std::sync::atomic::{AtomicBool, AtomicU64, AtomicUsize, Ordering};

use tokio::sync::{mpsc, watch};
use yiru_protocol::protocol::v1::PeerKind;

use crate::mobile::{
    MobileAuthenticatedChannel, MobileAuthorization, MobileOutbound, MobileRpcMessage,
};
use crate::protocol::CallerClass;
use crate::runtime_environment::RuntimeAuthorization;
use crate::runtime_environment::server::{RuntimeAuthenticatedChannel, RuntimeOutbound};

const MAX_EXTENSION_QUEUED_BYTES: usize = 4 * 1024 * 1024;
const MAX_EXTENSION_QUEUED_MESSAGES: usize = 1_024;

pub(crate) enum RpcMessage {
    Binary(Vec<u8>),
    Text(String),
}

#[derive(Clone)]
pub(crate) enum RpcOutgoing {
    Extension(ExtensionOutbound),
    Mobile(MobileOutbound),
    Runtime(RuntimeOutbound),
}

#[derive(Clone)]
pub(crate) struct ExtensionOutbound {
    close: watch::Sender<Option<ExtensionCloseRequest>>,
    queue: mpsc::Sender<ExtensionQueuedMessage>,
    state: Arc<ExtensionOutboundState>,
}

pub(crate) struct ExtensionOutboundReceiver {
    close: watch::Receiver<Option<ExtensionCloseRequest>>,
    queue: mpsc::Receiver<ExtensionQueuedMessage>,
}

pub(crate) enum ExtensionOutboundEvent {
    Close(Option<ExtensionCloseRequest>),
    Message(ExtensionQueuedMessage),
}

#[derive(Clone)]
pub(crate) struct ExtensionCloseRequest {
    pub(crate) code: u16,
    pub(crate) reason: String,
}

pub(crate) struct ExtensionQueuedMessage {
    message: Option<RpcMessage>,
    state: Arc<ExtensionOutboundState>,
    wire_bytes: usize,
}

struct ExtensionOutboundState {
    closed: AtomicBool,
    queued_bytes: AtomicUsize,
}

pub struct AuthenticatedChannel {
    authorization: Option<MobileAuthorization>,
    runtime_authorization: Option<RuntimeAuthorization>,
    connection_id: String,
    incoming: RpcIncoming,
    outgoing: RpcOutgoing,
    principal: CallerClass,
    principal_id: String,
    protocol_peer_kind: PeerKind,
}

enum RpcIncoming {
    Extension(mpsc::Receiver<RpcMessage>),
    Mobile(mpsc::Receiver<MobileRpcMessage>),
    Runtime(mpsc::Receiver<Vec<u8>>),
}

static NEXT_EXTENSION_CONNECTION_ID: AtomicU64 = AtomicU64::new(0);

impl AuthenticatedChannel {
    pub(crate) fn extension(
        incoming: mpsc::Receiver<RpcMessage>,
        outgoing: ExtensionOutbound,
        protocol_peer_kind: PeerKind,
    ) -> Self {
        let sequence = NEXT_EXTENSION_CONNECTION_ID.fetch_add(1, Ordering::Relaxed) + 1;
        let peer_name = match protocol_peer_kind {
            PeerKind::ChromeExtension => "extension",
            PeerKind::Cli => "cli",
            PeerKind::Unspecified | PeerKind::IosApp | PeerKind::Daemon => "invalid-local-peer",
        };
        let connection_id = format!("{peer_name}-{sequence}");
        Self {
            authorization: None,
            runtime_authorization: None,
            principal_id: format!("{peer_name}:{connection_id}"),
            connection_id,
            incoming: RpcIncoming::Extension(incoming),
            outgoing: RpcOutgoing::Extension(outgoing),
            principal: CallerClass::Local,
            protocol_peer_kind,
        }
    }

    pub(crate) fn mobile(channel: MobileAuthenticatedChannel) -> Self {
        let principal_id = channel.device_id.clone();
        Self {
            authorization: Some(channel.authorization),
            runtime_authorization: None,
            connection_id: channel.connection_id,
            incoming: RpcIncoming::Mobile(channel.incoming),
            outgoing: RpcOutgoing::Mobile(channel.outgoing),
            principal: CallerClass::Mobile,
            principal_id,
            protocol_peer_kind: PeerKind::IosApp,
        }
    }

    pub(crate) fn runtime(channel: RuntimeAuthenticatedChannel) -> Self {
        let principal_id = channel.peer_id.clone();
        Self {
            authorization: None,
            runtime_authorization: Some(channel.authorization),
            connection_id: channel.connection_id,
            incoming: RpcIncoming::Runtime(channel.incoming),
            outgoing: RpcOutgoing::Runtime(channel.outgoing),
            principal: CallerClass::Runtime,
            principal_id,
            protocol_peer_kind: PeerKind::Daemon,
        }
    }

    pub(super) fn authorization(&self) -> Option<MobileAuthorization> {
        self.authorization.clone()
    }

    pub(super) fn runtime_authorization(&self) -> Option<RuntimeAuthorization> {
        self.runtime_authorization.clone()
    }

    pub(crate) fn close(&self, code: u16, reason: impl Into<String>) {
        self.outgoing.close(code, reason);
    }

    pub(super) fn outgoing(&self) -> RpcOutgoing {
        self.outgoing.clone()
    }

    pub(super) fn connection_id(&self) -> &str {
        &self.connection_id
    }

    pub(super) fn principal(&self) -> CallerClass {
        self.principal
    }

    pub(super) fn principal_id(&self) -> &str {
        &self.principal_id
    }

    pub(super) fn protocol_peer_kind(&self) -> PeerKind {
        self.protocol_peer_kind
    }

    pub(super) async fn receive(&mut self) -> Option<RpcMessage> {
        match &mut self.incoming {
            RpcIncoming::Extension(incoming) => incoming.recv().await,
            RpcIncoming::Mobile(incoming) => incoming.recv().await.map(|message| match message {
                MobileRpcMessage::Binary(bytes) => RpcMessage::Binary(bytes),
            }),
            RpcIncoming::Runtime(incoming) => incoming.recv().await.map(RpcMessage::Binary),
        }
    }
}

impl RpcOutgoing {
    pub(super) fn send_binary(&self, frame: Vec<u8>) -> Result<(), ()> {
        match self {
            Self::Extension(outgoing) => outgoing.send(RpcMessage::Binary(frame)),
            Self::Mobile(outgoing) => outgoing.send_binary(frame).map_err(|_| ()),
            Self::Runtime(outgoing) => outgoing.send_binary(frame),
        }
    }

    pub(super) fn close(&self, code: u16, reason: impl Into<String>) {
        match self {
            Self::Extension(outgoing) => outgoing.close(code, reason),
            Self::Mobile(outgoing) => outgoing.close(code, reason),
            Self::Runtime(outgoing) => outgoing.close(code, reason),
        }
    }
}

pub(crate) fn extension_outbound_channel() -> (ExtensionOutbound, ExtensionOutboundReceiver) {
    let (queue, receiver) = mpsc::channel(MAX_EXTENSION_QUEUED_MESSAGES);
    let (close, close_receiver) = watch::channel(None);
    let state = Arc::new(ExtensionOutboundState {
        closed: AtomicBool::new(false),
        queued_bytes: AtomicUsize::new(0),
    });
    (
        ExtensionOutbound {
            close,
            queue,
            state: state.clone(),
        },
        ExtensionOutboundReceiver {
            close: close_receiver,
            queue: receiver,
        },
    )
}

impl ExtensionOutbound {
    fn send(&self, message: RpcMessage) -> Result<(), ()> {
        if self.state.closed.load(Ordering::Acquire) {
            return Err(());
        }
        let wire_bytes = match &message {
            RpcMessage::Binary(frame) => frame.len(),
            RpcMessage::Text(frame) => frame.len(),
        };
        if !reserve_extension_bytes(&self.state, wire_bytes) {
            self.close(1011, "Runtime backpressure limit exceeded");
            return Err(());
        }
        let queued = ExtensionQueuedMessage {
            message: Some(message),
            state: self.state.clone(),
            wire_bytes,
        };
        match self.queue.try_send(queued) {
            Ok(()) => Ok(()),
            Err(mpsc::error::TrySendError::Full(_)) => {
                self.close(1011, "Runtime backpressure limit exceeded");
                Err(())
            }
            Err(mpsc::error::TrySendError::Closed(_)) => Err(()),
        }
    }

    fn close(&self, code: u16, reason: impl Into<String>) {
        if !self.state.closed.swap(true, Ordering::AcqRel) {
            let _ = self.close.send(Some(ExtensionCloseRequest {
                code,
                reason: reason.into(),
            }));
        }
    }
}

impl ExtensionOutboundReceiver {
    pub(crate) async fn next(&mut self) -> ExtensionOutboundEvent {
        tokio::select! {
            biased;
            close = extension_close_requested(&mut self.close) => ExtensionOutboundEvent::Close(close),
            message = self.queue.recv() => ExtensionOutboundEvent::Message(match message {
                Some(message) => message,
                None => return ExtensionOutboundEvent::Close(None),
            }),
        }
    }
}

impl ExtensionQueuedMessage {
    pub(crate) fn take_message(&mut self) -> Option<RpcMessage> {
        self.message.take()
    }
}

impl Drop for ExtensionQueuedMessage {
    fn drop(&mut self) {
        self.state
            .queued_bytes
            .fetch_sub(self.wire_bytes, Ordering::AcqRel);
    }
}

fn reserve_extension_bytes(state: &ExtensionOutboundState, bytes: usize) -> bool {
    let mut current = state.queued_bytes.load(Ordering::Acquire);
    loop {
        let Some(next) = current.checked_add(bytes) else {
            return false;
        };
        if next > MAX_EXTENSION_QUEUED_BYTES {
            return false;
        }
        match state.queued_bytes.compare_exchange_weak(
            current,
            next,
            Ordering::AcqRel,
            Ordering::Acquire,
        ) {
            Ok(_) => return true,
            Err(observed) => current = observed,
        }
    }
}

async fn extension_close_requested(
    close: &mut watch::Receiver<Option<ExtensionCloseRequest>>,
) -> Option<ExtensionCloseRequest> {
    if let Some(request) = close.borrow().clone() {
        return Some(request);
    }
    while close.changed().await.is_ok() {
        if let Some(request) = close.borrow().clone() {
            return Some(request);
        }
    }
    None
}
