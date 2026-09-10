use std::sync::Arc;
use std::time::Duration;

use regex::Regex;

use super::TerminalSessionError;
use super::authority::TerminalSessionAuthority;
use super::model::{
    TerminalClientType, TerminalSendInputKind, TerminalSendRequest, TerminalSendResult,
};
use super::process::ProcessControl;
use super::state::{TerminalDriver, TerminalState};
use super::terminal_title::AgentStatus;

const INPUT_CHUNK_BYTES: usize = 16 * 1_024;
const MAX_INPUT_BYTES: usize = 16 * 1_024 * 1_024;

struct InputLease {
    handle: String,
    reservation: u64,
    state: Arc<TerminalState>,
}

impl Drop for InputLease {
    fn drop(&mut self) {
        self.state.release_input(&self.handle, self.reservation);
    }
}

enum SendAdmission {
    Accepted {
        control: ProcessControl,
        lease: InputLease,
    },
    Refused(Option<&'static str>),
}

impl TerminalSessionAuthority {
    pub(crate) async fn send_guarded(
        &self,
        request: TerminalSendRequest,
        principal_id: &str,
    ) -> Result<TerminalSendResult, TerminalSessionError> {
        validate_query_reply(&request, principal_id)?;
        let has_text = request.text.as_ref().is_some_and(|text| !text.is_empty());
        let has_suffix = request.enter || request.interrupt;
        if !has_text && !has_suffix {
            return Err(TerminalSessionError::InvalidInput("empty terminal input"));
        }
        if request.require_agent_sendable && has_text && has_suffix {
            return Ok(refused(request.terminal, None));
        }
        if request.input_kind != Some(TerminalSendInputKind::QueryReply)
            && let Some(client) = &request.client
            && client.kind == TerminalClientType::Mobile
            && !self
                .take_mobile_input_floor(&request.terminal, &client.id)
                .await?
        {
            return Err(TerminalSessionError::NotWritable);
        }
        if request.claim_viewport
            && let (Some(client), Some(viewport)) = (&request.client, request.viewport)
            && client.kind == TerminalClientType::Desktop
        {
            let (_, applied) = self
                .update_viewport(
                    &request.terminal,
                    client.clone(),
                    viewport.cols,
                    viewport.rows,
                    true,
                )
                .await?;
            if !applied {
                return Ok(refused(request.terminal, None));
            }
        }
        let admission = self.admit_send(&request)?;
        let SendAdmission::Accepted { control, lease } = admission else {
            let SendAdmission::Refused(reason) = admission else {
                return Err(TerminalSessionError::NotWritable);
            };
            return Ok(refused(request.terminal, reason));
        };
        let text = request.text.as_deref().unwrap_or_default();
        let mut bytes_written = 0;
        for chunk in text.as_bytes().chunks(INPUT_CHUNK_BYTES) {
            self.assert_send_guard(&request.terminal, lease.reservation, &request)?;
            control.write(chunk.to_vec(), Vec::new(), false).await?;
            bytes_written += chunk.len();
            tokio::task::yield_now().await;
        }
        let mut suffix = Vec::with_capacity(2);
        if request.enter {
            suffix.push(b'\r');
        }
        if request.interrupt {
            suffix.push(3);
        }
        if !text.is_empty() && !suffix.is_empty() {
            tokio::time::sleep(Duration::from_millis(500)).await;
        }
        if !suffix.is_empty() {
            self.assert_send_guard(&request.terminal, lease.reservation, &request)?;
            bytes_written += suffix.len();
            control.write(suffix, Vec::new(), false).await?;
        }
        drop(lease);
        Ok(TerminalSendResult {
            accepted: true,
            bytes_written,
            handle: request.terminal,
            refused_reason: None,
        })
    }

