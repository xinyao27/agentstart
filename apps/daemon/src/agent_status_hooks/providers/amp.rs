use std::fs;

use super::{ProviderContext, ProviderResult};
use crate::agent_status_hooks::storage;

const MARKER: &str = "Managed by AgentStart. Do not edit; changes may be overwritten.";
const PLUGIN: &str = include_str!("../assets/amp-plugin.ts");

pub(super) fn apply(context: &ProviderContext, enabled: bool) -> ProviderResult {
    let path = context
        .home_path
        .join(".config")
        .join("amp")
        .join("plugins")
        .join("agentstart-agent-status.ts");
    let current = match fs::read_to_string(&path) {
        Ok(content) => Some(content),
        Err(error) if error.kind() == std::io::ErrorKind::NotFound => None,
        Err(error) => return Err(error.into()),
    };
    if current
        .as_deref()
        .is_some_and(|content| !content.contains(MARKER))
    {
        return Err(std::io::Error::new(
            std::io::ErrorKind::AlreadyExists,
            format!(
                "refusing to overwrite unmanaged Amp plugin {}",
                path.display()
            ),
        )
        .into());
    }
    if enabled {
        storage::write_text(&path, PLUGIN)
    } else if current.is_some() {
        storage::remove_file(&path)
    } else {
        Ok(())
    }
}
