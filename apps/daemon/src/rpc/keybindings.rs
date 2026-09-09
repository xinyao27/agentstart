pub(super) mod protocol;
pub(super) mod protocol_values;

use crate::keybindings::{KeybindingFileSnapshot, KeybindingsAuthority, KeybindingsError};
use crate::shell_events::ShellEventAuthority;

#[derive(Clone)]
pub(super) struct KeybindingsRpc {
    authority: KeybindingsAuthority,
    events: ShellEventAuthority,
}

impl KeybindingsRpc {
    pub(super) fn new(authority: KeybindingsAuthority, events: ShellEventAuthority) -> Self {
        Self { authority, events }
    }

    // Why these typed wrappers exist beside the authority: the ensure/reload/
    // mutation publish side effect is part of the protobuf surface's contract,
    // so every mutating handler must route through one place or the wire
    // snapshot and the `keybindingsChanged` shell event could disagree about
    // when the file changed.
    pub(super) async fn get_snapshot(&self) -> Result<KeybindingFileSnapshot, KeybindingsError> {
        self.authority.get().await
    }

    pub(super) async fn ensure_file(&self) -> Result<KeybindingFileSnapshot, KeybindingsError> {
        let snapshot = self.authority.ensure_file().await?;
        self.events.publish_keybindings_changed(snapshot.clone());
        Ok(snapshot)
    }

    pub(super) async fn reload(&self) -> Result<KeybindingFileSnapshot, KeybindingsError> {
        let snapshot = self.authority.reload().await?;
        self.events.publish_keybindings_changed(snapshot.clone());
        Ok(snapshot)
    }

    pub(super) async fn open_file(&self) -> Result<KeybindingFileSnapshot, KeybindingsError> {
        self.authority.open_file(false).await
    }

    pub(super) async fn reveal_file(&self) -> Result<KeybindingFileSnapshot, KeybindingsError> {
        self.authority.open_file(true).await
    }

    pub(super) async fn set_action(
        &self,
        action_id: String,
        bindings: Option<Vec<String>>,
    ) -> Result<KeybindingFileSnapshot, KeybindingsError> {
        let snapshot = self.authority.set_action(action_id, bindings).await?;
        self.events.publish_keybindings_changed(snapshot.clone());
        Ok(snapshot)
    }
}
