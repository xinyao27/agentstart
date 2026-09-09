use std::path::Path;
use std::sync::{Arc, Mutex as SyncMutex};

use serde::Serialize;
use thiserror::Error;
use tokio::sync::{Mutex, OwnedMutexGuard, watch};

use crate::update::restart::{RestartMode, request_runtime_restart, runtime_mode};
use crate::update::{
    PreparedUpdate, UpdateCheckOptions, UpdateChecker, UpdateError, UpdateSelection, UpdateSupport,
};

#[derive(Clone)]
pub(crate) struct DaemonUpdater {
    state: Arc<DaemonUpdaterState>,
}

struct DaemonUpdaterState {
    operation: Arc<Mutex<()>>,
    prepared: SyncMutex<Option<PreparedUpdate>>,
    restart_mode: RestartMode,
    selection: SyncMutex<Option<UpdateSelection>>,
    snapshot: watch::Sender<DaemonUpdaterSnapshot>,
    updates: UpdateChecker,
}

#[derive(Clone, Debug)]
pub(crate) struct DaemonUpdaterSnapshot {
    pub(crate) app_version: String,
    pub(crate) runtime_id: String,
    pub(crate) support: DaemonUpdaterSupport,
    pub(crate) status: DaemonUpdaterStatus,
}

#[derive(Clone, Debug, Serialize)]
#[serde(rename_all = "camelCase")]
pub(crate) struct DaemonUpdaterSupport {
    pub(crate) automatic: bool,
    pub(crate) install_mode: DaemonUpdaterInstallMode,
    pub(crate) reason: DaemonUpdaterSupportReason,
}

#[derive(Clone, Copy, Debug, Serialize)]
#[serde(rename_all = "kebab-case")]
pub(crate) enum DaemonUpdaterInstallMode {
    SupervisedHeadlessServe,
    UnsupportedHeadlessServe,
}

#[derive(Clone, Copy, Debug, Serialize)]
#[serde(rename_all = "kebab-case")]
pub(crate) enum DaemonUpdaterSupportReason {
    Available,
    ManualServiceUpdateRequired,
    UnpackagedBuild,
    UpdaterUnavailable,
}

#[derive(Clone, Debug)]
pub(crate) enum DaemonUpdaterStatus {
    Idle,
    Checking {
        user_initiated: bool,
    },
    Available {
        changelog: Option<DaemonUpdaterChangelog>,
        release_url: Option<String>,
        version: String,
    },
    NotAvailable {
        user_initiated: bool,
    },
    Downloading {
        percent: u8,
        version: String,
    },
    Downloaded {
        release_url: Option<String>,
        version: String,
    },
    Error {
        message: String,
        user_initiated: Option<bool>,
    },
}

#[derive(Clone, Debug)]
pub(crate) struct DaemonUpdaterChangelog {
    pub(crate) release: DaemonUpdaterChangelogRelease,
    pub(crate) releases_behind: Option<i64>,
}

#[derive(Clone, Debug)]
pub(crate) struct DaemonUpdaterChangelogRelease {
    pub(crate) title: String,
    pub(crate) description: String,
    pub(crate) media_url: Option<String>,
    pub(crate) release_notes_url: String,
}

#[derive(Debug)]
pub(crate) struct DaemonUpdaterInstallResult {
    pub(crate) accepted: bool,
    pub(crate) from_version: String,
    pub(crate) runtime_id: String,
    pub(crate) target_version: String,
}

pub(crate) struct DaemonUpdaterPendingInstall {
    operation: Option<OwnedMutexGuard<()>>,
    prepared: Option<PreparedUpdate>,
    updater: DaemonUpdater,
}

#[derive(Debug, Error)]
pub(crate) enum DaemonUpdaterError {
    #[error("remote_update_manual_required")]
    ManualRequired,
    #[error("remote_update_not_available")]
    NotAvailable,
    #[error("remote_update_not_downloaded")]
    NotDownloaded,
    #[error("remote_update_in_progress")]
    InProgress,
    #[error("remote_update_invalid_state")]
    InvalidState,
    #[error(transparent)]
    Update(#[from] UpdateError),
}

impl DaemonUpdaterError {
    pub(crate) fn code(&self) -> &str {
        match self {
            Self::ManualRequired => "remote_update_manual_required",
            Self::NotAvailable => "remote_update_not_available",
            Self::NotDownloaded => "remote_update_not_downloaded",
            Self::InProgress => "remote_update_in_progress",
            Self::InvalidState => "remote_update_invalid_state",
            Self::Update(error) => error.code(),
        }
    }
}

impl DaemonUpdater {
    pub(crate) fn new(runtime_id: String, updates: UpdateChecker, user_data_path: &Path) -> Self {
        let support = support_snapshot(updates.support());
        let snapshot = DaemonUpdaterSnapshot {
            app_version: updates.current_version().to_owned(),
            runtime_id,
            support,
            status: DaemonUpdaterStatus::Idle,
        };
        let (snapshot, _) = watch::channel(snapshot);
        Self {
            state: Arc::new(DaemonUpdaterState {
                operation: Arc::new(Mutex::new(())),
                prepared: SyncMutex::new(None),
                restart_mode: runtime_mode(user_data_path),
                selection: SyncMutex::new(None),
                snapshot,
                updates,
            }),
        }
    }

