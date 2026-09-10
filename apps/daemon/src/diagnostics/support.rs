use std::collections::{HashMap, VecDeque};
use std::io;
use std::path::{Path, PathBuf};
use std::sync::{Arc, Mutex, MutexGuard, Weak};
use std::time::{Duration, Instant};

use base64::Engine;
use base64::engine::general_purpose::URL_SAFE_NO_PAD;
use sha2::{Digest, Sha256};
use thiserror::Error;
use tokio::sync::Semaphore;

use crate::shell_platform::ShellPlatformAuthority;
use crate::telemetry::{SupportDiagnosticReport, SupportReportError, TelemetryAuthority};

use super::bundle::{
    BundleMaterial, abandoned_preview_file_is_safe, collect, preview_file_can_open, remove_file,
    trace_family_size, valid_bundle_submission_id, write_preview,
};
use super::model::{DiagnosticBundle, DiagnosticUpload, DiagnosticsStatus};
use super::policy::DiagnosticsPolicy;
use super::trace::DiagnosticsTrace;
use super::trace_file::trace_file_path;

const BUNDLE_TTL: Duration = Duration::from_secs(15 * 60);
const MAX_PENDING_BUNDLES: usize = 8;
const MAX_LOOKBACK_MINUTES: u32 = 30 * 24 * 60;

#[derive(Clone)]
pub(crate) struct SupportDiagnostics {
    inner: Arc<Inner>,
}

struct Inner {
    app_version: String,
    collect_admission: Arc<Semaphore>,
    preview_directory: PathBuf,
    shell_platform: ShellPlatformAuthority,
    state: Mutex<State>,
    telemetry: TelemetryAuthority,
    trace: DiagnosticsTrace,
    trace_file_path: PathBuf,
}

#[derive(Default)]
struct State {
    order: VecDeque<String>,
    pending: HashMap<String, PendingBundle>,
}

struct PendingBundle {
    bytes: u64,
    created_at: Instant,
    excerpt: String,
    excerpt_truncated: bool,
    preview_file_path: PathBuf,
    preview_opened: bool,
    span_count: u32,
    uploading: bool,
}

struct UploadGuard {
    bundle_submission_id: String,
    inner: Weak<Inner>,
    is_finished: bool,
}

