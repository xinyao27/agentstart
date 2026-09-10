mod download;
mod install_command;
mod model;
pub(crate) mod restart;
#[cfg(target_os = "macos")]
mod signature;
mod target;
mod version;

use std::collections::HashMap;
use std::path::{Path, PathBuf};
use std::sync::Arc;
use std::time::{Duration, SystemTime, UNIX_EPOCH};

use reqwest::header::{ACCEPT, HeaderMap, HeaderValue, USER_AGENT};
use reqwest::redirect::Policy;
use thiserror::Error;
use tokio::sync::{Mutex, OnceCell};

use model::{CachedRelease, GitHubRelease, ReleaseDownload};
pub(crate) use model::{PreparedUpdate, UpdateInstallResult, UpdateStatus};

const CACHE_TTL_MS: i128 = 6 * 60 * 60 * 1_000;
const CHECKSUM_ASSET_NAME: &str = "agentstart-checksums.txt";
const RELEASE_ENDPOINT: &str = "https://api.github.com/repos/xinyao27/agentstart/releases/latest";
const CHECK_REQUEST_TIMEOUT: Duration = Duration::from_secs(8);
const MAX_RELEASE_RESPONSE_BYTES: u64 = 8 * 1024 * 1024;
const RELEASES_ENDPOINT: &str =
    "https://api.github.com/repos/xinyao27/agentstart/releases?per_page=100";
pub(super) const CHECKSUM_TIMEOUT: Duration = Duration::from_secs(10);
pub(super) const DOWNLOAD_TIMEOUT: Duration = Duration::from_secs(60);

#[derive(Clone)]
pub(crate) struct UpdateChecker {
    state: Arc<UpdateState>,
}

struct UpdateState {
    cache: Mutex<HashMap<UpdateCheckOptions, CachedRelease>>,
    client: OnceCell<reqwest::Client>,
    current_version: String,
    executable: PathBuf,
}

#[derive(Clone, Copy, Debug, Eq, PartialEq)]
pub(crate) enum UpdateSupport {
    Available,
    ManualService,
    Unpackaged,
    Unavailable,
}

#[derive(Clone, Copy, Debug, Default, Eq, Hash, PartialEq)]
pub(crate) struct UpdateCheckOptions {
    pub(crate) include_perf_prerelease: bool,
    pub(crate) include_prerelease: bool,
}

#[derive(Clone)]
pub(crate) struct UpdateSelection {
    download: ReleaseDownload,
}

impl UpdateSelection {
    pub(crate) fn version(&self) -> &str {
        &self.download.version
    }
}

