use serde_json::{Map, Value};

pub(crate) struct NotificationSettings {
    pub(crate) agent_task_complete: bool,
    pub(crate) custom_sound_path: Option<String>,
    pub(crate) enabled: bool,
    pub(crate) suppress_when_focused: bool,
    pub(crate) terminal_bell: bool,
    pub(crate) use_system_sound: bool,
}

impl NotificationSettings {
    pub(super) fn from_document(document: &Map<String, Value>) -> Self {
        let notifications = document.get("notifications").and_then(Value::as_object);
        let bool_value = |key, default| {
            notifications
                .and_then(|settings| settings.get(key))
                .and_then(Value::as_bool)
                .unwrap_or(default)
        };
        let custom_sound_id = notifications
            .and_then(|settings| settings.get("customSoundId"))
            .and_then(Value::as_str);
        let custom_sound_path = notifications
            .and_then(|settings| settings.get("customSoundPath"))
            .and_then(Value::as_str)
            .filter(|path| !path.is_empty());
        let effective_sound_id = custom_sound_id.unwrap_or(if custom_sound_path.is_some() {
            "custom"
        } else {
            "system"
        });
        Self {
            agent_task_complete: bool_value("agentTaskComplete", true),
            custom_sound_path: if effective_sound_id == "custom" {
                custom_sound_path.map(str::to_owned)
            } else {
                None
            },
            enabled: bool_value("enabled", true),
            suppress_when_focused: bool_value("suppressWhenFocused", true),
            terminal_bell: bool_value("terminalBell", false),
            use_system_sound: effective_sound_id == "system",
        }
    }
}