#[derive(Debug, Error)]
pub(crate) enum SupportDiagnosticsError {
    #[error("creating review files is disabled")]
    CollectionDisabled,
    #[error("bundleSubmissionId has invalid format")]
    InvalidBundleId,
    #[error("review file has expired; create a new one")]
    Expired,
    #[error("could not open review file")]
    OpenFailed,
    #[error("open the review file before sending")]
    PreviewNotOpened,
    #[error("sending diagnostics is disabled")]
    UploadDisabled,
    #[error("this review file is already being sent")]
    AlreadyUploading,
    #[error(transparent)]
    Io(#[from] io::Error),
    #[error(transparent)]
    Report(#[from] SupportReportError),
}

impl SupportDiagnostics {
    pub(crate) fn new(
        user_data_path: &Path,
        telemetry: TelemetryAuthority,
        shell_platform: ShellPlatformAuthority,
        trace: DiagnosticsTrace,
    ) -> Self {
        let trace_file_path = trace_file_path(user_data_path);
        let preview_directory = preview_directory(user_data_path);
        cleanup_abandoned_previews(&preview_directory);
        Self {
            inner: Arc::new(Inner {
                app_version: std::env::var("AGENTSTART_APP_VERSION")
                    .unwrap_or_else(|_| env!("CARGO_PKG_VERSION").to_owned()),
                collect_admission: Arc::new(Semaphore::new(1)),
                preview_directory,
                shell_platform,
                state: Mutex::new(State::default()),
                telemetry,
                trace,
                trace_file_path,
            }),
        }
    }

    pub(crate) fn status(&self) -> DiagnosticsStatus {
        let policy = DiagnosticsPolicy::resolve();
        DiagnosticsStatus {
            local_file_enabled: policy.local_file_enabled,
            bundle_enabled: policy.bundle_enabled,
            trace_file_path: self.inner.trace_file_path.to_string_lossy().into_owned(),
            trace_family_size: if policy.local_file_enabled {
                trace_family_size(&self.inner.trace_file_path)
            } else {
                0
            },
            disabled_reason: policy.disabled_reason,
        }
    }

    pub(crate) fn trace(&self) -> DiagnosticsTrace {
        self.inner.trace.clone()
    }

    pub(crate) async fn collect(
        &self,
        lookback_minutes: Option<u32>,
    ) -> Result<DiagnosticBundle, SupportDiagnosticsError> {
        let material = self.collect_material(lookback_minutes).await?;
        let preview_file_path = self
            .inner
            .preview_directory
            .join(format!("{}.ndjson", material.bundle_submission_id));
        let prepared = write_preview(preview_file_path, material.payload).await?;
        let created_at = Instant::now();
        {
            let mut state = lock(&self.inner.state);
            prune_expired(&mut state);
            while state.pending.len() >= MAX_PENDING_BUNDLES {
                let Some(oldest) = state.order.pop_front() else {
                    break;
                };
                remove_pending(&mut state, &oldest);
            }
            let preview_file_path = prepared.commit();
            state.order.push_back(material.bundle_submission_id.clone());
            state.pending.insert(
                material.bundle_submission_id.clone(),
                PendingBundle {
                    bytes: material.bytes,
                    created_at,
                    excerpt: material.excerpt,
                    excerpt_truncated: material.excerpt_truncated,
                    preview_file_path,
                    preview_opened: false,
                    span_count: material.span_count,
                    uploading: false,
                },
            );
        }
        schedule_expiration(
            Arc::downgrade(&self.inner),
            material.bundle_submission_id.clone(),
            created_at,
        );
        Ok(DiagnosticBundle {
            bundle_submission_id: material.bundle_submission_id,
            bytes: material.bytes,
            span_count: material.span_count,
        })
    }

    // Why: crash submission already carries explicit log consent and must not create
    // an unused preview or consume a slot from the separate review-before-upload flow.
    pub(crate) async fn collect_report(
        &self,
        lookback_minutes: Option<u32>,
    ) -> Result<SupportDiagnosticReport, SupportDiagnosticsError> {
        let material = self.collect_material(lookback_minutes).await?;
        Ok(SupportDiagnosticReport {
            bundle_submission_id: material.bundle_submission_id,
            bytes: material.bytes,
            excerpt: material.excerpt,
            excerpt_truncated: material.excerpt_truncated,
            span_count: material.span_count,
        })
    }

    async fn collect_material(
        &self,
        lookback_minutes: Option<u32>,
    ) -> Result<BundleMaterial, SupportDiagnosticsError> {
        if !self.status().bundle_enabled {
            return Err(SupportDiagnosticsError::CollectionDisabled);
        }
        self.inner.trace.flush();
        let permit = self
            .inner
            .collect_admission
            .clone()
            .acquire_owned()
            .await
            .map_err(|_| io::Error::other("diagnostic collection is unavailable"))?;
        Ok(collect(
            self.inner.trace_file_path.clone(),
            self.inner.app_version.clone(),
            lookback_minutes.map(|value| value.clamp(1, MAX_LOOKBACK_MINUTES)),
            permit,
        )
        .await?)
    }

    pub(crate) async fn open_preview(
        &self,
        bundle_submission_id: &str,
    ) -> Result<(), SupportDiagnosticsError> {
        let preview_file_path = {
            let mut state = lock(&self.inner.state);
            require_pending(&mut state, bundle_submission_id)?
                .preview_file_path
                .clone()
        };
        if !preview_file_can_open(&preview_file_path)
            || !self
                .inner
                .shell_platform
                .open_file_path(&preview_file_path.to_string_lossy())
                .await
        {
            return Err(SupportDiagnosticsError::OpenFailed);
        }
        let mut state = lock(&self.inner.state);
        require_pending(&mut state, bundle_submission_id)?.preview_opened = true;
        Ok(())
    }

    pub(crate) fn discard(
        &self,
        bundle_submission_id: &str,
    ) -> Result<(), SupportDiagnosticsError> {
        validate_bundle_id(bundle_submission_id)?;
        remove_pending(&mut lock(&self.inner.state), bundle_submission_id);
        Ok(())
    }

    pub(crate) async fn upload(
        &self,
        bundle_submission_id: &str,
    ) -> Result<DiagnosticUpload, SupportDiagnosticsError> {
        let report = {
            let mut state = lock(&self.inner.state);
            let pending = require_pending(&mut state, bundle_submission_id)?;
            if !pending.preview_opened {
                return Err(SupportDiagnosticsError::PreviewNotOpened);
            }
            if pending.uploading {
                return Err(SupportDiagnosticsError::AlreadyUploading);
            }
            SupportDiagnosticReport {
                bundle_submission_id: bundle_submission_id.to_owned(),
                bytes: pending.bytes,
                excerpt: pending.excerpt.clone(),
                excerpt_truncated: pending.excerpt_truncated,
                span_count: pending.span_count,
            }
        };
        if !self.status().bundle_enabled {
            return Err(SupportDiagnosticsError::UploadDisabled);
        }
        {
            let mut state = lock(&self.inner.state);
            let pending = require_pending(&mut state, bundle_submission_id)?;
            if pending.uploading {
                return Err(SupportDiagnosticsError::AlreadyUploading);
            }
            pending.uploading = true;
        }
        let mut guard = UploadGuard {
            bundle_submission_id: bundle_submission_id.to_owned(),
            inner: Arc::downgrade(&self.inner),
            is_finished: false,
        };
        let ticket_id = self
            .inner
            .telemetry
            .submit_diagnostic_report(report)
            .await?;
        remove_pending(&mut lock(&self.inner.state), bundle_submission_id);
        guard.is_finished = true;
        Ok(DiagnosticUpload { ticket_id })
    }
}

impl Drop for UploadGuard {
    fn drop(&mut self) {
        if self.is_finished {
            return;
        }
        let Some(inner) = self.inner.upgrade() else {
            return;
        };
        if let Some(pending) = lock(&inner.state)
            .pending
            .get_mut(&self.bundle_submission_id)
        {
            pending.uploading = false;
        }
    }
}

fn require_pending<'a>(
    state: &'a mut State,
    bundle_submission_id: &str,
) -> Result<&'a mut PendingBundle, SupportDiagnosticsError> {
    validate_bundle_id(bundle_submission_id)?;
    prune_expired(state);
    state
        .pending
        .get_mut(bundle_submission_id)
        .ok_or(SupportDiagnosticsError::Expired)
}

