use std::collections::HashSet;
use std::io;

use axum::Router;
use axum::routing::any;
use thiserror::Error;
use tokio::net::TcpListener;
use tokio::sync::{mpsc, oneshot, watch};
use tokio::task::JoinHandle;

use super::extension_admission::{AdmissionState, EXTENSION_RPC_PATH, admit_request};
use crate::persistence::ArtifactStore;
use crate::rpc::AuthenticatedChannel;

const ACCEPTED_CHANNEL_CAPACITY: usize = 16;

pub struct ExtensionRpcConfig {
    pub allowed_origins: HashSet<String>,
    pub(crate) artifacts: ArtifactStore,
    pub auth_token: String,
    pub hostname: String,
    pub port: u16,
    pub runtime_id: String,
}

pub struct ExtensionRpcServer {
    accepted: mpsc::Receiver<AuthenticatedChannel>,
    endpoint: String,
    shutdown: Option<oneshot::Sender<()>>,
    socket_shutdown: watch::Sender<bool>,
    task: JoinHandle<Result<(), io::Error>>,
}

#[derive(Debug, Error)]
pub enum ExtensionRpcServerError {
    #[error("extension RPC listener failed: {0}")]
    Io(#[from] io::Error),
    #[error("extension RPC listener task failed: {0}")]
    Join(#[from] tokio::task::JoinError),
    #[error("OS random source failed: {0}")]
    Random(#[from] getrandom::Error),
}

impl ExtensionRpcServer {
    pub async fn bind(config: ExtensionRpcConfig) -> Result<Self, ExtensionRpcServerError> {
        let listener = TcpListener::bind((config.hostname.as_str(), config.port)).await?;
        let port = listener.local_addr()?.port();
        let authority = authority(&config.hostname, port);
        let endpoint = format!("ws://{authority}{EXTENSION_RPC_PATH}");
        let (accepted_tx, accepted) = mpsc::channel(ACCEPTED_CHANNEL_CAPACITY);
        let (socket_shutdown, _) = watch::channel(false);
        let state = AdmissionState::new(
            accepted_tx,
            config.allowed_origins,
            config.artifacts,
            &config.auth_token,
            config.runtime_id,
            socket_shutdown.clone(),
        );
        let router = Router::new().fallback(any(admit_request)).with_state(state);
        let (shutdown_tx, shutdown_rx) = oneshot::channel();
        let task = tokio::spawn(async move {
            axum::serve(listener, router)
                .with_graceful_shutdown(async move {
                    let _ = shutdown_rx.await;
                })
                .await
        });
        Ok(Self {
            accepted,
            endpoint,
            shutdown: Some(shutdown_tx),
            socket_shutdown,
            task,
        })
    }

    pub fn endpoint(&self) -> &str {
        &self.endpoint
    }

    pub async fn accept(&mut self) -> Option<AuthenticatedChannel> {
        self.accepted.recv().await
    }

    pub fn begin_shutdown(&mut self) {
        let _ = self.socket_shutdown.send(true);
        if let Some(shutdown) = self.shutdown.take() {
            let _ = shutdown.send(());
        }
    }

    pub async fn wait(self) -> Result<(), ExtensionRpcServerError> {
        self.task.await??;
        Ok(())
    }

    pub async fn shutdown(mut self) -> Result<(), ExtensionRpcServerError> {
        self.begin_shutdown();
        self.wait().await
    }
}

pub fn generate_auth_token() -> Result<String, ExtensionRpcServerError> {
    let mut bytes = [0_u8; 24];
    getrandom::fill(&mut bytes)?;
    const HEX: &[u8; 16] = b"0123456789abcdef";
    let mut token = String::with_capacity(bytes.len() * 2);
    for byte in bytes {
        token.push(char::from(HEX[usize::from(byte >> 4)]));
        token.push(char::from(HEX[usize::from(byte & 0x0f)]));
    }
    Ok(token)
}

pub fn read_allowed_extension_origins(primary_origin: &str) -> HashSet<String> {
    let mut origins = HashSet::from([primary_origin.to_owned()]);
    if let Ok(configured) = std::env::var("AGENTSTART_EXTENSION_ORIGINS") {
        origins.extend(
            configured
                .split(',')
                .map(str::trim)
                .filter(|origin| is_chrome_extension_origin(origin))
                .map(str::to_owned),
        );
    }
    origins
}

fn authority(hostname: &str, port: u16) -> String {
    if hostname.contains(':') && !hostname.starts_with('[') {
        format!("[{hostname}]:{port}")
    } else {
        format!("{hostname}:{port}")
    }
}

fn is_chrome_extension_origin(origin: &str) -> bool {
    origin
        .strip_prefix("chrome-extension://")
        .is_some_and(|id| id.len() == 32 && id.bytes().all(|byte| matches!(byte, b'a'..=b'p')))
}
