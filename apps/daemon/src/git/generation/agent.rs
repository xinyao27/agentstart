use super::GenerationParams;
use super::text::is_ecmascript_whitespace;

pub(super) struct AgentPlan {
    pub(super) args: Vec<String>,
    pub(super) binary: String,
    pub(super) label: String,
    pub(super) stdin: Option<Vec<u8>>,
}

pub(super) struct AgentSpec {
    pub(super) binary: &'static str,
    pub(super) default_model: &'static str,
    pub(super) dynamic: bool,
    pub(super) id: &'static str,
    pub(super) label: &'static str,
    pub(super) models: &'static [(&'static str, &'static str)],
    pub(super) prompt_in_argv: bool,
}

const CLAUDE_MODELS: &[(&str, &str)] =
    &[("haiku", "Haiku"), ("sonnet", "Sonnet"), ("opus", "Opus")];
const CODEX_MODELS: &[(&str, &str)] = &[
    ("gpt-5.5", "GPT-5.5"),
    ("gpt-5.4", "GPT-5.4"),
    ("gpt-5.4-mini", "GPT-5.4 Mini"),
    ("gpt-5.3-codex", "GPT-5.3 Codex"),
    ("gpt-5.3-codex-spark", "GPT-5.3 Codex Spark"),
    ("gpt-5.2", "GPT-5.2"),
];
const OPENCODE_MODELS: &[(&str, &str)] = &[
    (
        "opencode/deepseek-v4-flash-free",
        "OpenCode DeepSeek V4 Flash Free",
    ),
    ("opencode/gpt-5.4-mini", "OpenCode GPT 5.4 Mini"),
];
const PI_MODELS: &[(&str, &str)] =
    &[("github-copilot/gpt-5.4-mini", "Github Copilot GPT 5.4 Mini")];
const AMP_MODELS: &[(&str, &str)] = &[
    ("smart", "Smart"),
    ("rush", "Rush"),
    ("large", "Large"),
    ("deep", "Deep"),
];
const CURSOR_MODELS: &[(&str, &str)] = &[("auto", "Auto")];
const KIMI_MODELS: &[(&str, &str)] = &[
    ("default", "Config default"),
    ("kimi-code/kimi-for-coding", "Kimi K2.6"),
];
const COPILOT_MODELS: &[(&str, &str)] = &[
    ("auto", "Auto"),
    ("claude-haiku-4.5", "Claude Haiku 4.5"),
    ("claude-sonnet-4.5", "Claude Sonnet 4.5"),
    ("claude-sonnet-4.6", "Claude Sonnet 4.6"),
    ("claude-opus-4.5", "Claude Opus 4.5"),
    ("claude-opus-4.6", "Claude Opus 4.6"),
    ("claude-opus-4.6-fast", "Claude Opus 4.6 Fast"),
    ("claude-opus-4.7", "Claude Opus 4.7"),
    ("gpt-4.1", "GPT-4.1"),
    ("gpt-5-mini", "GPT-5 Mini"),
    ("gpt-5.2", "GPT-5.2"),
    ("gpt-5.2-codex", "GPT-5.2 Codex"),
    ("gpt-5.3-codex", "GPT-5.3 Codex"),
    ("gpt-5.4", "GPT-5.4"),
    ("gpt-5.4-mini", "GPT-5.4 Mini"),
    ("gpt-5.5", "GPT-5.5"),
];
const ANTIGRAVITY_MODELS: &[(&str, &str)] = &[
    ("Gemini 3.5 Flash (Medium)", "Gemini 3.5 Flash (Medium)"),
    ("Gemini 3.5 Flash (High)", "Gemini 3.5 Flash (High)"),
    ("Gemini 3.5 Flash (Low)", "Gemini 3.5 Flash (Low)"),
];

