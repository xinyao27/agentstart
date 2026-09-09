use serde_json::{Map, Value, json};

const OPERATIONS: &[&str] = &["commitMessage", "pullRequest", "branchName"];
const ACTIONS: &[&str] = &[
    "commitMessage",
    "pullRequest",
    "branchName",
    "fixCommitFailure",
    "fixPushFailure",
    "fixChecks",
    "resolveConflicts",
    "resolveComments",
];

pub(crate) fn normalize(value: &Value) -> Option<Value> {
    let source = value.as_object()?;
    let mut output = Map::new();
    if let Some(enabled) = source.get("enabled").and_then(Value::as_bool) {
        output.insert("enabled".to_owned(), json!(enabled));
    }
    if let Some(command) = source
        .get("customAgentCommand")
        .and_then(Value::as_str)
        .map(crate::repositories::ecmascript::trim)
        .filter(|value| !value.is_empty())
    {
        output.insert("customAgentCommand".to_owned(), json!(command));
    }
    if let Some(models) = operation_record(source.get("modelOverridesByOperation"), model_choice) {
        output.insert("modelOverridesByOperation".to_owned(), models);
    }
    let instructions = operation_record(source.get("instructionsByOperation"), |value| {
        (value.is_string() || value.is_null()).then(|| value.clone())
    });
    if let Some(instructions) = instructions.as_ref() {
        output.insert("instructionsByOperation".to_owned(), instructions.clone());
    }
    let mut actions = action_record(source.get("actionOverrides"));
    synthesize_instruction_templates(&mut actions, instructions.as_ref());
    if !actions.is_empty() {
        output.insert("actionOverrides".to_owned(), Value::Object(actions));
    }
    if let Some(defaults) = pr_defaults(source.get("prCreationDefaults")) {
        output.insert("prCreationDefaults".to_owned(), defaults);
    }
    (!output.is_empty()).then_some(Value::Object(output))
}

fn operation_record(
    value: Option<&Value>,
    normalize: impl Fn(&Value) -> Option<Value>,
) -> Option<Value> {
    let source = value?.as_object()?;
    let output = OPERATIONS
        .iter()
        .filter_map(|operation| {
            source
                .get(*operation)
                .and_then(&normalize)
                .map(|value| ((*operation).to_owned(), value))
        })
        .collect::<Map<_, _>>();
    (!output.is_empty()).then_some(Value::Object(output))
}

fn model_choice(value: &Value) -> Option<Value> {
    let source = value.as_object()?;
    let mut output = Map::new();
    if let Some(models) = string_record(source.get("selectedModelByAgent")) {
        output.insert("selectedModelByAgent".to_owned(), models);
    }
    if let Some(host_models) = source
        .get("selectedModelByAgentByHost")
        .and_then(Value::as_object)
    {
        let host_models = host_models
            .iter()
            .filter(|(host, _)| safe_key(host))
            .filter_map(|(host, value)| {
                string_record(Some(value)).map(|models| (host.clone(), models))
            })
            .collect::<Map<_, _>>();
        if !host_models.is_empty() {
            output.insert(
                "selectedModelByAgentByHost".to_owned(),
                Value::Object(host_models),
            );
        }
    }
    if let Some(thinking) = string_record(source.get("selectedThinkingByModel")) {
        output.insert("selectedThinkingByModel".to_owned(), thinking);
    }
    (!output.is_empty()).then_some(Value::Object(output))
}

fn string_record(value: Option<&Value>) -> Option<Value> {
    let source = value?.as_object()?;
    let output = source
        .iter()
        .filter(|(key, value)| safe_key(key) && value.is_string())
        .map(|(key, value)| (key.clone(), value.clone()))
        .collect::<Map<_, _>>();
    (!output.is_empty()).then_some(Value::Object(output))
}

