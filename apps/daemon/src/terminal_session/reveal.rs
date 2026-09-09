use serde_json::{Value, json};

use crate::shell_services::ShellServicesRegistry;

use super::model::{TerminalCreateRequest, TerminalPresentation};

const REVEAL_PATH: &str = "/terminal/reveal";

pub(super) struct TerminalReveal<'a> {
    pub(super) cwd: Option<String>,
    pub(super) handle: &'a str,
    pub(super) leaf_id: &'a str,
    pub(super) pty_id: &'a str,
    pub(super) tab_id: &'a str,
    pub(super) title: Option<&'a str>,
    pub(super) worktree_id: &'a str,
}

pub(super) enum TerminalRevealResult {
    Background,
    Failed(String),
    Visible,
}

impl TerminalRevealResult {
    pub(super) fn is_visible(&self) -> bool {
        matches!(self, Self::Visible)
    }

    pub(super) fn warning(&self, handle: &str) -> Option<String> {
        let Self::Failed(reason) = self else {
            return None;
        };
        Some(format!(
            "Terminal {handle} is running, but Yiru could not make it discoverable. Reason: {reason}. Run `yiru terminal focus --terminal {handle}` to reveal and focus it."
        ))
    }
}

pub(super) async fn terminal(
    shells: &ShellServicesRegistry,
    request: &TerminalCreateRequest,
    reveal: TerminalReveal<'_>,
) -> TerminalRevealResult {
    let presentation = presentation(request);
    if !request.renderer_backed
        && request.worktree.is_some()
        && !matches!(
            presentation,
            Some(TerminalPresentation::Focused | TerminalPresentation::Visible)
        )
    {
        return TerminalRevealResult::Background;
    }
    let mut body = json!({
        "worktreeId": reveal.worktree_id,
        "ptyId": format!("runtime:{}", reveal.handle),
        "durablePtyId": reveal.pty_id,
        "title": reveal.title,
        "activate": presentation == Some(TerminalPresentation::Focused),
        "tabId": reveal.tab_id,
        "leafId": reveal.leaf_id,
        "source": "runtime-session"
    });
    let Some(body) = body.as_object_mut() else {
        return TerminalRevealResult::Failed("terminal reveal request is invalid".to_owned());
    };
    if let Some(cwd) = reveal.cwd {
        body.insert("cwd".to_owned(), Value::String(cwd));
    }
    if let Some(presentation) = presentation {
        body.insert(
            "presentation".to_owned(),
            Value::String(
                match presentation {
                    TerminalPresentation::Background => "background",
                    TerminalPresentation::Focused => "focused",
                    TerminalPresentation::Visible => "visible",
                }
                .to_owned(),
            ),
        );
    }
    if let Some(token) = &request.launch_token {
        body.insert("launchToken".to_owned(), Value::String(token.clone()));
    }
    if let Some(agent) = &request.launch_agent {
        body.insert("launchAgent".to_owned(), Value::String(agent.clone()));
    }
    if let Some(source) = &request.split_from_leaf_id {
        body.insert("splitFromLeafId".to_owned(), Value::String(source.clone()));
    }
    if let Some(direction) = request.split_direction {
        body.insert(
            "splitDirection".to_owned(),
            Value::String(direction.to_owned()),
        );
    }
    if let Some(source) = &request.split_telemetry_source {
        body.insert(
            "splitTelemetrySource".to_owned(),
            Value::String(source.clone()),
        );
    }
    if let Some(config) = &request.launch_config {
        let mut agent_env = serde_json::Map::new();
        for (name, value) in &config.agent_env {
            agent_env.insert(name.clone(), Value::String(value.clone()));
        }
        let mut launch_config = serde_json::Map::from_iter([
            (
                "agentArgs".to_owned(),
                Value::String(config.agent_args.clone()),
            ),
            ("agentEnv".to_owned(), Value::Object(agent_env)),
        ]);
        if let Some(command) = &config.agent_command {
            launch_config.insert("agentCommand".to_owned(), Value::String(command.clone()));
        }
        if let Some(path) = &config.omp_resume_file_path {
            launch_config.insert("ompResumeFilePath".to_owned(), Value::String(path.clone()));
        }
        body.insert("launchConfig".to_owned(), Value::Object(launch_config));
    }
    match shells
        .request_web(None, REVEAL_PATH, Value::Object(body.clone()))
        .await
    {
        Ok(response) if valid_response(&response) => TerminalRevealResult::Visible,
        Ok(_) => TerminalRevealResult::Failed(
            "shell-services reverse-link response is invalid".to_owned(),
        ),
        Err(error) => TerminalRevealResult::Failed(error.to_string()),
    }
}

fn presentation(request: &TerminalCreateRequest) -> Option<TerminalPresentation> {
    request
        .presentation
        .or_else(|| (request.focus || request.activate).then_some(TerminalPresentation::Focused))
}

fn valid_response(response: &Value) -> bool {
    let Some(response) = response.as_object() else {
        return false;
    };
    response
        .get("tabId")
        .and_then(Value::as_str)
        .is_some_and(|tab_id| !tab_id.is_empty())
        && response
            .get("title")
            .is_none_or(|title| title.is_null() || title.is_string())
}