    fn admit_send(
        &self,
        request: &TerminalSendRequest,
    ) -> Result<SendAdmission, TerminalSessionError> {
        self.state
            .with_mut(&request.terminal, |record| {
                if record.process_exit_code.is_some() || record.control.is_none() {
                    return Err(TerminalSessionError::NotFound);
                }
                if request.input_kind == Some(TerminalSendInputKind::QueryReply) {
                    let authorized = request.client.as_ref().is_some_and(|client| {
                        record.query_reply_client.as_deref() == Some(client.id.as_str())
                    });
                    if !authorized {
                        return Ok(SendAdmission::Refused(None));
                    }
                }
                if let Some(client) = &request.client
                    && client.kind != TerminalClientType::Mobile
                    && matches!(record.driver, TerminalDriver::Mobile(_))
                {
                    return Ok(SendAdmission::Refused(None));
                }
                if request.require_agent_sendable {
                    if !record.has_agent {
                        return Ok(SendAdmission::Refused(Some("no-agent")));
                    }
                    if record.agent_status == Some(AgentStatus::Permission) {
                        return Ok(SendAdmission::Refused(Some("permission")));
                    }
                }
                if record.input_reservation.is_some() {
                    return Err(TerminalSessionError::NotWritable);
                }
                record.input_revision = record.input_revision.saturating_add(1);
                let reservation = record.input_revision;
                record.input_reservation = Some(reservation);
                Ok(SendAdmission::Accepted {
                    control: record
                        .control
                        .clone()
                        .ok_or(TerminalSessionError::NotFound)?,
                    lease: InputLease {
                        handle: request.terminal.clone(),
                        reservation,
                        state: self.state.clone(),
                    },
                })
            })
            .ok_or(TerminalSessionError::NotFound)?
    }

    fn assert_send_guard(
        &self,
        handle: &str,
        reservation: u64,
        request: &TerminalSendRequest,
    ) -> Result<(), TerminalSessionError> {
        self.state
            .with(handle, |record| {
                if record.process_exit_code.is_some() || record.control.is_none() {
                    return Err(TerminalSessionError::NotFound);
                }
                if record.input_reservation != Some(reservation) {
                    return Err(TerminalSessionError::NotWritable);
                }
                if request.require_agent_sendable {
                    if !record.has_agent {
                        return Err(TerminalSessionError::NotWritable);
                    }
                    if record.agent_status == Some(AgentStatus::Permission) {
                        return Err(TerminalSessionError::NotWritable);
                    }
                }
                Ok(())
            })
            .ok_or(TerminalSessionError::NotFound)?
    }
}

fn refused(handle: String, reason: Option<&'static str>) -> TerminalSendResult {
    TerminalSendResult {
        accepted: false,
        bytes_written: 0,
        handle,
        refused_reason: reason,
    }
}

fn validate_query_reply(
    request: &TerminalSendRequest,
    principal_id: &str,
) -> Result<(), TerminalSessionError> {
    if request.input_kind != Some(TerminalSendInputKind::QueryReply) {
        if request
            .text
            .as_ref()
            .is_some_and(|text| text.len() > MAX_INPUT_BYTES)
        {
            return Err(TerminalSessionError::InvalidInput("terminal input size"));
        }
        return Ok(());
    }
    let valid = request.text.as_deref().is_some_and(is_terminal_query_reply)
        && !request.enter
        && !request.interrupt
        && !request.require_agent_sendable
        && request.client.as_ref().is_some_and(|client| {
            client.kind == TerminalClientType::Mobile && client.id == principal_id
        });
    if !valid {
        return Err(TerminalSessionError::InvalidInput(
            "invalid terminal query reply",
        ));
    }
    Ok(())
}

fn is_terminal_query_reply(value: &str) -> bool {
    static PATTERNS: std::sync::LazyLock<Vec<Regex>> = std::sync::LazyLock::new(|| {
        [
            r"^\x1b\[\??[0-9;]*[Rn]$",
            r"^\x1b\[[?>=]?[0-9;]*c$",
            r"^\x1b\[[468];[0-9]+;[0-9]+t$",
            r"^\x1b\[\??[0-9;]*\$y$",
            r"^\x1b\[\?[0-9]+u$",
            r"^\x1b\][0-9]+;[^\x07\x1b]*(?:\x07|\x1b\\)$",
            r"^\x1bP(?:[01]\$r[^\x1b]*|>\|[^\x1b]*)\x1b\\$",
        ]
        .into_iter()
        .filter_map(|pattern| Regex::new(pattern).ok())
        .collect()
    });
    value.len() >= 3
        && value.as_bytes().first() == Some(&0x1b)
        && PATTERNS.iter().any(|pattern| pattern.is_match(value))
}