    pub(crate) fn snapshot(&self) -> DaemonUpdaterSnapshot {
        self.state.snapshot.borrow().clone()
    }

    pub(crate) fn support(&self) -> DaemonUpdaterSupport {
        self.state.snapshot.borrow().support.clone()
    }

    pub(crate) fn subscribe(&self) -> watch::Receiver<DaemonUpdaterSnapshot> {
        self.state.snapshot.subscribe()
    }

    pub(crate) async fn check(
        &self,
        options: UpdateCheckOptions,
    ) -> Result<DaemonUpdaterSnapshot, DaemonUpdaterError> {
        self.require_automatic()?;
        let _operation = self.acquire_operation()?;
        if matches!(
            self.snapshot().status,
            DaemonUpdaterStatus::Downloaded { .. }
        ) {
            return Err(DaemonUpdaterError::InvalidState);
        }
        self.clear_prepared();
        self.clear_selection();
        self.set_status(DaemonUpdaterStatus::Checking {
            user_initiated: true,
        });
        match self.state.updates.check_selected(true, options).await {
            Ok((status, selection)) if status.update_available => {
                let Some(version) = status.latest_version else {
                    return self.fail(UpdateError::InvalidRelease.into(), Some(true));
                };
                let Some(selection) = selection.filter(|selection| selection.version() == version)
                else {
                    return self.fail(UpdateError::ArtifactUnavailable.into(), Some(true));
                };
                *self
                    .state
                    .selection
                    .lock()
                    .unwrap_or_else(|poisoned| poisoned.into_inner()) = Some(selection);
                self.set_status(DaemonUpdaterStatus::Available {
                    changelog: None,
                    release_url: status.release_url,
                    version,
                });
                Ok(self.snapshot())
            }
            Ok((_, _)) => {
                self.set_status(DaemonUpdaterStatus::NotAvailable {
                    user_initiated: true,
                });
                Ok(self.snapshot())
            }
            Err(error) => self.fail(error.into(), Some(true)),
        }
    }

    pub(crate) fn download(&self) -> Result<DaemonUpdaterSnapshot, DaemonUpdaterError> {
        self.require_automatic()?;
        let operation = self.acquire_operation()?;
        let version = match self.snapshot().status {
            DaemonUpdaterStatus::Available { version, .. } => version,
            _ => return Err(DaemonUpdaterError::NotAvailable),
        };
        let selection = self
            .state
            .selection
            .lock()
            .unwrap_or_else(|poisoned| poisoned.into_inner())
            .take()
            .ok_or(DaemonUpdaterError::NotAvailable)?;
        self.set_status(DaemonUpdaterStatus::Downloading {
            percent: 0,
            version: version.clone(),
        });
        let updater = self.clone();
        tokio::spawn(async move {
            updater
                .complete_download(operation, version, selection)
                .await;
        });
        Ok(self.snapshot())
    }

    async fn complete_download(
        &self,
        _operation: OwnedMutexGuard<()>,
        version: String,
        selection: UpdateSelection,
    ) {
        let updater = self.clone();
        let progress_version = version.clone();
        let prepared = self
            .state
            .updates
            .prepare_selected(selection, move |percent| {
                updater.set_status(DaemonUpdaterStatus::Downloading {
                    percent,
                    version: progress_version.clone(),
                });
            })
            .await;
        let prepared = match prepared {
            Ok(prepared) if prepared.version() == version => prepared,
            Ok(_) => {
                let _ = self.fail::<()>(DaemonUpdaterError::NotAvailable, None);
                return;
            }
            Err(error) => {
                let _ = self.fail::<()>(error.into(), None);
                return;
            }
        };
        let release_url = prepared.release_url().map(str::to_owned);
        *self
            .state
            .prepared
            .lock()
            .unwrap_or_else(|poisoned| poisoned.into_inner()) = Some(prepared);
        self.set_status(DaemonUpdaterStatus::Downloaded {
            release_url,
            version,
        });
    }

