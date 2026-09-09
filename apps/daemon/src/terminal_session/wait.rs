use std::time::{Duration, SystemTime, UNIX_EPOCH};

use tokio::sync::broadcast;
use tokio::time::Instant;

use super::TerminalSessionError;
use super::authority::TerminalSessionAuthority;
use super::model::{TerminalWaitResult, WaitCondition};
use super::process::ProcessControl;
use super::terminal_title::{self, AgentStatus};
use super::wait_readiness;

const POLL_INTERVAL: Duration = Duration::from_secs(2);
const QUIESCENCE: Duration = Duration::from_secs(3);

struct WaitObservation {
    agent_status: Option<AgentStatus>,
    control: Option<ProcessControl>,
    exit_code: Option<i32>,
    last_output_at: Option<i64>,
    tail: String,
    title: Option<String>,
}

impl TerminalSessionAuthority {
    pub(crate) async fn wait(
        &self,
        handle: &str,
        condition: WaitCondition,
        timeout: Option<Duration>,
    ) -> Result<TerminalWaitResult, TerminalSessionError> {
        let mut events = self
            .state
            .with(handle, |record| record.stream_events.subscribe())
            .ok_or(TerminalSessionError::NotFound)?;
        let deadline = timeout.map(|timeout| Instant::now() + timeout);
        loop {
            if deadline.is_some_and(|deadline| Instant::now() >= deadline) {
                return Err(TerminalSessionError::WaitTimeout);
            }
            let observation = self
                .state
                .with(handle, |record| WaitObservation {
                    agent_status: record.agent_status,
                    control: record.control.clone(),
                    exit_code: record.process_exit_code,
                    last_output_at: record.last_output_at,
                    tail: record.tail.snapshot(),
                    title: record.title.clone(),
                })
                .ok_or(TerminalSessionError::NotFound)?;
            if let Some(result) = evaluate(
                handle,
                condition,
                &observation,
                self.is_quiet(&observation).await,
            ) {
                return Ok(result);
            }
            let wake = deadline
                .map(|deadline| deadline.min(Instant::now() + POLL_INTERVAL))
                .unwrap_or_else(|| Instant::now() + POLL_INTERVAL);
            tokio::select! {
                event = events.recv() => {
                    if matches!(event, Err(broadcast::error::RecvError::Closed)) {
                        return Err(TerminalSessionError::NotFound);
                    }
                }
                _ = tokio::time::sleep_until(wake) => {
                    if deadline.is_some_and(|deadline| Instant::now() >= deadline) {
                        return Err(TerminalSessionError::WaitTimeout);
                    }
                }
            }
        }
    }

    async fn is_quiet(&self, observation: &WaitObservation) -> bool {
        if observation.agent_status.is_some()
            || observation.last_output_at.is_none_or(|last_output| {
                epoch_millis().saturating_sub(last_output)
                    < i64::try_from(QUIESCENCE.as_millis()).unwrap_or(i64::MAX)
            })
        {
            return false;
        }
        let Some(control) = observation.control.as_ref() else {
            return false;
        };
        control
            .foreground_process()
            .await
            .is_some_and(|process| !is_shell_process(&process))
    }
}

fn evaluate(
    handle: &str,
    condition: WaitCondition,
    observation: &WaitObservation,
    is_quiet: bool,
) -> Option<TerminalWaitResult> {
    if let Some(exit_code) = observation.exit_code {
        return Some(result(
            handle,
            condition,
            true,
            "exited",
            Some(exit_code),
            None,
        ));
    }
    if condition == WaitCondition::Exit {
        return None;
    }
    if let Some(reason) = wait_readiness::blocked_reason(&observation.tail) {
        return Some(result(
            handle,
            condition,
            false,
            "running",
            None,
            Some(reason),
        ));
    }
    let title_idle = observation
        .title
        .as_deref()
        .is_some_and(terminal_title::explicit_idle);
    if observation.agent_status == Some(AgentStatus::Idle)
        || title_idle
        || wait_readiness::known_ready_prompt(&observation.tail)
        || is_quiet
    {
        return Some(result(handle, condition, true, "running", None, None));
    }
    None
}

fn result(
    handle: &str,
    condition: WaitCondition,
    satisfied: bool,
    status: &'static str,
    exit_code: Option<i32>,
    blocked_reason: Option<&'static str>,
) -> TerminalWaitResult {
    TerminalWaitResult {
        blocked_reason,
        condition: match condition {
            WaitCondition::Exit => "exit",
            WaitCondition::TuiIdle => "tui-idle",
        },
        exit_code,
        handle: handle.to_owned(),
        satisfied,
        status,
    }
}

fn is_shell_process(process: &str) -> bool {
    let normalized = process
        .trim()
        .trim_matches(['\'', '"'])
        .to_ascii_lowercase();
    let basename = normalized.rsplit(['/', '\\']).next().unwrap_or(&normalized);
    let basename = basename
        .strip_suffix(".exe")
        .or_else(|| basename.strip_suffix(".cmd"))
        .or_else(|| basename.strip_suffix(".bat"))
        .or_else(|| basename.strip_suffix(".ps1"))
        .unwrap_or(basename);
    matches!(
        basename,
        "bash" | "zsh" | "sh" | "fish" | "cmd" | "powershell" | "pwsh" | "nu"
    )
}

fn epoch_millis() -> i64 {
    SystemTime::now()
        .duration_since(UNIX_EPOCH)
        .map(|duration| i64::try_from(duration.as_millis()).unwrap_or(i64::MAX))
        .unwrap_or(0)
}