#[derive(Debug, Error)]
pub(crate) enum UpdateError {
    #[error("daemon executable path is unavailable: {0}")]
    CurrentExecutable(#[source] std::io::Error),
    #[error("daemon update HTTP client could not be created: {0}")]
    HttpClient(#[source] reqwest::Error),
    #[error("daemon update request failed: {0}")]
    Request(#[source] reqwest::Error),
    #[error("daemon update download failed: {0}")]
    DownloadRequest(#[source] reqwest::Error),
    #[error("daemon_update_check_failed:{0}")]
    Status(u16),
    #[error("daemon_update_release_invalid")]
    InvalidRelease,
    #[error("daemon_update_release_response_too_large")]
    ReleaseResponseTooLarge,
    #[error("daemon_update_current_version_invalid")]
    CurrentVersionInvalid,
    #[error("daemon_update_insecure_url")]
    InsecureUrl,
    #[error("daemon_update_artifact_unavailable")]
    ArtifactUnavailable,
    #[error("daemon_update_artifact_too_large")]
    ArtifactTooLarge,
    #[error("daemon_update_checksum_missing")]
    ChecksumMissing,
    #[error("daemon_update_checksum_ambiguous")]
    ChecksumAmbiguous,
    #[error("daemon_update_checksum_mismatch")]
    ChecksumMismatch,
    #[cfg(target_os = "macos")]
    #[error("daemon_update_signature_invalid:{0}")]
    SignatureInvalid(String),
    #[cfg(target_os = "macos")]
    #[error("daemon_update_signature_io_failed:{0}")]
    SignatureIo(#[source] std::io::Error),
    #[cfg(target_os = "macos")]
    #[error("daemon_update_signature_output_too_large")]
    SignatureOutputTooLarge,
    #[cfg(target_os = "macos")]
    #[error("daemon_update_signature_timeout")]
    SignatureTimeout,
    #[error("daemon_update_computer_use_helper_failed:{0}")]
    ComputerUseHelper(String),
    #[error("daemon_update_development_build")]
    DevelopmentBuild,
    #[error("daemon_update_use_npm")]
    UseNpm,
    #[error("daemon_update_requires_app_update: update the complete AgentStart app")]
    AppUpdateRequired,
    #[error("daemon_update_use_homebrew")]
    UseHomebrew,
    #[error("daemon_update_platform_unsupported")]
    PlatformUnsupported,
    #[error("daemon_update_executable_directory_unavailable")]
    ExecutableDirectory,
    #[error("daemon_update_executable_name_unavailable")]
    ExecutableName,
    #[error("daemon_update_io_failed:{0}")]
    Io(#[source] std::io::Error),
    #[error("daemon_update_entropy_failed:{0}")]
    Random(#[from] getrandom::Error),
    #[error("daemon_update_replacement_launch_failed:{0}")]
    ReplacementLaunch(#[source] std::io::Error),
    #[error("daemon_update_service_failed:{0}")]
    Service(String),
    #[error("daemon update clock is before the Unix epoch: {0}")]
    Clock(#[from] std::time::SystemTimeError),
}

impl UpdateError {
    pub(crate) fn code(&self) -> &str {
        match self {
            Self::CurrentExecutable(_) => "daemon_update_executable_unavailable",
            Self::HttpClient(_) => "daemon_update_http_client_unavailable",
            Self::Request(_) => "daemon_update_request_failed",
            Self::DownloadRequest(_) => "daemon_update_download_failed",
            Self::Status(_) => "daemon_update_check_failed",
            Self::InvalidRelease => "daemon_update_release_invalid",
            Self::ReleaseResponseTooLarge => "daemon_update_release_response_too_large",
            Self::CurrentVersionInvalid => "daemon_update_current_version_invalid",
            Self::InsecureUrl => "daemon_update_insecure_url",
            Self::ArtifactUnavailable => "daemon_update_artifact_unavailable",
            Self::ArtifactTooLarge => "daemon_update_artifact_too_large",
            Self::ChecksumMissing => "daemon_update_checksum_missing",
            Self::ChecksumAmbiguous => "daemon_update_checksum_ambiguous",
            Self::ChecksumMismatch => "daemon_update_checksum_mismatch",
            #[cfg(target_os = "macos")]
            Self::SignatureInvalid(_) => "daemon_update_signature_invalid",
            #[cfg(target_os = "macos")]
            Self::SignatureIo(_) => "daemon_update_signature_io_failed",
            #[cfg(target_os = "macos")]
            Self::SignatureOutputTooLarge => "daemon_update_signature_output_too_large",
            #[cfg(target_os = "macos")]
            Self::SignatureTimeout => "daemon_update_signature_timeout",
            Self::ComputerUseHelper(_) => "daemon_update_computer_use_helper_failed",
            Self::DevelopmentBuild => "daemon_update_development_build",
            Self::UseNpm => "daemon_update_use_npm",
            Self::AppUpdateRequired => "daemon_update_requires_app_update",
            Self::UseHomebrew => "daemon_update_use_homebrew",
            Self::PlatformUnsupported => "daemon_update_platform_unsupported",
            Self::ExecutableDirectory => "daemon_update_executable_directory_unavailable",
            Self::ExecutableName => "daemon_update_executable_name_unavailable",
            Self::Io(_) => "daemon_update_io_failed",
            Self::Random(_) => "daemon_update_entropy_failed",
            Self::ReplacementLaunch(_) => "daemon_update_replacement_launch_failed",
            Self::Service(_) => "daemon_update_service_failed",
            Self::Clock(_) => "daemon_update_clock_failed",
        }
    }
}

impl UpdateChecker {
    pub(crate) fn new() -> Result<Self, UpdateError> {
        let executable = std::env::current_exe().map_err(UpdateError::CurrentExecutable)?;
        let current_version = std::env::var("AGENTSTART_APP_VERSION")
            .unwrap_or_else(|_| env!("CARGO_PKG_VERSION").to_owned());
        Ok(Self {
            state: Arc::new(UpdateState {
                cache: Mutex::new(HashMap::new()),
                client: OnceCell::new(),
                current_version,
                executable,
            }),
        })
    }

    pub(crate) fn current_version(&self) -> &str {
        &self.state.current_version
    }

    pub(crate) fn support(&self) -> UpdateSupport {
        if !version::is_valid(&self.state.current_version)
            || target::is_development_build(&self.state.executable, &self.state.current_version)
        {
            return UpdateSupport::Unpackaged;
        }
        if crate::paths::containing_app(&self.state.executable).is_some()
            || target::is_npm_install(&self.state.executable)
            || target::is_homebrew_install(&self.state.executable)
        {
            return UpdateSupport::ManualService;
        }
        if target::release_asset_name().is_err() {
            return UpdateSupport::Unavailable;
        }
        UpdateSupport::Available
    }

    pub(crate) async fn check(&self, force: bool) -> Result<UpdateStatus, UpdateError> {
        self.check_with_options(force, UpdateCheckOptions::default())
            .await
    }

    pub(crate) async fn check_with_options(
        &self,
        force: bool,
        options: UpdateCheckOptions,
    ) -> Result<UpdateStatus, UpdateError> {
        Ok(self.resolve_release(force, options).await?.status)
    }

    pub(crate) async fn check_selected(
        &self,
        force: bool,
        options: UpdateCheckOptions,
    ) -> Result<(UpdateStatus, Option<UpdateSelection>), UpdateError> {
        let release = self.resolve_release(force, options).await?;
        Ok((
            release.status,
            release
                .download
                .map(|download| UpdateSelection { download }),
        ))
    }

    pub(crate) async fn prepare(
        &self,
        force: bool,
        options: UpdateCheckOptions,
        on_progress: impl FnMut(u8),
    ) -> Result<Option<PreparedUpdate>, UpdateError> {
        self.assert_self_update_supported()?;
        let release = self.resolve_release(force, options).await?;
        if !release.status.update_available {
            return Ok(None);
        }
        let download = release.download.ok_or(UpdateError::ArtifactUnavailable)?;
        self.prepare_selected(UpdateSelection { download }, on_progress)
            .await
            .map(Some)
    }

    pub(crate) async fn prepare_selected(
        &self,
        selection: UpdateSelection,
        on_progress: impl FnMut(u8),
    ) -> Result<PreparedUpdate, UpdateError> {
        self.assert_self_update_supported()?;
        download::prepare(
            self.client().await?,
            &self.state.executable,
            selection.download,
            on_progress,
        )
        .await
    }

    pub(crate) async fn install_prepared(
        &self,
        prepared: PreparedUpdate,
    ) -> Result<UpdateInstallResult, UpdateError> {
        self.assert_self_update_supported()?;
        let version = prepared.version().to_owned();
        crate::entry::install_computer_use_helper(&version)
            .await
            .map_err(|error| UpdateError::ComputerUseHelper(error.to_string()))?;
        #[cfg(target_os = "macos")]
        signature::verify(prepared.staging()).await?;
        crate::atomic_file_replace::replace_async(prepared.staging(), prepared.executable())
            .await
            .map_err(UpdateError::Io)?;
        sync_parent(prepared.executable()).await?;
        Ok(UpdateInstallResult {
            installed: true,
            version,
        })
    }

    pub(crate) async fn install_latest(
        &self,
        on_progress: impl FnMut(u8),
    ) -> Result<UpdateInstallResult, UpdateError> {
        let Some(prepared) = self
            .prepare(true, UpdateCheckOptions::default(), on_progress)
            .await?
        else {
            return Ok(UpdateInstallResult {
                installed: false,
                version: self.state.current_version.clone(),
            });
        };
        self.install_prepared(prepared).await
    }

    async fn resolve_release(
        &self,
        force: bool,
        options: UpdateCheckOptions,
    ) -> Result<CachedRelease, UpdateError> {
        if !version::is_valid(&self.state.current_version) {
            return Err(UpdateError::CurrentVersionInvalid);
        }
        // Why: one lock coalesces simultaneous checks and makes a forced refresh the single writer
        // of the cache instead of racing an older response into the updater's download decision.
        let mut cache = self.state.cache.lock().await;
        let now = epoch_millis()?;
        if !force
            && let Some(cached) = cache.get(&options)
            && i128::from(now) - i128::from(cached.status.checked_at) < CACHE_TTL_MS
        {
            return Ok(cached.clone());
        }
        let release = self.fetch_release(options).await?;
        let latest_version = version::release_version(release.tag_name.as_deref())
            .ok_or(UpdateError::InvalidRelease)?;
        let release_url = release
            .html_url
            .as_ref()
            .filter(|url| ensure_https(url).is_ok())
            .cloned();
        let update_available = version::is_newer(&latest_version, &self.state.current_version);
        let download = if update_available && self.support() == UpdateSupport::Available {
            Some(resolve_download(
                &release,
                &latest_version,
                release_url.clone(),
            )?)
        } else {
            None
        };
        let status = UpdateStatus {
            checked_at: epoch_millis()?,
            current_version: self.state.current_version.clone(),
            install_command: install_command::resolve(&self.state.executable).to_owned(),
            latest_version: Some(latest_version),
            release_url,
            update_available,
        };
        let release = CachedRelease { download, status };
        cache.insert(options, release.clone());
        Ok(release)
    }

    async fn fetch_release(
        &self,
        options: UpdateCheckOptions,
    ) -> Result<GitHubRelease, UpdateError> {
        let endpoint = if options == UpdateCheckOptions::default() {
            RELEASE_ENDPOINT
        } else {
            RELEASES_ENDPOINT
        };
        let response = self
            .client()
            .await?
            .get(endpoint)
            .timeout(CHECK_REQUEST_TIMEOUT)
            .send()
            .await
            .map_err(UpdateError::Request)?;
        if !response.status().is_success() {
            return Err(UpdateError::Status(response.status().as_u16()));
        }
        let bytes = read_bounded_release(response).await?;
        if options == UpdateCheckOptions::default() {
            let release = serde_json::from_slice::<GitHubRelease>(&bytes)
                .map_err(|_| UpdateError::InvalidRelease)?;
            return release_candidate(&release, options)
                .is_some()
                .then_some(release)
                .ok_or(UpdateError::InvalidRelease);
        }
        let releases = serde_json::from_slice::<Vec<GitHubRelease>>(&bytes)
            .map_err(|_| UpdateError::InvalidRelease)?;
        select_release(releases, options).ok_or(UpdateError::ArtifactUnavailable)
    }

    fn assert_self_update_supported(&self) -> Result<(), UpdateError> {
        match self.support() {
            UpdateSupport::Available => Ok(()),
            UpdateSupport::ManualService
                if crate::paths::containing_app(&self.state.executable).is_some() =>
            {
                Err(UpdateError::AppUpdateRequired)
            }
            UpdateSupport::ManualService if target::is_npm_install(&self.state.executable) => {
                Err(UpdateError::UseNpm)
            }
            UpdateSupport::ManualService => Err(UpdateError::UseHomebrew),
            UpdateSupport::Unpackaged => Err(UpdateError::DevelopmentBuild),
            UpdateSupport::Unavailable => Err(UpdateError::PlatformUnsupported),
        }
    }

    async fn client(&self) -> Result<&reqwest::Client, UpdateError> {
        self.state
            .client
            .get_or_try_init(|| async {
                let mut headers = HeaderMap::new();
                headers.insert(
                    ACCEPT,
                    HeaderValue::from_static("application/vnd.github+json"),
                );
                headers.insert(USER_AGENT, HeaderValue::from_static("agentstart-daemon"));
                reqwest::Client::builder()
                    .default_headers(headers)
                    .redirect(Policy::custom(|attempt| {
                        if attempt.url().scheme() == "https" && attempt.previous().len() < 10 {
                            attempt.follow()
                        } else {
                            attempt.stop()
                        }
                    }))
                    .build()
                    .map_err(UpdateError::HttpClient)
            })
            .await
    }
}

fn resolve_download(
    release: &GitHubRelease,
    version: &str,
    release_url: Option<String>,
) -> Result<ReleaseDownload, UpdateError> {
    let binary_name = target::release_asset_name()?;
    let binary_url = release
        .assets
        .iter()
        .find(|asset| asset.name == binary_name)
        .map(|asset| asset.browser_download_url.clone())
        .ok_or(UpdateError::ArtifactUnavailable)?;
    let checksums_url = release
        .assets
        .iter()
        .find(|asset| asset.name == CHECKSUM_ASSET_NAME)
        .map(|asset| asset.browser_download_url.clone())
        .ok_or(UpdateError::ArtifactUnavailable)?;
    ensure_https(&binary_url)?;
    ensure_https(&checksums_url)?;
    Ok(ReleaseDownload {
        binary_url,
        checksums_url,
        release_url,
        version: version.to_owned(),
    })
}

async fn read_bounded_release(mut response: reqwest::Response) -> Result<Vec<u8>, UpdateError> {
    if response
        .content_length()
        .is_some_and(|length| length > MAX_RELEASE_RESPONSE_BYTES)
    {
        return Err(UpdateError::ReleaseResponseTooLarge);
    }
    let mut bytes = Vec::new();
    while let Some(chunk) = response.chunk().await.map_err(UpdateError::Request)? {
        let next_length = u64::try_from(bytes.len())
            .unwrap_or(u64::MAX)
            .saturating_add(u64::try_from(chunk.len()).unwrap_or(u64::MAX));
        if next_length > MAX_RELEASE_RESPONSE_BYTES {
            return Err(UpdateError::ReleaseResponseTooLarge);
        }
        bytes.extend_from_slice(&chunk);
    }
    Ok(bytes)
}

fn select_release(
    releases: Vec<GitHubRelease>,
    options: UpdateCheckOptions,
) -> Option<GitHubRelease> {
    releases
        .into_iter()
        .filter_map(|release| {
            release_candidate(&release, options).map(|version| (release, version))
        })
        .max_by(|(_, left), (_, right)| {
            version::compare_versions(left, right).unwrap_or(std::cmp::Ordering::Equal)
        })
        .map(|(release, _)| release)
}

fn release_candidate(release: &GitHubRelease, options: UpdateCheckOptions) -> Option<String> {
    if release.draft {
        return None;
    }
    let version = version::release_version(release.tag_name.as_deref())?;
    let is_prerelease = version::is_prerelease(&version);
    if release.prerelease != is_prerelease {
        return None;
    }
    if !is_prerelease {
        return Some(version);
    }
    if version::is_perf(&version) {
        options.include_perf_prerelease.then_some(version)
    } else {
        options.include_prerelease.then_some(version)
    }
}

fn ensure_https(value: &str) -> Result<(), UpdateError> {
    let url = url::Url::parse(value).map_err(|_| UpdateError::InsecureUrl)?;
    if url.scheme() != "https" || url.host_str().is_none() {
        return Err(UpdateError::InsecureUrl);
    }
    Ok(())
}

async fn sync_parent(executable: &Path) -> Result<(), UpdateError> {
    #[cfg(unix)]
    {
        let parent = executable
            .parent()
            .ok_or(UpdateError::ExecutableDirectory)?;
        tokio::fs::File::open(parent)
            .await
            .map_err(UpdateError::Io)?
            .sync_all()
            .await
            .map_err(UpdateError::Io)?;
    }
    Ok(())
}

fn epoch_millis() -> Result<u64, UpdateError> {
    Ok(SystemTime::now()
        .duration_since(UNIX_EPOCH)?
        .as_millis()
        .try_into()
        .unwrap_or(u64::MAX))
}