    pub(crate) fn begin_install(
        &self,
    ) -> Result<(DaemonUpdaterInstallResult, DaemonUpdaterPendingInstall), DaemonUpdaterError> {
        self.require_automatic()?;
        let operation = self.acquire_operation()?;
        let prepared = self
            .state
            .prepared
            .lock()
            .unwrap_or_else(|poisoned| poisoned.into_inner())
            .take()
            .ok_or(DaemonUpdaterError::NotDownloaded)?;
        let from_version = self.state.updates.current_version().to_owned();
        let target_version = prepared.version().to_owned();
        let runtime_id = self.snapshot().runtime_id;
        Ok((
            DaemonUpdaterInstallResult {
                accepted: true,
                from_version,
                runtime_id,
                target_version,
            },
            DaemonUpdaterPendingInstall {
                operation: Some(operation),
                prepared: Some(prepared),
                updater: self.clone(),
            },
        ))
    }

    async fn complete_install(&self, _operation: OwnedMutexGuard<()>, prepared: PreparedUpdate) {
        if let Err(error) = self.state.updates.install_prepared(prepared).await {
            let _ = self.fail::<()>(error.into(), None);
            return;
        }
        if let Err(error) = request_runtime_restart(self.state.restart_mode) {
            let _ = self.fail::<()>(error.into(), None);
        }
    }

    fn require_automatic(&self) -> Result<(), DaemonUpdaterError> {
        if self.support().automatic {
            Ok(())
        } else {
            Err(DaemonUpdaterError::ManualRequired)
        }
    }

    fn acquire_operation(&self) -> Result<OwnedMutexGuard<()>, DaemonUpdaterError> {
        self.state
            .operation
            .clone()
            .try_lock_owned()
            .map_err(|_| DaemonUpdaterError::InProgress)
    }

    fn clear_prepared(&self) {
        self.state
            .prepared
            .lock()
            .unwrap_or_else(|poisoned| poisoned.into_inner())
            .take();
    }

    fn clear_selection(&self) {
        self.state
            .selection
            .lock()
            .unwrap_or_else(|poisoned| poisoned.into_inner())
            .take();
    }

    fn set_status(&self, status: DaemonUpdaterStatus) {
        self.state
            .snapshot
            .send_modify(|snapshot| snapshot.status = status);
    }

    fn fail<T>(
        &self,
        error: DaemonUpdaterError,
        user_initiated: Option<bool>,
    ) -> Result<T, DaemonUpdaterError> {
        self.set_status(DaemonUpdaterStatus::Error {
            message: error.code().to_owned(),
            user_initiated,
        });
        Err(error)
    }
}

impl DaemonUpdaterPendingInstall {
    pub(crate) fn confirm(mut self) {
        let Some(operation) = self.operation.take() else {
            return;
        };
        let Some(prepared) = self.prepared.take() else {
            return;
        };
        let updater = self.updater.clone();
        tokio::spawn(async move {
            updater.complete_install(operation, prepared).await;
        });
    }
}

impl Drop for DaemonUpdaterPendingInstall {
    fn drop(&mut self) {
        let Some(prepared) = self.prepared.take() else {
            return;
        };
        *self
            .updater
            .state
            .prepared
            .lock()
            .unwrap_or_else(|poisoned| poisoned.into_inner()) = Some(prepared);
    }
}

fn support_snapshot(support: UpdateSupport) -> DaemonUpdaterSupport {
    match support {
        UpdateSupport::Available => DaemonUpdaterSupport {
            automatic: true,
            install_mode: DaemonUpdaterInstallMode::SupervisedHeadlessServe,
            reason: DaemonUpdaterSupportReason::Available,
        },
        UpdateSupport::ManualService => DaemonUpdaterSupport {
            automatic: false,
            install_mode: DaemonUpdaterInstallMode::UnsupportedHeadlessServe,
            reason: DaemonUpdaterSupportReason::ManualServiceUpdateRequired,
        },
        UpdateSupport::Unpackaged => DaemonUpdaterSupport {
            automatic: false,
            install_mode: DaemonUpdaterInstallMode::UnsupportedHeadlessServe,
            reason: DaemonUpdaterSupportReason::UnpackagedBuild,
        },
        UpdateSupport::Unavailable => DaemonUpdaterSupport {
            automatic: false,
            install_mode: DaemonUpdaterInstallMode::UnsupportedHeadlessServe,
            reason: DaemonUpdaterSupportReason::UpdaterUnavailable,
        },
    }
}
