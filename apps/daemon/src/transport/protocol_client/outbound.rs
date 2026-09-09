use std::sync::Arc;

use tokio::sync::{OwnedSemaphorePermit, Semaphore, mpsc, oneshot, watch};
use tokio::time::{Duration, Instant, timeout, timeout_at};

use super::{FrameTransportWriter, MAX_COMMANDS, ProtocolPeerError};

pub(super) const TRANSPORT_IO_TIMEOUT: Duration = Duration::from_secs(10);

#[derive(Clone)]
pub(super) struct Outbound {
    duplex_slots: Arc<Semaphore>,
    commands: mpsc::Sender<OutboundCommand>,
    shutdown: watch::Sender<bool>,
}

enum OutboundCommand {
    Frames {
        budget: Option<OwnedSemaphorePermit>,
        duplex_slot: Option<OwnedSemaphorePermit>,
        deadline: Instant,
        frames: Vec<Vec<u8>>,
    },
    Pong {
        deadline: Instant,
        payload: Vec<u8>,
    },
}

impl Outbound {
    pub(super) fn spawn<Writer>(
        writer: Writer,
    ) -> (Self, oneshot::Receiver<Result<(), ProtocolPeerError>>)
    where
        Writer: FrameTransportWriter,
    {
        let (command_tx, command_rx) = mpsc::channel(MAX_COMMANDS);
        let (done_tx, done_rx) = oneshot::channel();
        let (shutdown_tx, shutdown_rx) = watch::channel(false);
        tokio::spawn(run_writer(writer, command_rx, shutdown_rx, done_tx));
        (
            Self {
                commands: command_tx,
                duplex_slots: Arc::new(Semaphore::new(MAX_COMMANDS / 2)),
                shutdown: shutdown_tx,
            },
            done_rx,
        )
    }

    pub(super) fn frames(
        &self,
        frames: Vec<Vec<u8>>,
        call_deadline: Instant,
    ) -> Result<(), ProtocolPeerError> {
        if frames.is_empty() {
            return Err(ProtocolPeerError::Protocol("outbound_batch_empty"));
        }
        self.enqueue(OutboundCommand::Frames {
            budget: None,
            duplex_slot: None,
            deadline: io_deadline(call_deadline)?,
            frames,
        })
    }

    pub(super) fn request_frames(
        &self,
        frames: Vec<Vec<u8>>,
        call_deadline: Instant,
        budget: OwnedSemaphorePermit,
    ) -> Result<(), ProtocolPeerError> {
        if frames.is_empty() {
            return Err(ProtocolPeerError::Protocol("outbound_batch_empty"));
        }
        self.enqueue(OutboundCommand::Frames {
            budget: Some(budget),
            duplex_slot: None,
            deadline: io_deadline(call_deadline)?,
            frames,
        })
    }

    pub(super) async fn reserve_request(
        &self,
        call_deadline: Instant,
    ) -> Result<RequestPermit, ProtocolPeerError> {
        let deadline = io_deadline(call_deadline)?;
        let slot = timeout_at(deadline, self.duplex_slots.clone().acquire_owned())
            .await
            .map_err(|_| ProtocolPeerError::ConnectionTimeout)?
            .map_err(|_| ProtocolPeerError::ConnectionFailed)?;
        let queue = timeout_at(deadline, self.commands.clone().reserve_owned())
            .await
            .map_err(|_| ProtocolPeerError::ConnectionTimeout)?
            .map_err(|_| ProtocolPeerError::ConnectionFailed)?;
        Ok(RequestPermit { queue, slot })
    }

    pub(super) fn pong(&self, payload: Vec<u8>) -> Result<(), ProtocolPeerError> {
        self.enqueue(OutboundCommand::Pong {
            deadline: transport_deadline()?,
            payload,
        })
    }

    pub(super) fn shutdown(&self) {
        let _ = self.shutdown.send(true);
    }

    fn enqueue(&self, command: OutboundCommand) -> Result<(), ProtocolPeerError> {
        self.commands
            .try_send(command)
            .map_err(|_| ProtocolPeerError::ConnectionFailed)
    }
}

pub(super) struct RequestPermit {
    queue: mpsc::OwnedPermit<OutboundCommand>,
    slot: OwnedSemaphorePermit,
}

impl RequestPermit {
    pub(super) fn send(
        self,
        frames: Vec<Vec<u8>>,
        call_deadline: Instant,
        budget: OwnedSemaphorePermit,
    ) -> Result<(), ProtocolPeerError> {
        let deadline = io_deadline(call_deadline)?;
        self.queue.send(OutboundCommand::Frames {
            budget: Some(budget),
            duplex_slot: Some(self.slot),
            deadline,
            frames,
        });
        Ok(())
    }
}

async fn run_writer<Writer>(
    mut writer: Writer,
    mut commands: mpsc::Receiver<OutboundCommand>,
    mut shutdown: watch::Receiver<bool>,
    done: oneshot::Sender<Result<(), ProtocolPeerError>>,
) where
    Writer: FrameTransportWriter,
{
    let result = loop {
        tokio::select! {
            biased;
            changed = shutdown.changed() => {
                if changed.is_err() || *shutdown.borrow() {
                    break Ok(());
                }
            }
            command = commands.recv() => {
                let Some(command) = command else {
                    break Ok(());
                };
                if let Err(error) = write_command(&mut writer, command).await {
                    break Err(error);
                }
            }
        }
    };
    let _ = timeout(TRANSPORT_IO_TIMEOUT, writer.close()).await;
    let _ = done.send(result);
}

async fn write_command<Writer>(
    writer: &mut Writer,
    command: OutboundCommand,
) -> Result<(), ProtocolPeerError>
where
    Writer: FrameTransportWriter,
{
    match command {
        OutboundCommand::Frames {
            budget,
            duplex_slot,
            deadline,
            frames,
        } => {
            for frame in frames {
                timeout_at(deadline, writer.send(frame))
                    .await
                    .map_err(|_| ProtocolPeerError::ConnectionTimeout)??;
            }
            drop(budget);
            drop(duplex_slot);
        }
        OutboundCommand::Pong { deadline, payload } => {
            timeout_at(deadline, writer.pong(payload))
                .await
                .map_err(|_| ProtocolPeerError::ConnectionTimeout)??;
        }
    }
    Ok(())
}

fn io_deadline(call_deadline: Instant) -> Result<Instant, ProtocolPeerError> {
    Ok(call_deadline.min(transport_deadline()?))
}

fn transport_deadline() -> Result<Instant, ProtocolPeerError> {
    Instant::now()
        .checked_add(TRANSPORT_IO_TIMEOUT)
        .ok_or(ProtocolPeerError::Protocol("deadline_invalid"))
}