fn validate_bundle_id(value: &str) -> Result<(), SupportDiagnosticsError> {
    if valid_bundle_submission_id(value) {
        Ok(())
    } else {
        Err(SupportDiagnosticsError::InvalidBundleId)
    }
}

fn prune_expired(state: &mut State) {
    let now = Instant::now();
    let expired = state
        .pending
        .iter()
        .filter(|(_, pending)| now.duration_since(pending.created_at) > BUNDLE_TTL)
        .map(|(id, _)| id.clone())
        .collect::<Vec<_>>();
    for id in expired {
        remove_pending(state, &id);
    }
}

fn remove_pending(state: &mut State, bundle_submission_id: &str) {
    state.order.retain(|id| id != bundle_submission_id);
    if let Some(pending) = state.pending.remove(bundle_submission_id) {
        remove_file(&pending.preview_file_path);
    }
}

fn schedule_expiration(inner: Weak<Inner>, bundle_submission_id: String, created_at: Instant) {
    tokio::spawn(async move {
        tokio::time::sleep(BUNDLE_TTL).await;
        let Some(inner) = inner.upgrade() else {
            return;
        };
        let mut state = lock(&inner.state);
        if state
            .pending
            .get(&bundle_submission_id)
            .is_some_and(|pending| pending.created_at == created_at)
        {
            remove_pending(&mut state, &bundle_submission_id);
        }
    });
}

fn cleanup_abandoned_previews(directory: &Path) {
    let Ok(metadata) = std::fs::symlink_metadata(directory) else {
        return;
    };
    if !metadata.file_type().is_dir() {
        return;
    }
    let Ok(entries) = std::fs::read_dir(directory) else {
        return;
    };
    for path in entries.filter_map(Result::ok).map(|entry| entry.path()) {
        if abandoned_preview_file_is_safe(&path) {
            remove_file(&path);
        }
    }
}

fn preview_directory(user_data_path: &Path) -> PathBuf {
    let mut digest = Sha256::new();
    update_preview_scope(&mut digest, user_data_path);
    let scope = URL_SAFE_NO_PAD.encode(&digest.finalize()[..12]);
    std::env::temp_dir()
        .join("agentstart-diagnostic-bundle-previews")
        .join(scope)
}

#[cfg(unix)]
fn update_preview_scope(digest: &mut Sha256, user_data_path: &Path) {
    use std::os::unix::ffi::OsStrExt;

    digest.update(user_data_path.as_os_str().as_bytes());
}

#[cfg(windows)]
fn update_preview_scope(digest: &mut Sha256, user_data_path: &Path) {
    use std::os::windows::ffi::OsStrExt;

    for code_unit in user_data_path.as_os_str().encode_wide() {
        digest.update(code_unit.to_le_bytes());
    }
}

#[cfg(not(any(unix, windows)))]
fn update_preview_scope(digest: &mut Sha256, user_data_path: &Path) {
    digest.update(user_data_path.as_os_str().to_string_lossy().as_bytes());
}

fn lock<T>(mutex: &Mutex<T>) -> MutexGuard<'_, T> {
    mutex
        .lock()
        .unwrap_or_else(std::sync::PoisonError::into_inner)
}
