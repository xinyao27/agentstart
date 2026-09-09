use serde_json::{Map, Value};

pub(super) fn validate(name: &str, props: &Map<String, Value>) -> bool {
    match name {
        "feature_interaction_usage_bucket_reached" => feature_category(props),
        "star_nag_outcome" => optional_only_for(
            props,
            &["next_threshold", "cooldown_days"],
            &["dismissed", "later"],
        ),
        "setup_script_prompt_shown" => setup_provider(props),
        "setup_script_prompt_action" => setup_provider(props) && setup_action(props),
        "add_repo_nested_scan_result"
        | "add_repo_nested_import_action"
        | "add_repo_nested_import_result" => nested_buckets(props),
        "onboarding_tour_outcome" => onboarding_tour(props),
        "onboarding_feature_setup_run"
        | "onboarding_feature_setup_terminal_opened"
        | "onboarding_feature_setup_terminal_interacted" => selected_count(props),
        "contextual_tour_outcome" => contextual_tour(props),
        "setup_guide_closed" => {
            number(props, "final_completed_count") >= number(props, "initial_completed_count")
        }
        _ => true,
    }
}

fn optional_only_for(props: &Map<String, Value>, keys: &[&str], outcomes: &[&str]) -> bool {
    keys.iter().all(|key| !props.contains_key(*key))
        || props
            .get("outcome")
            .and_then(Value::as_str)
            .is_some_and(|outcome| outcomes.contains(&outcome))
}

fn setup_provider(props: &Map<String, Value>) -> bool {
    match props.get("mode").and_then(Value::as_str) {
        Some("import_available") => props.contains_key("provider"),
        Some("configure_needed") => !props.contains_key("provider"),
        _ => false,
    }
}

fn setup_action(props: &Map<String, Value>) -> bool {
    let detected = props
        .get("action")
        .and_then(Value::as_str)
        .is_some_and(|action| {
            [
                "save_detected_setup_clicked",
                "save_detected_setup_completed",
                "save_detected_setup_failed",
            ]
            .contains(&action)
        });
    if detected {
        props.get("provider").and_then(Value::as_str) == Some("package-manager")
            && props.contains_key("edited_before_save")
    } else {
        !props.contains_key("edited_before_save")
    }
}

fn nested_buckets(props: &Map<String, Value>) -> bool {
    ["found", "selected", "imported", "already_known", "failed"]
        .iter()
        .all(|stem| {
            match (
                props.get(&format!("{stem}_count")),
                props.get(&format!("{stem}_count_bucket")),
            ) {
                (None, None) => true,
                (Some(count), Some(bucket)) => {
                    bucket.as_str() == Some(count_bucket(count.as_u64().unwrap_or(0)))
                }
                _ => false,
            }
        })
}

fn count_bucket(count: u64) -> &'static str {
    match count {
        0 => "0",
        1 => "1",
        2..=3 => "2-3",
        4..=7 => "4-7",
        8..=15 => "8-15",
        _ => "16+",
    }
}

fn onboarding_tour(props: &Map<String, Value>) -> bool {
    props.get("outcome").and_then(Value::as_str) != Some("skipped_intro")
        || [
            "tour_dwell_ms",
            "furthest_step",
            "visited_workflow_count",
            "visited_substep_count",
            "completed_workflow_count",
            "completed_substep_count",
        ]
        .iter()
        .all(|key| !props.contains_key(*key))
}

fn selected_count(props: &Map<String, Value>) -> bool {
    let selected = ["browser_use", "computer_use", "orchestration"]
        .iter()
        .filter(|key| props.get(**key).and_then(Value::as_bool) == Some(true))
        .count() as f64;
    number(props, "selected_count") == selected
}

fn contextual_tour(props: &Map<String, Value>) -> bool {
    let steps = number(props, "steps_seen") <= number(props, "total_steps");
    let furthest = props.get("furthest_step_index").and_then(Value::as_f64);
    let defined = props.get("defined_step_count").and_then(Value::as_f64);
    steps
        && furthest.is_some() == defined.is_some()
        && furthest.zip(defined).is_none_or(|(a, b)| a <= b)
}

fn feature_category(props: &Map<String, Value>) -> bool {
    let Some(id) = props.get("feature_id").and_then(Value::as_str) else {
        return false;
    };
    props.get("feature_category").and_then(Value::as_str) == feature_category_for(id)
}

pub(super) fn feature_category_for(id: &str) -> Option<&'static str> {
    Some(match id {
        "workspace-agent-sessions" | "workspace-creation" | "workspace-cleanup" => "workspace",
        "cmd-j"
        | "cmd-j-workspace-open"
        | "cmd-j-browser-page-open"
        | "cmd-j-settings-open"
        | "cmd-j-quick-action"
        | "cmd-j-create-workspace"
        | "quick-commands" => "launcher",
        "browser"
        | "browser-tab-created"
        | "browser-annotations"
        | "browser-annotations-sent-to-agent"
        | "browser-grab"
        | "cookie-import" => "browser",
        "markdown-file-created" => "notes",
        "agent-browser-setup"
        | "agent-orchestration-setup"
        | "mobile-emulator-agent-setup"
        | "computer-use-setup" => "setup",
        "agent-browser-use" | "computer-use" => "agent",
        "agent-orchestration" | "mobile-pairing" => "collaboration",
        "ai-commit-generation" | "ai-pr-generation" => "source_control",
        "claude-account-switching"
        | "codex-account-switching"
        | "notifications"
        | "usage-tracking" => "settings",
        "ports" | "resource-manager" => "resource_management",
        "review-notes" => "review",
        "terminal-pane-split" | "terminal-panes" | "terminal-tabs" | "tab-splits" => "terminal",
        _ => return None,
    })
}

fn number(props: &Map<String, Value>, key: &str) -> f64 {
    props.get(key).and_then(Value::as_f64).unwrap_or(f64::NAN)
}
