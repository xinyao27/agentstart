use std::collections::VecDeque;
use std::sync::Arc;
use std::time::Duration;

use reqwest::Client;
use serde_json::{Value, json};
use tokio::sync::{mpsc, oneshot};

use super::TelemetryError;
use super::identity::{iso_timestamp, random_uuid};

const HOST: &str = "https://us.i.posthog.com";
const COMMAND_QUEUE_SIZE: usize = 256;
const FLUSH_AT: usize = 20;
const FLUSH_INTERVAL: Duration = Duration::from_secs(10);
const HTTP_TIMEOUT: Duration = Duration::from_secs(5);
const SUPPORT_REPORT_TIMEOUT: Duration = Duration::from_secs(10);
const MAX_QUEUE_SIZE: usize = 5_000;
const SHUTDOWN_WAIT: Duration = Duration::from_secs(2);

#[derive(Clone)]
pub(super) struct PosthogQueue {
    commands: mpsc::Sender<Command>,
}

#[derive(Clone)]
pub(super) struct PosthogSender {
    transport: Arc<Transport>,
}

enum Command {
    Enqueue {
        message: Value,
        response: Option<oneshot::Sender<bool>>,
    },
    Shutdown(oneshot::Sender<()>),
}

struct Transport {
    client: Client,
    write_key: String,
}

impl PosthogQueue {
    pub(super) fn new(sender: PosthogSender) -> Self {
        let (commands, receiver) = mpsc::channel(COMMAND_QUEUE_SIZE);
        tokio::spawn(run(sender, receiver));
        Self { commands }
    }

    pub(super) fn enqueue(
        &self,
        event: &str,
        distinct_id: &str,
        properties: Value,
    ) -> Result<(), TelemetryError> {
        let message = message(event, distinct_id, properties)?;
        self.commands
            .try_send(Command::Enqueue {
                message,
                response: None,
            })
            .map_err(|_| TelemetryError::TransportUnavailable)
    }

    pub(super) async fn enqueue_confirmed(
        &self,
        event: &str,
        distinct_id: &str,
        properties: Value,
    ) -> Result<bool, TelemetryError> {
        let message = message(event, distinct_id, properties)?;
        let (response, result) = oneshot::channel();
        self.commands
            .try_send(Command::Enqueue {
                message,
                response: Some(response),
            })
            .map_err(|_| TelemetryError::TransportUnavailable)?;
        Ok(tokio::time::timeout(Duration::from_secs(1), result)
            .await
            .ok()
            .and_then(Result::ok)
            .unwrap_or(false))
    }

    pub(super) async fn shutdown(&self) {
        let (response, result) = oneshot::channel();
        if tokio::time::timeout(
            SHUTDOWN_WAIT,
            self.commands.send(Command::Shutdown(response)),
        )
        .await
        .is_ok_and(|result| result.is_ok())
        {
            let _ = tokio::time::timeout(SHUTDOWN_WAIT, result).await;
        }
    }
}

impl PosthogSender {
    pub(super) fn new(write_key: String) -> Self {
        Self {
            transport: Arc::new(Transport {
                client: Client::new(),
                write_key,
            }),
        }
    }

    pub(super) async fn send_immediate(
        &self,
        event: &str,
        distinct_id: &str,
        properties: Value,
    ) -> Result<bool, TelemetryError> {
        let message = message(event, distinct_id, properties)?;
        let payload = json!({
            "api_key": &self.transport.write_key,
            "batch": [message],
            "sent_at": iso_timestamp()?
        });
        Ok(self
            .transport
            .client
            .post(format!("{HOST}/batch/"))
            .timeout(SUPPORT_REPORT_TIMEOUT)
            .json(&payload)
            .send()
            .await
            .is_ok_and(|response| response.status().is_success()))
    }
}

fn message(event: &str, distinct_id: &str, mut properties: Value) -> Result<Value, TelemetryError> {
    if let Some(properties) = properties.as_object_mut() {
        properties.insert("$geoip_disable".to_owned(), Value::Bool(true));
    }
    Ok(json!({
        "distinct_id": distinct_id,
        "event": event,
        "properties": properties,
        "timestamp": iso_timestamp()?,
        "uuid": random_uuid()?
    }))
}

async fn run(sender: PosthogSender, mut commands: mpsc::Receiver<Command>) {
    let mut queue = VecDeque::new();
    let timer = tokio::time::sleep(FLUSH_INTERVAL);
    tokio::pin!(timer);
    loop {
        tokio::select! {
            command = commands.recv() => match command {
                Some(Command::Enqueue { message, response }) => {
                    if queue.len() >= MAX_QUEUE_SIZE {
                        queue.pop_front();
                    }
                    queue.push_back(message);
                    if let Some(response) = response {
                        let _ = response.send(true);
                    }
                    if queue.len() >= FLUSH_AT {
                        flush_batch(&sender.transport, &mut queue).await;
                    }
                }
                Some(Command::Shutdown(response)) => {
                    while !queue.is_empty() {
                        let before = queue.len();
                        flush_batch(&sender.transport, &mut queue).await;
                        if queue.len() == before {
                            break;
                        }
                    }
                    let _ = response.send(());
                    return;
                }
                None => return,
            },
            () = &mut timer => {
                flush_batch(&sender.transport, &mut queue).await;
                timer.as_mut().reset(tokio::time::Instant::now() + FLUSH_INTERVAL);
            }
        }
    }
}

async fn flush_batch(transport: &Transport, queue: &mut VecDeque<Value>) {
    let count = queue.len().min(FLUSH_AT);
    if count == 0 {
        return;
    }
    let batch = queue.drain(..count).collect::<Vec<_>>();
    let payload = json!({
        "api_key": transport.write_key,
        "batch": &batch,
        "sent_at": match iso_timestamp() {
            Ok(timestamp) => timestamp,
            Err(error) => {
                eprintln!("[telemetry] failed to create batch timestamp: {error}");
                restore(queue, batch);
                return;
            }
        }
    });
    let mut delivered = false;
    for attempt in 0..3 {
        match transport
            .client
            .post(format!("{HOST}/batch/"))
            .timeout(HTTP_TIMEOUT)
            .json(&payload)
            .send()
            .await
        {
            Ok(response) if response.status().is_success() => {
                delivered = true;
                break;
            }
            Ok(response) => eprintln!(
                "[telemetry] PostHog batch rejected with status {}",
                response.status()
            ),
            Err(error) => eprintln!("[telemetry] PostHog batch failed: {error}"),
        }
        tokio::time::sleep(Duration::from_millis(100 * (attempt + 1))).await;
    }
    if !delivered {
        restore(queue, batch);
    }
}

fn restore(queue: &mut VecDeque<Value>, batch: Vec<Value>) {
    for message in batch.into_iter().rev() {
        queue.push_front(message);
    }
    while queue.len() > MAX_QUEUE_SIZE {
        queue.pop_front();
    }
}
