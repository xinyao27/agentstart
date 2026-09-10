use serde_json::Value;

use crate::hosts::{HostFilesystem, HostFilesystemError};
use crate::repositories::ecmascript;

use super::model::{LayoutPane, LayoutRecipe};

const LAYOUT_CONFIG_FILE: &str = "agentstart.yaml";
const MAX_LAYOUT_CONFIG_BYTES: usize = 1024 * 1024;
const MAX_LAYOUT_PANES: usize = 12;
const MAX_LAYOUT_RECIPES: usize = 20;
const MAX_NAME_CODE_UNITS: usize = 128;
const MAX_TITLE_CODE_UNITS: usize = 128;
const MAX_COMMAND_CODE_UNITS: usize = 16_384;
const MAX_PROMPT_CODE_UNITS: usize = 128_000;

// Why: The layout agent set is restricted to supported launch providers.
const TUI_AGENT_IDS: &[&str] = &[
    "claude",
    "openclaude",
    "codex",
    "autohand",
    "opencode",
    "mimo-code",
    "pi",
    "omp",
    "gemini",
    "antigravity",
    "aider",
    "goose",
    "amp",
    "kilo",
    "kiro",
    "crush",
    "aug",
    "cline",
    "codebuff",
    "command-code",
    "continue",
    "cursor",
    "droid",
    "kimi",
    "mistral-vibe",
    "qwen-code",
    "rovo",
    "hermes",
    "openclaw",
    "copilot",
    "grok",
    "devin",
    "ante",
    "trae",
];

pub(crate) async fn read_layout_recipes(
    worktree_path: &str,
    filesystem: &HostFilesystem,
) -> Result<Vec<LayoutRecipe>, HostFilesystemError> {
    let path = filesystem
        .paths()
        .join(&[worktree_path, LAYOUT_CONFIG_FILE]);
    let Some(text) = filesystem.read_text(&path, MAX_LAYOUT_CONFIG_BYTES).await? else {
        return Ok(Vec::new());
    };
    Ok(parse_layout_recipes(&text))
}

// Why: One invalid layout rejects the document rather than silently discarding user entries.
fn parse_layout_recipes(text: &str) -> Vec<LayoutRecipe> {
    let Ok(document) = serde_saphyr::from_str::<Value>(text) else {
        return Vec::new();
    };
    let Some(layouts) = document
        .as_object()
        .and_then(|root| root.get("layouts"))
        .and_then(Value::as_object)
    else {
        return Vec::new();
    };
    let mut recipes = Vec::with_capacity(layouts.len());
    for (name, recipe) in layouts {
        match valid_recipe(name, recipe) {
            Some(recipe) => recipes.push(recipe),
            None => return Vec::new(),
        }
    }
    recipes.truncate(MAX_LAYOUT_RECIPES);
    recipes
}

fn valid_recipe(name: &str, value: &Value) -> Option<LayoutRecipe> {
    let name = valid_bounded(name, MAX_NAME_CODE_UNITS)?;
    let panes = value.as_object()?.get("panes")?.as_array()?;
    if panes.is_empty() || panes.len() > MAX_LAYOUT_PANES {
        return None;
    }
    let panes = panes.iter().map(valid_pane).collect::<Option<Vec<_>>>()?;
    Some(LayoutRecipe { name, panes })
}

fn valid_pane(value: &Value) -> Option<LayoutPane> {
    let object = value.as_object()?;
    let title = valid_bounded(object.get("title")?.as_str()?, MAX_TITLE_CODE_UNITS)?;
    match object.get("kind")?.as_str()? {
        "command" => {
            let command = valid_bounded(object.get("command")?.as_str()?, MAX_COMMAND_CODE_UNITS)?;
            Some(LayoutPane::Command { command, title })
        }
        "agent" => {
            let agent = object.get("agent")?.as_str()?;
            if !TUI_AGENT_IDS.contains(&agent) {
                return None;
            }
            let prompt = match object.get("prompt") {
                None => None,
                Some(value) => Some(valid_bounded(value.as_str()?, MAX_PROMPT_CODE_UNITS)?),
            };
            Some(LayoutPane::Agent {
                agent: agent.to_owned(),
                prompt,
                title,
            })
        }
        "shell" => Some(LayoutPane::Shell { title }),
        _ => None,
    }
}

fn valid_bounded(value: &str, max_code_units: usize) -> Option<String> {
    let trimmed = ecmascript::trim(value);
    (!trimmed.is_empty() && ecmascript::utf16_len(trimmed) <= max_code_units)
        .then(|| trimmed.to_owned())
}
