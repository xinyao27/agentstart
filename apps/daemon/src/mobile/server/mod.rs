mod admission;
mod channel;
mod connection;
mod connections;
mod establishment;
mod wire;

use std::io;
use std::sync::Arc;

use axum::Router;
use axum::routing::any;
use thiserror::Error;
use tokio::net::TcpListener;
use tokio::sync::{mpsc, oneshot, watch};
use tokio::task::JoinHandle;

use crate::mobile::{MobileDeviceStore, MobileKeypair, MobilePresence};
use crate::runtime_environment::RuntimeEnvironmentAuthority;
use crate::runtime_environment::server::{
    RUNTIME_PATH, RuntimeAdmissionState, RuntimeAuthenticatedChannel,
};
use admission::{AdmissionState, MOBILE_PATH, admit_mobile, admit_runtime};
pub use channel::{
    MobileAuthenticatedChannel, MobileOutbound, MobileOutboundError, MobileRpcMessage,
};
use connections::MobileConnections;

const ACCEPTED_CHANNEL_CAPACITY: usize = 16;

pub struct MobileServerConfig {
    pub(crate) devices: MobileDeviceStore,
    pub(crate) keypair: MobileKeypair,
    pub(crate) port: u16,
    pub(crate) presence: MobilePresence,
    pub(crate) runtime_id: String,
    pub(crate) runtime_environments: RuntimeEnvironmentAuthority,
}

pub struct MobileServer {
    accepted: mpsc::Receiver<MobileAuthenticatedChannel>,
    endpoint: String,
    runtime_accepted: mpsc::Receiver<RuntimeAuthenticatedChannel>,
    runtime_endpoint: String,
    shutdown: Option<oneshot::Sender<()>>,
    socket_shutdown: watch::Sender<bool>,
    task: JoinHandle<Result<(), io::Error>>,
}

pub(crate) enum CompanionChannel {
    Mobile(MobileAuthenticatedChannel),
    Runtime(RuntimeAuthenticatedChannel),
}

#[derive(Debug, Error)]
pub enum MobileServerError {
    #[error("mobile listener failed: {0}")]
    Io(#[from] io::Error),
    #[error("mobile listener task failed: {0}")]
    Join(#[from] tokio::task::JoinError),
}

impl MobileServer {
    pub async fn bind(config: MobileServerConfig) -> Result<Self, MobileServerError> {
        let listener = match TcpListener::bind(("0.0.0.0", config.port)).await {
            Ok(listener) => listener,
            Err(_) => TcpListener::bind(("0.0.0.0", 0)).await?,
        };
        let port = listener.local_addr()?.port();
        let endpoint = format!("ws://127.0.0.1:{port}{MOBILE_PATH}");
        let runtime_endpoint = format!("ws://127.0.0.1:{port}{RUNTIME_PATH}");
        let (accepted_sender, accepted) = mpsc::channel(ACCEPTED_CHANNEL_CAPACITY);
        let (runtime_accepted_sender, runtime_accepted) = mpsc::channel(ACCEPTED_CHANNEL_CAPACITY);
        let (socket_shutdown, _) = watch::channel(false);
        let runtime_connections = config.runtime_environments.connections();
        let runtime = RuntimeAdmissionState {
            accepted: runtime_accepted_sender,
            authority: config.runtime_environments,
            connections: runtime_connections,
            runtime_id: Arc::from(config.runtime_id.clone()),
            shutdown: socket_shutdown.clone(),
        };
        let state = AdmissionState {
            accepted: accepted_sender,
            connections: MobileConnections::new(),
            devices: config.devices,
            keypair: Arc::new(config.keypair),
            presence: config.presence,
            runtime_id: Arc::from(config.runtime_id),
            runtime,
            shutdown: socket_shutdown.clone(),
        };
        let router = Router::new()
            .route(MOBILE_PATH, any(admit_mobile))
            .route(RUNTIME_PATH, any(admit_runtime))
            .with_state(state);
        let (shutdown_sender, shutdown_receiver) = oneshot::channel();
        let task = tokio::spawn(async move {
            axum::serve(listener, router)
                .with_graceful_shutdown(async move {
                    let _ = shutdown_receiver.await;
                })
                .await
        });
        Ok(Self {
            accepted,
            endpoint,
            runtime_accepted,
            runtime_endpoint,
            shutdown: Some(shutdown_sender),
            socket_shutdown,
            task,
        })
    }

    pub fn endpoint(&self) -> &str {
        &self.endpoint
    }

    pub(crate) fn runtime_endpoint(&self) -> &str {
        &self.runtime_endpoint
    }

    pub(crate) async fn accept(&mut self) -> Option<CompanionChannel> {
        tokio::select! {
            channel = self.accepted.recv() => channel.map(CompanionChannel::Mobile),
            channel = self.runtime_accepted.recv() => channel.map(CompanionChannel::Runtime),
        }
    }

    pub fn begin_shutdown(&mut self) {
        let _ = self.socket_shutdown.send(true);
        if let Some(shutdown) = self.shutdown.take() {
            let _ = shutdown.send(());
        }
    }

    pub async fn wait(self) -> Result<(), MobileServerError> {
        self.task.await??;
        Ok(())
    }

    pub async fn shutdown(mut self) -> Result<(), MobileServerError> {
        self.begin_shutdown();
        self.wait().await
    }
}