pub(super) fn spec(id: &str) -> Option<AgentSpec> {
    Some(match id {
        "claude" => AgentSpec {
            id: "claude",
            label: "Claude",
            binary: "claude",
            prompt_in_argv: false,
            dynamic: false,
            models: CLAUDE_MODELS,
            default_model: "sonnet",
        },
        "codex" => AgentSpec {
            id: "codex",
            label: "Codex",
            binary: "codex",
            prompt_in_argv: false,
            dynamic: true,
            models: CODEX_MODELS,
            default_model: "gpt-5.5",
        },
        "opencode" => AgentSpec {
            id: "opencode",
            label: "OpenCode",
            binary: "opencode",
            prompt_in_argv: false,
            dynamic: true,
            models: OPENCODE_MODELS,
            default_model: "opencode/deepseek-v4-flash-free",
        },
        "pi" => AgentSpec {
            id: "pi",
            label: "Pi",
            binary: "pi",
            prompt_in_argv: false,
            dynamic: true,
            models: PI_MODELS,
            default_model: "github-copilot/gpt-5.4-mini",
        },
        "amp" => AgentSpec {
            id: "amp",
            label: "Amp",
            binary: "amp",
            prompt_in_argv: false,
            dynamic: false,
            models: AMP_MODELS,
            default_model: "smart",
        },
        "cursor" => AgentSpec {
            id: "cursor",
            label: "Cursor",
            binary: "cursor-agent",
            prompt_in_argv: true,
            dynamic: true,
            models: CURSOR_MODELS,
            default_model: "auto",
        },
        "kimi" => AgentSpec {
            id: "kimi",
            label: "Kimi",
            binary: "kimi",
            prompt_in_argv: false,
            dynamic: false,
            models: KIMI_MODELS,
            default_model: "default",
        },
        "copilot" => AgentSpec {
            id: "copilot",
            label: "GitHub Copilot",
            binary: "copilot",
            prompt_in_argv: true,
            dynamic: false,
            models: COPILOT_MODELS,
            default_model: "gpt-5.4",
        },
        "antigravity" => AgentSpec {
            id: "antigravity",
            label: "Antigravity",
            binary: "agy",
            prompt_in_argv: false,
            dynamic: true,
            models: ANTIGRAVITY_MODELS,
            default_model: "Gemini 3.5 Flash (Medium)",
        },
        _ => return None,
    })
}

pub(super) fn plan(params: &GenerationParams, prompt: String) -> Result<AgentPlan, String> {
    if params.agent_id == "custom" {
        return custom_plan(params, prompt);
    }
    let agent = spec(&params.agent_id).ok_or_else(|| {
        format!(
            "Agent \"{}\" does not support AI commit messages.",
            params.agent_id
        )
    })?;
    let known_model = agent.models.iter().any(|(id, _)| *id == params.model);
    let empty_model = params
        .model
        .trim_matches(is_ecmascript_whitespace)
        .is_empty();
    if (!agent.dynamic && !known_model) || (empty_model && agent.id != "pi") {
        return Err(format!(
            "Model \"{}\" is not available for {}.",
            params.model, agent.label
        ));
    }
    if let Some(thinking) = params
        .thinking_level
        .as_deref()
        .filter(|value| !value.is_empty())
        && let Some((levels, _)) = thinking_metadata(agent.id, &params.model)
        && !levels.contains(&thinking)
    {
        let label = agent
            .models
            .iter()
            .find(|(id, _)| *id == params.model)
            .map_or_else(
                || label_from_model_id(&params.model),
                |(_, label)| (*label).to_owned(),
            );
        return Err(format!(
            "Thinking level \"{thinking}\" is not valid for {label}."
        ));
    } else if params
        .thinking_level
        .as_deref()
        .is_some_and(|value| !value.is_empty())
        && !agent.dynamic
        && thinking_metadata(agent.id, &params.model).is_none()
    {
        let label = agent
            .models
            .iter()
            .find(|(id, _)| *id == params.model)
            .map_or_else(
                || label_from_model_id(&params.model),
                |(_, label)| (*label).to_owned(),
            );
        return Err(format!(
            "Model \"{label}\" does not support a thinking effort level."
        ));
    }
    let mut args = built_args(&agent, params, &prompt);
    let mut extra = params
        .agent_args
        .as_deref()
        .filter(|value| !value.trim().is_empty())
        .map(tokenize)
        .transpose()
        .map_err(|error| format!("CLI arguments are invalid: {error}"))?
        .unwrap_or_default();
    if agent.id == "codex" {
        replace_codex_model_option(&mut args, &mut extra);
    }
    insert_extra(&mut args, extra, agent.prompt_in_argv, &prompt);
    let mut binary = agent.binary.to_owned();
    if let Some(command) = params.agent_command_override.as_deref() {
        let mut tokens = tokenize(command)
            .map_err(|error| format!("Agent command override is invalid: {error}"))?;
        if !tokens.is_empty() {
            if tokens[0].is_empty() {
                return Err("Agent command override must start with a binary name.".to_owned());
            }
            binary = tokens.remove(0);
            tokens.extend(args);
            args = tokens;
        }
    }
    Ok(AgentPlan {
        args,
        binary,
        label: agent.label.to_owned(),
        stdin: (!agent.prompt_in_argv).then(|| prompt.into_bytes()),
    })
}

