use std::collections::HashSet;

use serde_json::{Map, Value, json};

use crate::notifications::{
    MobileNotificationEvent, NotificationAuthority, NotificationError, NotificationSoundAuthority,
};
use crate::settings::{NotificationSettings, SettingsAuthority};
use crate::shell_services::ShellServicesRegistry;

pub(in crate::rpc) mod input;
mod presentation;
pub(super) mod protocol;

use input::ReportInput;

// Why: the legacy `notifications.dismiss`/`notifications.report` JSON surface
// is retired; the protobuf `NotificationsService` mounts remain, with the same
// settings/cooldown/replay judgment living daemon-side.

const DISMISS_PATH: &str = "/notifications/dismiss";
const DISPLAY_PATH: &str = "/notifications/display";

#[derive(Clone)]
pub(super) struct NotificationsRpc {
    authority: NotificationAuthority,
    settings: SettingsAuthority,
    shells: ShellServicesRegistry,
    sounds: NotificationSoundAuthority,
}

impl NotificationsRpc {
    pub(super) fn new(
        authority: NotificationAuthority,
        settings: SettingsAuthority,
        shells: ShellServicesRegistry,
    ) -> Self {
        let sounds = NotificationSoundAuthority::new(settings.clone());
        Self {
            authority,
            settings,
            shells,
            sounds,
        }
    }

    pub(super) fn authority(&self) -> NotificationAuthority {
        self.authority.clone()
    }

    pub(super) fn sounds(&self) -> NotificationSoundAuthority {
        self.sounds.clone()
    }

    pub(in crate::rpc) async fn dismiss(
        &self,
        notification_ids: Vec<String>,
        shell_connection_id: Option<&str>,
    ) -> Result<u64, NotificationError> {
        let mut seen = HashSet::new();
        let unique_ids = notification_ids
            .into_iter()
            .filter(|id| !id.is_empty() && seen.insert(id.clone()))
            .collect::<Vec<_>>();
        for notification_id in &unique_ids {
            self.authority.dismiss(notification_id.clone()).await?;
        }
        let dismissed = if let Some(connection_id) = shell_connection_id {
            self.shells
                .request_web_exact(
                    connection_id,
                    DISMISS_PATH,
                    json!({ "notificationIds": unique_ids }),
                )
                .await
                .ok()
                .and_then(parse_dismissed)
                .unwrap_or(0)
        } else {
            0
        };
        Ok(dismissed)
    }

    pub(in crate::rpc) async fn report(
        &self,
        input: ReportInput,
        shell_connection_id: Option<&str>,
    ) -> Result<ReportOutcome, NotificationError> {
        let settings = self.settings.notification_settings();
        if !settings.enabled {
            return Ok(ReportOutcome {
                delivered: false,
                reason: Some("disabled".to_owned()),
            });
        }
        if matches!(
            input.source,
            crate::notifications::NotificationSource::AgentTaskComplete
        ) && !settings.agent_task_complete
            || matches!(
                input.source,
                crate::notifications::NotificationSource::TerminalBell
            ) && !settings.terminal_bell
        {
            return Ok(ReportOutcome {
                delivered: false,
                reason: Some("source-disabled".to_owned()),
            });
        }

        let presentation = presentation::build(&input);
        let cooldown_key = input
            .worktree_id
            .as_deref()
            .or(input.worktree_label.as_deref())
            .unwrap_or("global")
            .to_owned();
        if !matches!(input.source, crate::notifications::NotificationSource::Test)
            && self.authority.reserve_mobile_delivery(&cooldown_key)
        {
            let mobile_result = self
                .authority
                .dispatch(MobileNotificationEvent::Notification {
                    body: presentation.body.clone(),
                    notification_id: input.notification_id.clone(),
                    source: input.source,
                    title: presentation.title.clone(),
                    worktree_id: input.worktree_id.clone(),
                })
                .await;
            if let Err(error) = mobile_result {
                self.authority.rollback_mobile_delivery(&cooldown_key);
                return Err(error);
            }
        }

        let local_cooldown_key =
            if matches!(input.source, crate::notifications::NotificationSource::Test) {
                None
            } else if self.authority.reserve_local_delivery(&cooldown_key) {
                Some(cooldown_key)
            } else {
                return Ok(ReportOutcome {
                    delivered: false,
                    reason: Some("cooldown".to_owned()),
                });
            };
        let display = shell_connection_id.map(|connection_id| {
            (
                connection_id,
                display_request(&input, &presentation, &settings),
            )
        });
        let output = if let Some((connection_id, body)) = display {
            self.shells
                .request_web_exact(connection_id, DISPLAY_PATH, body)
                .await
                .ok()
                .and_then(parse_display_result)
        } else {
            None
        };
        let Some((delivered, reason)) = output else {
            if let Some(key) = local_cooldown_key.as_deref() {
                self.authority.rollback_local_delivery(key);
            }
            return Ok(ReportOutcome {
                delivered: false,
                reason: Some("shell-unavailable".to_owned()),
            });
        };
        if reason.as_deref() == Some("suppressed-focus")
            && let Some(key) = local_cooldown_key.as_deref()
        {
            self.authority.rollback_local_delivery(key);
        }
        Ok(ReportOutcome { delivered, reason })
    }
}

pub(in crate::rpc) struct ReportOutcome {
    pub(in crate::rpc) delivered: bool,
    pub(in crate::rpc) reason: Option<String>,
}

fn display_request(
    input: &ReportInput,
    presentation: &presentation::NotificationPresentation,
    settings: &NotificationSettings,
) -> Value {
    let mut body = Map::from_iter([
        (
            "source".to_owned(),
            Value::String(input.source.as_wire().to_owned()),
        ),
        (
            "title".to_owned(),
            Value::String(presentation.title.clone()),
        ),
        ("body".to_owned(), Value::String(presentation.body.clone())),
        (
            "useSystemSound".to_owned(),
            Value::Bool(settings.use_system_sound),
        ),
        (
            "suppressWhenFocused".to_owned(),
            Value::Bool(settings.suppress_when_focused && input.is_active_worktree == Some(true)),
        ),
    ]);
    insert_optional_string(
        &mut body,
        "notificationId",
        input.notification_id.as_deref(),
    );
    insert_optional_string(&mut body, "worktreeId", input.worktree_id.as_deref());
    insert_optional_string(&mut body, "paneKey", input.pane_key.as_deref());
    if let Some(value) = input.require_display_confirmation {
        body.insert("requireDisplayConfirmation".to_owned(), Value::Bool(value));
    }
    Value::Object(body)
}

fn insert_optional_string(body: &mut Map<String, Value>, key: &str, value: Option<&str>) {
    if let Some(value) = value {
        body.insert(key.to_owned(), Value::String(value.to_owned()));
    }
}

fn parse_display_result(value: Value) -> Option<(bool, Option<String>)> {
    let object = value.as_object()?;
    if object
        .keys()
        .any(|key| !matches!(key.as_str(), "delivered" | "reason"))
    {
        return None;
    }
    let delivered = object.get("delivered")?.as_bool()?;
    let reason = match object.get("reason") {
        None => None,
        Some(Value::String(reason))
            if matches!(
                reason.as_str(),
                "suppressed-focus" | "not-supported" | "not-displayed" | "blocked-by-system"
            ) =>
        {
            Some(reason.clone())
        }
        _ => return None,
    };
    Some((delivered, reason))
}

fn parse_dismissed(value: Value) -> Option<u64> {
    let object = value.as_object()?;
    (object.len() == 1)
        .then(|| object.get("dismissed").and_then(Value::as_u64))
        .flatten()
}
