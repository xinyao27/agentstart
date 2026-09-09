use serde_json::Value;
use tokio::sync::broadcast::error::RecvError;
use yiru_protocol::protocol::v1::Status;
use yiru_protocol::runtime::v1::driver_events_service_event::Event;
use yiru_protocol::runtime::v1::driver_events_terminal_driver;
use yiru_protocol::runtime::v1::{
    DriverEventsFitOverrideMode, DriverEventsServiceEvent, DriverEventsServiceSubscribeRequest,
    DriverEventsSubscribeReady, DriverEventsTerminalDriver, DriverEventsTerminalDriverChanged,
    DriverEventsTerminalFitOverrideChanged,
};
use yiru_protocol::transport::{decode, encode};

use crate::rpc::protocol_call::ProtocolCallContext;
use crate::rpc::terminal::TerminalRpc;

use super::subscription_id;

pub(in crate::rpc) async fn subscribe(
    terminal: &TerminalRpc,
    payload: &[u8],
    connection_id: &str,
    context: &ProtocolCallContext,
) -> Result<(), Status> {
    decode::<DriverEventsServiceSubscribeRequest>(payload)?;
    let mut receiver = terminal.subscribe_driver_events();
    let ready = DriverEventsServiceEvent {
        event: Some(Event::Ready(DriverEventsSubscribeReady {
            subscription_id: subscription_id(connection_id),
        })),
    };
    context.send_stream_payload(encode(&ready)).await?;
    loop {
        match receiver.recv().await {
            Ok(value) => {
                if let Some(event) = event(&value) {
                    context.send_stream_payload(encode(&event)).await?;
                }
            }
            Err(RecvError::Lagged(_)) => continue,
            Err(RecvError::Closed) => break,
        }
    }
    let end = DriverEventsServiceEvent {
        event: Some(Event::End(true)),
    };
    context.send_stream_payload(encode(&end)).await
}

// Why: the driver channel carries `serde_json::Value` events published by the
// terminal viewport; the event vocabulary is the closed pair emitted there,
// so anything else is not a driver event and is skipped.
fn event(value: &Value) -> Option<DriverEventsServiceEvent> {
    let object = value.as_object()?;
    match object.get("type")?.as_str()? {
        "terminalDriverChanged" => {
            let driver = object.get("driver")?.as_object()?;
            let driver = match driver.get("kind")?.as_str()? {
                "idle" => DriverEventsTerminalDriver {
                    state: Some(driver_events_terminal_driver::State::Idle(true)),
                },
                "desktop" => DriverEventsTerminalDriver {
                    state: Some(driver_events_terminal_driver::State::Desktop(true)),
                },
                "mobile" => DriverEventsTerminalDriver {
                    state: Some(driver_events_terminal_driver::State::MobileClientId(text(
                        driver, "clientId",
                    ))),
                },
                _ => return None,
            };
            Some(DriverEventsServiceEvent {
                event: Some(Event::TerminalDriverChanged(
                    DriverEventsTerminalDriverChanged {
                        pty_id: text(object, "ptyId"),
                        driver: Some(driver),
                    },
                )),
            })
        }
        "terminalFitOverrideChanged" => {
            let mode = match text(object, "mode").as_str() {
                "mobile-fit" => DriverEventsFitOverrideMode::MobileFit,
                "desktop-fit" => DriverEventsFitOverrideMode::DesktopFit,
                _ => return None,
            };
            Some(DriverEventsServiceEvent {
                event: Some(Event::TerminalFitOverrideChanged(
                    DriverEventsTerminalFitOverrideChanged {
                        pty_id: text(object, "ptyId"),
                        mode: mode as i32,
                        cols: u32::try_from(object.get("cols")?.as_u64()?).ok()?,
                        rows: u32::try_from(object.get("rows")?.as_u64()?).ok()?,
                    },
                )),
            })
        }
        _ => None,
    }
}

fn text(object: &serde_json::Map<String, Value>, key: &str) -> String {
    object
        .get(key)
        .and_then(Value::as_str)
        .unwrap_or_default()
        .to_owned()
}
