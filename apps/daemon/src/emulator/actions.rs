use futures_util::SinkExt;
use serde_json::Value;
use tokio::time::{Duration, sleep};
use tokio_tungstenite::tungstenite::Message;

use super::serve_sim::{parse_command, strip_target_args};
use super::{EmulatorAuthority, EmulatorError};

/// A single gesture sample already validated against the wire's normalized
/// (0.0..=1.0) coordinate space and point-kind vocabulary.
pub(crate) struct GesturePoint {
    pub(crate) x: f64,
    pub(crate) y: f64,
    pub(crate) kind: GesturePointKind,
    pub(crate) edge: Option<u32>,
}

pub(crate) enum GesturePointKind {
    Begin,
    Move,
    End,
}

impl GesturePointKind {
    fn as_str(&self) -> &'static str {
        match self {
            Self::Begin => "begin",
            Self::Move => "move",
            Self::End => "end",
        }
    }
}

impl EmulatorAuthority {
    pub(crate) async fn text_action(
        &self,
        action: &str,
        value: &str,
        device: Option<&str>,
        worktree: Option<&str>,
    ) -> Result<(), EmulatorError> {
        let udid = self.resolve_target(device, worktree).await?;
        self.serve_sim
            .action(vec![
                action.to_owned(),
                value.to_owned(),
                "-d".to_owned(),
                udid,
            ])
            .await?;
        Ok(())
    }

    pub(crate) async fn exec(
        &self,
        command: &str,
        device: Option<&str>,
        worktree: Option<&str>,
    ) -> Result<Value, EmulatorError> {
        let mut args = strip_target_args(parse_command(command.trim()));
        let udid = self.resolve_target(device, worktree).await?;
        args.extend(["-d".to_owned(), udid]);
        self.serve_sim.exec(args).await
    }

    pub(crate) async fn gesture(
        &self,
        points: &[GesturePoint],
        device: Option<&str>,
        worktree: Option<&str>,
    ) -> Result<(), EmulatorError> {
        if !(2..=64).contains(&points.len()) {
            return Err(EmulatorError::domain(
                "emulator_error",
                "Gesture requires 2 to 64 points",
            ));
        }
        for point in points {
            validate_point(point)?;
        }
        let udid = self.resolve_target(device, worktree).await?;
        let ws_url = self
            .state
            .lock()
            .await
            .sessions
            .get(&udid)
            .map(|session| session.ws_url.clone())
            .ok_or_else(|| {
                EmulatorError::domain(
                    "emulator_no_active",
                    "No active emulator stream for gesture input",
                )
            })?;
        let (mut socket, _) = tokio_tungstenite::connect_async(&ws_url)
            .await
            .map_err(|_| {
                EmulatorError::domain(
                    "emulator_error",
                    "Could not connect to the emulator gesture stream",
                )
            })?;
        for point in points {
            let mut frame = vec![0x03];
            frame.extend(
                serde_json::to_vec(&point_json(point))
                    .map_err(|error| EmulatorError::domain("emulator_error", error.to_string()))?,
            );
            socket
                .send(Message::Binary(frame.into()))
                .await
                .map_err(|error| EmulatorError::domain("emulator_error", error.to_string()))?;
            sleep(Duration::from_millis(16)).await;
        }
        sleep(Duration::from_millis(50)).await;
        socket
            .close(None)
            .await
            .map_err(|error| EmulatorError::domain("emulator_error", error.to_string()))
    }
}

fn point_json(point: &GesturePoint) -> Value {
    let mut object = serde_json::Map::new();
    object.insert("x".to_owned(), Value::from(point.x));
    object.insert("y".to_owned(), Value::from(point.y));
    object.insert("type".to_owned(), Value::from(point.kind.as_str()));
    if let Some(edge) = point.edge {
        object.insert("edge".to_owned(), Value::from(edge));
    }
    Value::Object(object)
}

fn validate_point(point: &GesturePoint) -> Result<(), EmulatorError> {
    normalized(point.x)?;
    normalized(point.y)?;
    if point.edge.is_some_and(|edge| edge > 4) {
        return Err(EmulatorError::domain(
            "emulator_error",
            "Invalid gesture edge",
        ));
    }
    Ok(())
}

fn normalized(value: f64) -> Result<(), EmulatorError> {
    if value.is_finite() && (0.0..=1.0).contains(&value) {
        Ok(())
    } else {
        Err(EmulatorError::domain(
            "emulator_error",
            "Invalid coordinate",
        ))
    }
}