fn built_args(spec: &AgentSpec, params: &GenerationParams, prompt: &str) -> Vec<String> {
    let model = params.model.clone();
    let thinking = params
        .thinking_level
        .clone()
        .filter(|value| !value.is_empty());
    match spec.id {
        "claude" => with_thinking(
            vec![
                "-p",
                "--output-format",
                "text",
                "--model",
                &model,
                "--permission-mode",
                "plan",
            ],
            "--effort",
            thinking,
        ),
        "codex" => {
            let mut args = strings(&[
                "exec",
                "--ephemeral",
                "--skip-git-repo-check",
                "-s",
                "read-only",
                "--model",
                &model,
            ]);
            if let Some(value) = thinking {
                args.extend(["-c".to_owned(), format!("model_reasoning_effort={value}")]);
            }
            args
        }
        "opencode" => with_thinking(
            vec![
                "run", "--model", &model, "--agent", "build", "--format", "default",
            ],
            "--variant",
            thinking,
        ),
        "pi" => {
            let mut args = strings(&[
                "--print",
                "--no-session",
                "--no-tools",
                "--no-extensions",
                "--no-skills",
                "--no-context-files",
                "--mode",
                "text",
            ]);
            if !model.is_empty() {
                args.extend(["--model".to_owned(), model]);
            }
            if let Some(value) = thinking {
                args.extend(["--thinking".to_owned(), value]);
            }
            args
        }
        "amp" => with_thinking(
            vec![
                "--execute",
                "--no-notifications",
                "--no-ide",
                "--no-jetbrains",
                "--mode",
                &model,
            ],
            "--effort",
            thinking,
        ),
        "cursor" => strings(&[
            "--print",
            "--mode",
            "ask",
            "--trust",
            "--output-format",
            "text",
            "--model",
            &model,
            prompt,
        ]),
        "kimi" => {
            let mut args = strings(&["--print", "--quiet"]);
            if model != "default" && !model.is_empty() {
                args.extend(["--model".to_owned(), model]);
            }
            if thinking.as_deref() == Some("on") {
                args.push("--thinking".to_owned());
            }
            if thinking.as_deref() == Some("off") {
                args.push("--no-thinking".to_owned());
            }
            args
        }
        "copilot" => with_thinking(
            vec![
                "--prompt",
                prompt,
                "--silent",
                "--stream",
                "off",
                "--no-custom-instructions",
                "--model",
                &model,
            ],
            "--effort",
            thinking,
        ),
        "antigravity" => strings(&["--print", "--sandbox", "--model", &model]),
        _ => Vec::new(),
    }
}

fn custom_plan(params: &GenerationParams, prompt: String) -> Result<AgentPlan, String> {
    let command = params
        .custom_agent_command
        .as_deref()
        .unwrap_or_default()
        .trim();
    if command.is_empty() {
        return Err(
            "Custom command is empty. Add one in Settings → Git → AI Commit Messages.".to_owned(),
        );
    }
    let mut tokens = tokenize(command)?;
    if tokens.is_empty() {
        return Err("Custom command is empty.".to_owned());
    }
    if tokens[0].is_empty() {
        return Err("Custom command must start with a binary name.".to_owned());
    }
    let uses_prompt = tokens.iter().any(|token| token.contains("{prompt}"));
    let binary = tokens.remove(0).replace("{prompt}", &prompt);
    let mut args = tokens
        .into_iter()
        .map(|value| value.replace("{prompt}", &prompt))
        .collect::<Vec<_>>();
    let extra = params
        .agent_args
        .as_deref()
        .map(tokenize)
        .transpose()
        .map_err(|error| format!("CLI arguments are invalid: {error}"))?
        .unwrap_or_default();
    insert_extra(&mut args, extra, uses_prompt, &prompt);
    Ok(AgentPlan {
        args,
        label: binary.clone(),
        binary,
        stdin: (!uses_prompt).then(|| prompt.into_bytes()),
    })
}

fn strings(values: &[&str]) -> Vec<String> {
    values.iter().map(|value| (*value).to_owned()).collect()
}
fn with_thinking(base: Vec<&str>, flag: &str, thinking: Option<String>) -> Vec<String> {
    let mut output = strings(&base);
    if let Some(value) = thinking {
        output.extend([flag.to_owned(), value]);
    }
    output
}

fn insert_extra(args: &mut Vec<String>, extra: Vec<String>, prompt_in_argv: bool, prompt: &str) {
    if extra.is_empty() {
        return;
    }
    if let Some(index) = args.iter().rposition(|value| value == "{prompt}") {
        args.splice(index..index, extra);
    } else if prompt_in_argv
        && !prompt.is_empty()
        && args.last().is_some_and(|value| value == prompt)
    {
        let prompt = args.pop();
        args.extend(extra);
        args.extend(prompt);
    } else {
        args.extend(extra);
    }
}

