use std::env;
use std::path::PathBuf;
use std::process::Stdio;
use std::time::Duration;

use serde_json::Value;
use tokio::process::Command;
use tokio::time::timeout;

use super::EmulatorError;

const EXEC_TIMEOUT: Duration = Duration::from_secs(90);

#[derive(Clone)]
pub(super) struct ServeSim {
    command: PathBuf,
    prefix: Vec<String>,
}

impl ServeSim {
    pub(super) fn resolve() -> Self {
        if let Some(path) = env::var_os("AGENTSTART_SERVE_SIM_PATH") {
            return Self {
                command: PathBuf::from(path),
                prefix: Vec::new(),
            };
        }
        if let Ok(executable) = env::current_exe()
            && let Some(directory) = executable.parent()
        {
            let bundled = directory
                .join("..")
                .join("Resources")
                .join("serve-sim")
                .join("dist")
                .join("serve-sim.js");
            if bundled.is_file() {
                return Self {
                    command: PathBuf::from("bun"),
                    prefix: vec![bundled.to_string_lossy().into_owned()],
                };
            }
        }
        Self {
            command: PathBuf::from("serve-sim"),
            prefix: Vec::new(),
        }
    }

    pub(super) async fn check(&self) -> Result<(), EmulatorError> {
        self.run(&["--help".to_owned()], false, Duration::from_secs(10))
            .await
            .map(|_| ())
    }

    pub(super) async fn list(&self) -> Result<Value, EmulatorError> {
        self.run(&["--list".to_owned(), "-q".to_owned()], true, EXEC_TIMEOUT)
            .await
    }

    pub(super) async fn action(&self, args: Vec<String>) -> Result<Value, EmulatorError> {
        self.run(&args, false, EXEC_TIMEOUT).await
    }

    pub(super) async fn exec(&self, mut args: Vec<String>) -> Result<Value, EmulatorError> {
        if !args
            .iter()
            .any(|arg| matches!(arg.as_str(), "-q" | "--quiet"))
        {
            args.push("-q".to_owned());
        }
        self.run(&args, true, EXEC_TIMEOUT).await
    }

    pub(super) async fn start(&self, udid: &str) -> Result<Value, EmulatorError> {
        self.run(
            &["--detach".to_owned(), "-q".to_owned(), udid.to_owned()],
            true,
            EXEC_TIMEOUT,
        )
        .await
    }

    pub(super) async fn kill(&self, udid: &str) {
        let _ = self
            .run(
                &["--kill".to_owned(), "-q".to_owned(), udid.to_owned()],
                false,
                EXEC_TIMEOUT,
            )
            .await;
    }

    async fn run(
        &self,
        args: &[String],
        json_output: bool,
        duration: Duration,
    ) -> Result<Value, EmulatorError> {
        let mut command = Command::new(&self.command);
        command
            .args(&self.prefix)
            .args(args)
            .stdin(Stdio::null())
            .kill_on_drop(true);
        let output = timeout(duration, command.output())
            .await
            .map_err(|_| EmulatorError::domain("emulator_error", "serve-sim command timed out"))?
            .map_err(|error| helper_error(error.to_string()))?;
        if !output.status.success() {
            let stderr = String::from_utf8_lossy(&output.stderr);
            let stdout = String::from_utf8_lossy(&output.stdout);
            let message = if stdout.trim().is_empty() {
                stderr.trim()
            } else {
                stdout.trim()
            };
            if message.to_ascii_lowercase().contains("not running")
                || message.to_ascii_lowercase().contains("no serve-sim server")
            {
                return Err(EmulatorError::domain(
                    "emulator_no_active",
                    "No active emulator for this worktree — use agentstart emulator list/attach or open the pane",
                ));
            }
            return Err(helper_error(if message.is_empty() {
                format!("serve-sim failed: {}", output.status)
            } else {
                message.to_owned()
            }));
        }
        let stdout = String::from_utf8_lossy(&output.stdout).trim().to_owned();
        if json_output {
            Ok(serde_json::from_str(&stdout).unwrap_or(Value::String(stdout)))
        } else {
            Ok(Value::String(stdout))
        }
    }
}

pub(super) fn parse_command(input: &str) -> Vec<String> {
    let mut args = Vec::new();
    let mut current = String::new();
    let mut in_double = false;
    let mut in_single = false;
    for character in input.chars() {
        match character {
            '"' if !in_single => in_double = !in_double,
            '\'' if !in_double => in_single = !in_single,
            ' ' if !in_double && !in_single => {
                if !current.is_empty() {
                    args.push(std::mem::take(&mut current));
                }
            }
            _ => current.push(character),
        }
    }
    if !current.is_empty() {
        args.push(current);
    }
    args
}

pub(super) fn strip_target_args(args: Vec<String>) -> Vec<String> {
    let mut stripped = Vec::new();
    let mut iterator = args.into_iter();
    while let Some(arg) = iterator.next() {
        if matches!(
            arg.as_str(),
            "--device" | "-d" | "--emulator" | "--worktree"
        ) {
            let _ = iterator.next();
        } else if !["--device=", "-d=", "--emulator=", "--worktree="]
            .iter()
            .any(|prefix| arg.starts_with(prefix))
        {
            stripped.push(arg);
        }
    }
    stripped
}

fn helper_error(message: impl Into<String>) -> EmulatorError {
    EmulatorError::domain("emulator_helper_failed", message)
}
