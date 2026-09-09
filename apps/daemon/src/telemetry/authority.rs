use std::path::Path;
use std::sync::{Arc, Mutex, MutexGuard};
use std::time::Duration;

use serde_json::{Map, Value};

use crate::projects::ProjectCatalog;
use crate::settings::TelemetryPreferences;

use super::bootstrap::{architecture, common_properties, official_build, os_release, platform};
use super::cohorts::CohortSource;
use super::consent::ConsentResolver;
use super::identity::random_uuid;
use super::limits::SessionLimits;
use super::model::{
    CommonProperties, ConsentState, OptInVia, SupportDiagnosticReport, SupportReportError,
    SupportReportSubmission, TelemetryError,
};
use super::posthog::{PosthogQueue, PosthogSender};
use super::validator::EventValidator;

const MAIN_OWNED_EVENTS: &[&str] = &[
    "app_starred_yiru",
    "star_nag_outcome",
    "feature_interaction_usage_bucket_reached",
];
const BACKGROUND_SHUTDOWN_WAIT: Duration = Duration::from_secs(2);

#[derive(Clone)]
pub(crate) struct TelemetryAuthority {
    inner: Arc<Inner>,
}

#[derive(Clone)]
pub(crate) struct FeatureInteractionTelemetry {
    authority: TelemetryAuthority,
}

struct Inner {
    cohorts: CohortSource,
    common: Option<CommonProperties>,
    posthog: Option<PosthogQueue>,
    preferences: TelemetryPreferences,
    state: Mutex<State>,
    support: Option<(String, PosthogSender)>,
    validator: EventValidator,
}

struct State {
    app_opened_tracked: bool,
    background_tasks: Vec<tokio::task::JoinHandle<()>>,
    consent: ConsentResolver,
    limits: SessionLimits,
    shutting_down: bool,
    support_report_in_flight: bool,
}

struct SupportSubmissionGuard {
    inner: Arc<Inner>,
}

impl TelemetryAuthority {
    pub(crate) async fn open(
        user_data_path: &Path,
        projects: ProjectCatalog,
        preferences: TelemetryPreferences,
    ) -> Result<Self, TelemetryError> {
        let settings = preferences.get();
        let validator = EventValidator::new()?;
        let official = official_build();
        let common = match official.as_ref() {
            Some((channel, _)) => common_properties(&settings, channel).await,
            None => None,
        };
        if official.is_some() && common.is_none() {
            eprintln!("[telemetry] common props failed schema validation; skipping transport init");
        }
        let support = official.map(|(channel, key)| (channel, PosthogSender::new(key)));
        let posthog = common
            .as_ref()
            .and(support.as_ref())
            .map(|(_, sender)| PosthogQueue::new(sender.clone()));
        Ok(Self {
            inner: Arc::new(Inner {
                cohorts: CohortSource::new(user_data_path, projects),
                common,
                posthog,
                preferences,
                state: Mutex::new(State {
                    app_opened_tracked: false,
                    background_tasks: Vec::new(),
                    consent: ConsentResolver::default(),
                    limits: SessionLimits::default(),
                    shutting_down: false,
                    support_report_in_flight: false,
                }),
                support,
                validator,
            }),
        })
    }

    pub(crate) fn feature_interactions(&self) -> FeatureInteractionTelemetry {
        FeatureInteractionTelemetry {
            authority: self.clone(),
        }
    }

    pub(crate) async fn track_shell(&self, name: String, props: Map<String, Value>) {
        if MAIN_OWNED_EVENTS.contains(&name.as_str()) {
            return;
        }
        self.track(name, props).await;
    }

    pub(crate) async fn track_main(&self, name: &'static str, props: Map<String, Value>) {
        if MAIN_OWNED_EVENTS.contains(&name) {
            self.track(name.to_owned(), props).await;
        }
    }

    pub(crate) async fn set_opt_in(&self, opted_in: bool) -> Result<(), TelemetryError> {
        let (via, was_pending) = {
            let mut state = lock(&self.inner.state);
            if !state.limits.consume_consent() {
                return Ok(());
            }
            let settings = self.inner.preferences.get();
            let was_pending = settings.existed_before_release && settings.opted_in.is_none();
            let via = if was_pending && !opted_in {
                OptInVia::FirstLaunchBanner
            } else {
                OptInVia::Settings
            };
            (via, was_pending)
        };
        self.inner.preferences.set_opted_in(opted_in)?;
        if opted_in {
            if was_pending {
                self.track_app_opened_once().await;
            }
            self.track(
                "telemetry_opted_in".to_owned(),
                Map::from_iter([("via".to_owned(), Value::String(via.as_str().to_owned()))]),
            )
            .await;
        } else {
            self.capture_opt_out(via).await;
        }
        Ok(())
    }