fn thinking_metadata(agent: &str, model: &str) -> Option<(&'static [&'static str], &'static str)> {
    const BASIC: &[&str] = &["low", "medium", "high"];
    const OPENAI: &[&str] = &["low", "medium", "high", "xhigh"];
    const CLAUDE: &[&str] = &["low", "medium", "high", "xhigh", "max"];
    const SWITCH: &[&str] = &["on", "off"];
    if spec(agent)
        .is_some_and(|agent| agent.dynamic && !agent.models.iter().any(|(id, _)| *id == model))
    {
        let normalized = model.to_ascii_lowercase();
        return (normalized.contains("gpt-5") || normalized.contains("codex"))
            .then_some((OPENAI, "low"));
    }
    match (agent, model) {
        ("claude", "sonnet" | "opus") => Some((CLAUDE, "low")),
        ("codex", _) => Some((OPENAI, "low")),
        ("opencode" | "pi", value)
            if value.to_ascii_lowercase().contains("gpt-5")
                || value.to_ascii_lowercase().contains("codex") =>
        {
            Some((OPENAI, "low"))
        }
        ("amp", "large" | "deep") => Some((BASIC, "low")),
        ("kimi", "kimi-code/kimi-for-coding") => Some((SWITCH, "on")),
        ("copilot", value)
            if value != "gpt-4.1"
                && (value.to_ascii_lowercase().contains("gpt-5")
                    || value.to_ascii_lowercase().contains("codex")) =>
        {
            Some((OPENAI, "low"))
        }
        _ => None,
    }
}

fn label_from_model_id(model: &str) -> String {
    model
        .split(['/', '-'])
        .filter(|part| !part.is_empty())
        .map(|part| {
            if part.eq_ignore_ascii_case("gpt") {
                "GPT".to_owned()
            } else if part.encode_utf16().count() <= 3
                && part.starts_with(|character: char| character.is_ascii_digit())
            {
                part.to_uppercase()
            } else {
                let mut characters = part.chars();
                characters.next().map_or_else(String::new, |first| {
                    first.to_uppercase().collect::<String>() + characters.as_str()
                })
            }
        })
        .collect::<Vec<_>>()
        .join(" ")
}

fn replace_codex_model_option(generated: &mut Vec<String>, recipe: &mut Vec<String>) {
    let Some((recipe_index, recipe_count)) = find_model_option(recipe, true) else {
        return;
    };
    let Some((generated_index, generated_count)) = find_model_option(generated, false) else {
        return;
    };
    let replacement = recipe
        .drain(recipe_index..recipe_index + recipe_count)
        .collect::<Vec<_>>();
    generated.splice(
        generated_index..generated_index + generated_count,
        replacement,
    );
}

fn find_model_option(tokens: &[String], stop_at_terminator: bool) -> Option<(usize, usize)> {
    for (index, token) in tokens.iter().enumerate() {
        if stop_at_terminator && token == "--" {
            break;
        }
        let exact = matches!(token.as_str(), "--model" | "-m");
        let matched =
            exact || token.starts_with("--model=") || (token.starts_with("-m") && token.len() > 2);
        if matched {
            let consumed = usize::from(
                exact
                    && tokens
                        .get(index + 1)
                        .is_some_and(|next| !next.starts_with('-')),
            ) + 1;
            return Some((index, consumed));
        }
    }
    None
}

pub(super) fn tokenize(value: &str) -> Result<Vec<String>, String> {
    let mut tokens = Vec::new();
    let mut current = String::new();
    let mut quote = None;
    let mut in_token = false;
    let mut chars = value.chars().peekable();
    while let Some(character) = chars.next() {
        if let Some(delimiter) = quote {
            if character == '\\' && delimiter == '"' && chars.peek().is_some() {
                if let Some(next) = chars.next() {
                    current.push(next);
                }
            } else if character == delimiter {
                quote = None;
                in_token = true;
            } else {
                current.push(character);
            }
        } else if matches!(character, '\'' | '"') {
            quote = Some(character);
            in_token = true;
        } else if character == '\\' && chars.peek().is_some() {
            if let Some(next) = chars.next() {
                current.push(next);
                in_token = true;
            }
        } else if is_ecmascript_whitespace(character) {
            if in_token {
                tokens.push(std::mem::take(&mut current));
                in_token = false;
            }
        } else {
            current.push(character);
            in_token = true;
        }
    }
    if quote.is_some() {
        return Err("Unclosed quote in command template.".to_owned());
    }
    if in_token {
        tokens.push(current);
    }
    Ok(tokens)
}
