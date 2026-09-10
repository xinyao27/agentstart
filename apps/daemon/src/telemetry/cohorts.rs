use std::path::PathBuf;
use std::sync::Arc;
use std::sync::atomic::{AtomicBool, Ordering};

use serde_json::{Map, Value};

use crate::projects::ProjectCatalog;
use crate::settings::TelemetrySettings;

const REPO_COHORT_EVENTS: &[&str] = &[
    "app_opened",
    "app_starred_agentstart",
    "star_nag_outcome",
    "feature_interaction_usage_bucket_reached",
    "repo_added",
    "add_repo_setup_step_action",
    "add_repo_existing_workspaces_detected",
    "add_repo_default_checkout_handoff",
    "add_repo_nested_scan_result",
    "add_repo_nested_import_action",
    "add_repo_nested_import_result",
    "workspace_created",
    "workspace_create_failed",
    "setup_script_prompt_shown",
    "setup_script_prompt_action",
    "agent_started",
    "agent_prompt_sent",
    "agent_error",
    "agentstart_cli_feature_tip_shown",
    "agentstart_cli_feature_tip_setup_clicked",
    "agentstart_cli_feature_tip_setup_result",
    "command_palette_feature_tip_shown",
    "command_palette_feature_tip_acknowledged",
];

const ONBOARDING_EVENTS: &[&str] = &[
    "onboarding_started",
    "onboarding_step_viewed",
    "onboarding_step_completed",
    "onboarding_step_skipped",
    "onboarding_tour_outcome",
    "onboarding_step4_path_clicked",
    "onboarding_step4_path_failed",
    "onboarding_windows_terminal_snapshot",
    "onboarding_completed",
    "onboarding_dismissed",
    "onboarding_agent_picked",
    "onboarding_ghostty_discovered",
    "onboarding_ghostty_import_clicked",
    "onboarding_ghostty_import_failed",
    "onboarding_feature_setup_toggled",
    "onboarding_feature_setup_run",
    "onboarding_feature_setup_terminal_opened",
    "onboarding_feature_setup_terminal_interacted",
];

#[derive(Clone)]
pub(super) struct CohortSource {
    legacy_path: PathBuf,
    onboarding_warned: Arc<AtomicBool>,
    projects: ProjectCatalog,
    repo_warned: Arc<AtomicBool>,
    ui_path: PathBuf,
}

impl CohortSource {
    pub(super) fn new(user_data_path: &std::path::Path, projects: ProjectCatalog) -> Self {
        Self {
            legacy_path: user_data_path.join("agentstart-data.json"),
            onboarding_warned: Arc::new(AtomicBool::new(false)),
            projects,
            repo_warned: Arc::new(AtomicBool::new(false)),
            ui_path: user_data_path.join("agentstart-data-ui.json"),
        }
    }

    pub(super) async fn enrich(
        &self,
        name: &str,
        props: &mut Map<String, Value>,
        settings: &TelemetrySettings,
    ) {
        if REPO_COHORT_EVENTS.contains(&name) {
            match self.projects.list().await {
                Ok(projects) => {
                    props.insert("nth_repo_added".to_owned(), Value::from(projects.len()));
                }
                Err(error) => {
                    warn_once(&self.repo_warned, "telemetry-cohort", error.to_string());
                }
            }
        }
        if ONBOARDING_EVENTS.contains(&name)
            && let Some(cohort) = self.onboarding(settings).await
        {
            props.insert("cohort".to_owned(), Value::String(cohort.to_owned()));
        }
    }

    async fn onboarding(&self, settings: &TelemetrySettings) -> Option<&'static str> {
        if !settings.existed_before_release {
            return Some("fresh_install");
        }
        let bytes = match read_region(&self.ui_path, &self.legacy_path).await {
            Ok(Some(bytes)) => bytes,
            Ok(None) => return Some("upgrade_backfill"),
            Err(error) => {
                warn_once(
                    &self.onboarding_warned,
                    "telemetry-onboarding-cohort",
                    error.to_string(),
                );
                return None;
            }
        };
        let document = match serde_json::from_slice::<Value>(&bytes) {
            Ok(Value::Object(document)) => document,
            Ok(_) => return Some("upgrade_backfill"),
            Err(error) => {
                warn_once(
                    &self.onboarding_warned,
                    "telemetry-onboarding-cohort",
                    error.to_string(),
                );
                return None;
            }
        };
        let onboarding = document.get("onboarding").and_then(Value::as_object);
        let Some(onboarding) = onboarding else {
            return Some("upgrade_backfill");
        };
        let step = onboarding.get("lastCompletedStep").and_then(Value::as_i64);
        let flow = onboarding.get("flowVersion").and_then(Value::as_i64);
        if onboarding.get("outcome").and_then(Value::as_str) == Some("completed")
            && (step == Some(5) || flow != Some(4) && step.is_some_and(|step| step >= 4))
        {
            Some("upgrade_backfill")
        } else {
            Some("fresh_install")
        }
    }
}

async fn read_region(
    current: &std::path::Path,
    legacy: &std::path::Path,
) -> Result<Option<Vec<u8>>, std::io::Error> {
    match tokio::fs::read(current).await {
        Ok(bytes) => Ok(Some(bytes)),
        Err(error) if error.kind() == std::io::ErrorKind::NotFound => {
            match tokio::fs::read(legacy).await {
                Ok(bytes) => Ok(Some(bytes)),
                Err(error) if error.kind() == std::io::ErrorKind::NotFound => Ok(None),
                Err(error) => Err(error),
            }
        }
        Err(error) => Err(error),
    }
}

fn warn_once(flag: &AtomicBool, label: &str, reason: String) {
    if !flag.swap(true, Ordering::Relaxed) {
        eprintln!("[{label}] classifier returned undefined: {reason}");
    }
}