    pub(crate) fn consent_state(&self) -> ConsentState {
        let mut state = lock(&self.inner.state);
        let settings = self.inner.preferences.get();
        state.consent.resolve(&settings)
    }

    pub(crate) async fn acknowledge_banner(&self) -> Result<(), TelemetryError> {
        {
            let mut state = lock(&self.inner.state);
            let settings = self.inner.preferences.get();
            if !settings.existed_before_release
                || settings.opted_in.is_some()
                || !state.limits.consume_consent()
            {
                return Ok(());
            }
        }
        self.inner.preferences.set_opted_in(true)?;
        self.track_app_opened_once().await;
        Ok(())
    }

    pub(crate) async fn submit_diagnostic_report(
        &self,
        report: SupportDiagnosticReport,
    ) -> Result<String, SupportReportError> {
        self.submit_support_report(SupportReportSubmission {
            diagnostic: Some(report),
            github_email: None,
            github_login: None,
            report_text: None,
            report_type: "diagnostics",
            submit_anonymously: true,
        })
        .await
    }

    pub(crate) async fn submit_support_report(
        &self,
        submission: SupportReportSubmission,
    ) -> Result<String, SupportReportError> {
        let Some((channel, sender)) = &self.inner.support else {
            return Err(SupportReportError::NotConfigured);
        };
        let guard = {
            let mut state = lock(&self.inner.state);
            if state.shutting_down {
                return Err(SupportReportError::ShuttingDown);
            }
            if state.support_report_in_flight {
                return Err(SupportReportError::AlreadySending);
            }
            if !state.limits.consume_event("support_report_submitted") {
                return Err(SupportReportError::RateLimited);
            }
            state.support_report_in_flight = true;
            SupportSubmissionGuard {
                inner: Arc::clone(&self.inner),
            }
        };
        let report_id = random_uuid().map_err(TelemetryError::from)?;
        let mut properties = Map::from_iter([
            ("report_id".to_owned(), Value::String(report_id.clone())),
            (
                "report_type".to_owned(),
                Value::String(submission.report_type.to_owned()),
            ),
            (
                "submit_anonymously".to_owned(),
                Value::Bool(submission.submit_anonymously),
            ),
            (
                "app_version".to_owned(),
                Value::String(
                    std::env::var("YIRU_APP_VERSION")
                        .unwrap_or_else(|_| env!("CARGO_PKG_VERSION").to_owned()),
                ),
            ),
            ("platform".to_owned(), Value::String(platform().to_owned())),
            ("arch".to_owned(), Value::String(architecture().to_owned())),
            ("os_release".to_owned(), Value::String(os_release().await)),
            ("yiru_channel".to_owned(), Value::String(channel.clone())),
        ]);
        if let Some(text) = submission.report_text {
            properties.insert("report_text".to_owned(), Value::String(text));
        }
        // Why: Anonymous submissions must never carry caller-supplied identity.
        if !submission.submit_anonymously {
            if let Some(login) = submission.github_login {
                properties.insert("github_login".to_owned(), Value::String(login));
            }
            if let Some(email) = submission.github_email {
                properties.insert("github_email".to_owned(), Value::String(email));
            }
        }
        if let Some(report) = submission.diagnostic {
            properties.insert(
                "diagnostic_bundle_id".to_owned(),
                Value::String(report.bundle_submission_id),
            );
            properties.insert(
                "diagnostic_excerpt".to_owned(),
                Value::String(report.excerpt),
            );
            properties.insert("diagnostic_bytes".to_owned(), Value::from(report.bytes));
            properties.insert(
                "diagnostic_span_count".to_owned(),
                Value::from(report.span_count),
            );
            properties.insert(
                "diagnostic_excerpt_truncated".to_owned(),
                Value::Bool(report.excerpt_truncated),
            );
        }
        if !self
            .inner
            .validator
            .validate("support_report_submitted", &properties)
        {
            return Err(SupportReportError::InvalidContent);
        }
        properties.insert("$process_person_profile".to_owned(), Value::Bool(false));
        let delivered = sender
            .send_immediate(
                "support_report_submitted",
                &report_id,
                Value::Object(properties),
            )
            .await?;
        drop(guard);
        if delivered {
            Ok(report_id)
        } else {
            Err(SupportReportError::Transport)
        }
    }