fn action_record(value: Option<&Value>) -> Map<String, Value> {
    let Some(source) = value.and_then(Value::as_object) else {
        return Map::new();
    };
    ACTIONS
        .iter()
        .filter_map(|action| {
            source
                .get(*action)
                .and_then(action_recipe)
                .map(|value| ((*action).to_owned(), value))
        })
        .collect()
}

fn action_recipe(value: &Value) -> Option<Value> {
    let source = value.as_object()?;
    let mut output = Map::new();
    if let Some(agent) = source.get("agentId")
        && (agent.is_null()
            || agent.as_str() == Some("custom")
            || agent.as_str().is_some_and(is_agent))
    {
        output.insert("agentId".to_owned(), agent.clone());
    }
    for field in ["commandInputTemplate", "agentArgs"] {
        if let Some(value) = source.get(field)
            && (value.is_string() || value.is_null())
        {
            output.insert(field.to_owned(), value.clone());
        }
    }
    (!output.is_empty()).then_some(Value::Object(output))
}

fn synthesize_instruction_templates(
    actions: &mut Map<String, Value>,
    instructions: Option<&Value>,
) {
    let Some(instructions) = instructions.and_then(Value::as_object) else {
        return;
    };
    for operation in OPERATIONS {
        let Some(instruction) = instructions.get(*operation).and_then(Value::as_str) else {
            continue;
        };
        let existing = actions
            .get(*operation)
            .and_then(Value::as_object)
            .and_then(|recipe| recipe.get("commandInputTemplate"))
            .and_then(Value::as_str);
        let legacy = (*operation == "branchName")
            .then(|| base_then_instruction(instruction))
            .is_some_and(|legacy| existing == Some(legacy.as_str()));
        if existing.is_some() && !legacy {
            continue;
        }
        let template = if *operation == "branchName" {
            instruction_then_base(instruction)
        } else {
            base_then_instruction(instruction)
        };
        let recipe = actions
            .entry((*operation).to_owned())
            .or_insert_with(|| json!({}));
        if let Some(recipe) = recipe.as_object_mut() {
            recipe.insert("commandInputTemplate".to_owned(), json!(template));
        }
    }
}

fn base_then_instruction(instruction: &str) -> String {
    let instruction = crate::repositories::ecmascript::trim(instruction);
    if instruction.is_empty() {
        "{basePrompt}".to_owned()
    } else {
        format!("{{basePrompt}}\n\n{instruction}")
    }
}

fn instruction_then_base(instruction: &str) -> String {
    let instruction = crate::repositories::ecmascript::trim(instruction);
    if instruction.is_empty() {
        "{basePrompt}".to_owned()
    } else {
        format!("{instruction}\n\n{{basePrompt}}")
    }
}

fn pr_defaults(value: Option<&Value>) -> Option<Value> {
    let source = value?.as_object()?;
    let mut output = Map::new();
    for field in [
        "draft",
        "useTemplate",
        "generateDetailsOnOpen",
        "openAfterCreate",
    ] {
        if let Some(value) = source.get(field)
            && (value.is_boolean() || value.is_null())
        {
            output.insert(field.to_owned(), value.clone());
        }
    }
    (!output.is_empty()).then_some(Value::Object(output))
}

fn safe_key(key: &str) -> bool {
    !matches!(key, "" | "__proto__" | "constructor" | "prototype")
}

fn is_agent(value: &str) -> bool {
    matches!(
        value,
        "claude"
            | "openclaude"
            | "codex"
            | "autohand"
            | "opencode"
            | "mimo-code"
            | "pi"
            | "omp"
            | "gemini"
            | "antigravity"
            | "aider"
            | "goose"
            | "amp"
            | "kilo"
            | "kiro"
            | "crush"
            | "aug"
            | "cline"
            | "codebuff"
            | "command-code"
            | "continue"
            | "cursor"
            | "droid"
            | "kimi"
            | "mistral-vibe"
            | "qwen-code"
            | "rovo"
            | "hermes"
            | "openclaw"
            | "copilot"
            | "grok"
            | "devin"
            | "ante"
            | "trae"
    )
}