    pub(crate) async fn shutdown(&self) -> Result<(), TelemetryError> {
        let background_tasks = {
            let mut state = lock(&self.inner.state);
            state.shutting_down = true;
            std::mem::take(&mut state.background_tasks)
        };
        let deadline = tokio::time::Instant::now() + BACKGROUND_SHUTDOWN_WAIT;
        let mut tasks = background_tasks.into_iter();
        while let Some(mut task) = tasks.next() {
            if tokio::time::timeout_at(deadline, &mut task).await.is_err() {
                task.abort();
                let _ = task.await;
                for task in tasks {
                    task.abort();
                    let _ = task.await;
                }
                break;
            }
        }
        if let Some(posthog) = &self.inner.posthog {
            posthog.shutdown().await;
        }
        Ok(())
    }

    async fn track(&self, name: String, mut props: Map<String, Value>) {
        if name == "support_report_submitted"
            || self.inner.posthog.is_none()
            || !self.inner.validator.known(&name)
        {
            return;
        }
        let settings = {
            let mut state = lock(&self.inner.state);
            if state.shutting_down || !state.limits.consume_event(&name) {
                return;
            }
            let settings = self.inner.preferences.get();
            if !matches!(state.consent.resolve(&settings), ConsentState::Enabled) {
                return;
            }
            settings
        };
        self.inner
            .cohorts
            .enrich(&name, &mut props, &settings)
            .await;
        if self.inner.validator.validate(&name, &props) {
            self.capture(&name, props, false).await;
        }
    }

    async fn capture_opt_out(&self, via: OptInVia) {
        if self.inner.posthog.is_none() {
            return;
        }
        let name = "telemetry_opted_out";
        let props = Map::from_iter([("via".to_owned(), Value::String(via.as_str().to_owned()))]);
        let allowed = {
            let mut state = lock(&self.inner.state);
            !state.shutting_down && state.limits.consume_event(name)
        };
        if allowed && self.inner.validator.validate(name, &props) {
            self.capture(name, props, true).await;
        }
    }

    async fn capture(&self, name: &str, props: Map<String, Value>, confirmed: bool) {
        let (Some(posthog), Some(common)) = (&self.inner.posthog, &self.inner.common) else {
            return;
        };
        let mut properties = common.values.clone();
        properties.extend(props);
        properties.insert("$process_person_profile".to_owned(), Value::Bool(false));
        let result = if confirmed {
            posthog
                .enqueue_confirmed(name, &common.install_id, Value::Object(properties))
                .await
                .map(|enqueued| {
                    if !enqueued {
                        eprintln!("[telemetry] opt-out capture was not enqueued before optOut");
                    }
                })
        } else {
            posthog.enqueue(name, &common.install_id, Value::Object(properties))
        };
        if let Err(error) = result {
            eprintln!("[telemetry] capture enqueue failed: {error}");
        }
    }

    async fn track_app_opened_once(&self) {
        {
            let mut state = lock(&self.inner.state);
            if state.app_opened_tracked {
                return;
            }
            state.app_opened_tracked = true;
        }
        self.track("app_opened".to_owned(), Map::new()).await;
    }
}

impl Drop for SupportSubmissionGuard {
    fn drop(&mut self) {
        lock(&self.inner.state).support_report_in_flight = false;
    }
}

impl FeatureInteractionTelemetry {
    pub(crate) fn bucket_reached(&self, id: String, bucket: String, source: String) {
        let Some(category) = super::refinements::feature_category_for(&id) else {
            return;
        };
        let authority = Arc::downgrade(&self.authority.inner);
        let task = tokio::spawn(async move {
            let Some(inner) = authority.upgrade() else {
                return;
            };
            let authority = TelemetryAuthority { inner };
            authority
                .track(
                    "feature_interaction_usage_bucket_reached".to_owned(),
                    Map::from_iter([
                        ("feature_id".to_owned(), Value::String(id)),
                        (
                            "feature_category".to_owned(),
                            Value::String(category.to_owned()),
                        ),
                        ("count_bucket".to_owned(), Value::String(bucket)),
                        ("bucket_source".to_owned(), Value::String(source)),
                    ]),
                )
                .await;
        });
        let mut state = lock(&self.authority.inner.state);
        if state.shutting_down {
            task.abort();
            return;
        }
        state.background_tasks.retain(|task| !task.is_finished());
        state.background_tasks.push(task);
    }
}

fn lock<T>(mutex: &Mutex<T>) -> MutexGuard<'_, T> {
    mutex
        .lock()
        .unwrap_or_else(std::sync::PoisonError::into_inner)
}
