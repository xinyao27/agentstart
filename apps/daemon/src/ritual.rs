use std::error::Error;
use std::sync::Arc;
use std::time::{Duration, SystemTime, UNIX_EPOCH};

use async_trait::async_trait;
use chrono::{DateTime, Datelike, TimeZone, Timelike, Utc};
use chrono_tz::Tz;
use futures_util::{StreamExt as _, stream};
use rusqlite::{Connection, OptionalExtension};
use serde::{Deserialize, Serialize};
use thiserror::Error;
use tokio::sync::{Mutex as AsyncMutex, oneshot, watch};

use crate::hosts::{HostCommand, HostFilesystem};
use crate::persistence::WorkspaceJournal;
use crate::projects::{ProjectCatalog, ProjectKind};
use crate::terminal_session::{
    TerminalCreateRequest, TerminalPresentation, TerminalSessionAuthority,
};
use crate::worktrees::{WorktreeArchiveAuthority, WorktreeCatalog};

const DEFAULT_END_MINUTES: u16 = 18 * 60;
const DEFAULT_START_MINUTES: u16 = 9 * 60;
const MAX_FAILURE_LENGTH: usize = 2_000;

#[derive(Clone, Debug, Deserialize, Serialize)]
#[serde(rename_all = "camelCase")]
pub(crate) struct RitualSchedule {
    pub(crate) archive_on_end_day: bool,
    pub(crate) enabled: bool,
    pub(crate) end_minutes: u16,
    pub(crate) start_minutes: u16,
    pub(crate) timezone: String,
    pub(crate) weekdays: Vec<u8>,
}

#[derive(Clone, Debug, Serialize)]
#[serde(rename_all = "camelCase")]
pub(crate) struct RitualScheduleStatus {
    pub(crate) archive_on_end_day: bool,
    pub(crate) enabled: bool,
    pub(crate) end_minutes: u16,
    pub(crate) start_minutes: u16,
    pub(crate) timezone: String,
    pub(crate) weekdays: Vec<u8>,
    pub(crate) last_end_at: Option<i64>,
    pub(crate) last_failure: Option<String>,
    pub(crate) last_start_at: Option<i64>,
}

#[derive(Clone, Debug, Serialize)]
#[serde(rename_all = "camelCase")]
pub(crate) struct RitualProjectResult {
    pub(crate) detail: String,
    pub(crate) project_id: String,
    pub(crate) status: String,
}

#[derive(Clone, Debug, Serialize)]
#[serde(rename_all = "camelCase")]
pub(crate) struct RitualRunResult {
    pub(crate) kind: String,
    pub(crate) projects: Vec<RitualProjectResult>,
    pub(crate) summary: String,
}

#[derive(Debug, Error)]
pub(crate) enum RitualError {
    #[error("ritual_schedule_invalid")]
    InvalidSchedule,
    #[error("ritual_schedule_timezone_invalid")]
    InvalidTimezone,
    #[error("ritual runner failed: {0}")]
    Runner(String),
    #[error("ritual clock failed: {0}")]
    Clock(#[from] std::time::SystemTimeError),
    #[error("ritual schedule storage failed")]
    Storage(#[source] Box<dyn Error + Send + Sync>),
    #[error("ritual schedule worker is unavailable")]
    WorkerUnavailable,
}

#[async_trait]
pub(crate) trait RitualRunner: Send + Sync {
    async fn run(
        &self,
        kind: &str,
        archive_on_end_day: bool,
        overnight_since: Option<i64>,
    ) -> Result<Vec<RitualProjectResult>, RitualError>;
}

#[derive(Clone)]
pub(crate) struct DaemonRitualRunner {
    archives: WorktreeArchiveAuthority,
    hosts: crate::host_registry::HostRegistry,
    journal: WorkspaceJournal,
    projects: ProjectCatalog,
    terminals: TerminalSessionAuthority,
    worktrees: WorktreeCatalog,
}

impl DaemonRitualRunner {
    pub(crate) fn new(
        archives: WorktreeArchiveAuthority,
        hosts: crate::host_registry::HostRegistry,
        journal: WorkspaceJournal,
        projects: ProjectCatalog,
        terminals: TerminalSessionAuthority,
        worktrees: WorktreeCatalog,
    ) -> Self {
        Self {
            archives,
            hosts,
            journal,
            projects,
            terminals,
            worktrees,
        }
    }

    async fn start_project(
        &self,
        project: &crate::projects::Project,
        overnight_since: Option<i64>,
    ) -> RitualProjectResult {
        let result = async {
            let host = self
                .hosts
                .execution_host(&project.execution_host_id)
                .await
                .map_err(|error| error.to_string())?;
            if project.kind == ProjectKind::Git {
                self.git(&host, &project.path, ["fetch", "--all", "--prune"])
                    .await?;
                self.git(&host, &project.path, ["pull", "--ff-only"])
                    .await?;
            }
            let main = self
                .worktrees
                .list_resolved()
                .await
                .map_err(|error| error.to_string())?
                .into_iter()
                .find(|worktree| worktree.repo_id == project.id && worktree.is_main_worktree);
            let run_command = read_run_command(&HostFilesystem::new(host), &project.path).await;
            let started = if let (Some(main), Some(command)) = (main, run_command) {
                self.terminals
                    .create(TerminalCreateRequest {
                        activate: false,
                        cols: 120,
                        command: Some(command),
                        cwd: None,
                        cwd_fallback: false,
                        env: Vec::new(),
                        env_to_delete: Vec::new(),
                        focus: false,
                        launch_agent: None,
                        launch_config: None,
                        launch_token: None,
                        leaf_id: None,
                        presentation: Some(TerminalPresentation::Background),
                        renderer_backed: false,
                        rows: 40,
                        split_direction: None,
                        split_from_leaf_id: None,
                        split_telemetry_source: None,
                        startup_command_delivery: None,
                        tab_id: None,
                        title: Some("Dev server".to_owned()),
                        worktree: Some(format!("id:{}", main.id)),
                    })
                    .await
                    .map_err(|error| error.to_string())?;
                true
            } else {
                false
            };
            let overnight_events = match overnight_since {
                Some(since) => self.count_events(&project.id, since).await?,
                None => 0,
            };
            self.append(
                project.id.clone(),
                "ritual.start-day.ready",
                serde_json::json!({
                    "devServerStarted": started,
                    "overnightEvents": overnight_events,
                }),
            )
            .await?;
            if overnight_since.is_some() {
                self.append(
                    project.id.clone(),
                    "ritual.overnight.summary",
                    serde_json::json!({ "overnightEvents": overnight_events }),
                )
                .await?;
            }
            Ok::<(bool, usize), String>((started, overnight_events))
        }
        .await;
        match result {
            Ok((started, overnight_events)) => RitualProjectResult {
                detail: if started {
                    format!("Updated and dev server started; {overnight_events} overnight events")
                } else {
                    format!("Updated; {overnight_events} overnight events")
                },
                project_id: project.id.clone(),
                status: "ready".to_owned(),
            },
            Err(detail) => {
                let _ = self
                    .append(
                        project.id.clone(),
                        "ritual.start-day.failed",
                        serde_json::json!({ "detail": detail }),
                    )
                    .await;
                RitualProjectResult {
                    detail,
                    project_id: project.id.clone(),
                    status: "failed".to_owned(),
                }
            }
        }
    }

    async fn end_project(
        &self,
        project: &crate::projects::Project,
        archive_on_end_day: bool,
    ) -> RitualProjectResult {
        let result = async {
            let host = self
                .hosts
                .execution_host(&project.execution_host_id)
                .await
                .map_err(|error| error.to_string())?;
            let changed_paths = if project.kind == ProjectKind::Git {
                self.git(&host, &project.path, ["status", "--short"])
                    .await?
                    .stdout
                    .lines()
                    .filter(|line| !line.is_empty())
                    .count()
            } else {
                0
            };
            let archived = if archive_on_end_day {
                self.archive_project(&project.id).await?
            } else {
                0
            };
            self.append(
                project.id.clone(),
                "ritual.end-day.summary",
                serde_json::json!({ "archivedWorktrees": archived, "changedPaths": changed_paths }),
            )
            .await?;
            Ok::<(usize, usize), String>((changed_paths, archived))
        }
        .await;
        match result {
            Ok((changed_paths, archived)) => RitualProjectResult {
                detail: format!("{changed_paths} changed paths; {archived} worktrees archived"),
                project_id: project.id.clone(),
                status: "ready".to_owned(),
            },
            Err(detail) => RitualProjectResult {
                detail,
                project_id: project.id.clone(),
                status: "failed".to_owned(),
            },
        }
    }

    async fn git<const N: usize>(
        &self,
        host: &Arc<dyn crate::hosts::ExecutionHost>,
        cwd: &str,
        args: [&str; N],
    ) -> Result<crate::hosts::HostCommandOutput, String> {
        let mut command = HostCommand::new("git", args);
        command.cwd = Some(cwd.to_owned());
        command.max_output_bytes = Some(10 * 1_024 * 1_024);
        command.timeout_ms = Some(120_000);
        let output = host
            .exec(command)
            .await
            .map_err(|error| error.to_string())?;
        if output.exit_code == 0 {
            Ok(output)
        } else {
            Err(if output.stderr.trim().is_empty() {
                format!("git exited with {}", output.exit_code)
            } else {
                output.stderr
            })
        }
    }

    async fn archive_project(&self, project_id: &str) -> Result<usize, String> {
        let mut archived = 0;
        let worktrees = self
            .worktrees
            .list_resolved()
            .await
            .map_err(|error| error.to_string())?;
        for worktree in worktrees.into_iter().filter(|worktree| {
            worktree.repo_id == project_id && !worktree.is_main_worktree && !worktree.is_bare
        }) {
            let revision = self
                .journal
                .revision(project_id.to_owned())
                .await
                .map_err(|error| error.to_string())?;
            self.archives
                .archive(&worktree.id, revision, false)
                .await
                .map_err(|error| error.to_string())?;
            archived += 1;
        }
        Ok(archived)
    }

    async fn count_events(&self, project_id: &str, since: i64) -> Result<usize, String> {
        self.journal
            .count_since(project_id.to_owned(), since)
            .await
            .map_err(|error| error.to_string())
    }

    async fn append(
        &self,
        scope: String,
        kind: &str,
        value: serde_json::Value,
    ) -> Result<(), String> {
        let serde_json::Value::Object(payload) = value else {
            return Err("ritual event payload must be an object".to_owned());
        };
        self.journal
            .append(scope, kind.to_owned(), payload)
            .await
            .map(|_| ())
            .map_err(|error| error.to_string())
    }
}

#[async_trait]
impl RitualRunner for DaemonRitualRunner {
    async fn run(
        &self,
        kind: &str,
        archive_on_end_day: bool,
        overnight_since: Option<i64>,
    ) -> Result<Vec<RitualProjectResult>, RitualError> {
        let projects = self
            .projects
            .list()
            .await
            .map_err(|error| RitualError::Runner(error.to_string()))?;
        let runner = self.clone();
        let kind = kind.to_owned();
        Ok(stream::iter(projects.into_iter().map(move |project| {
            let runner = runner.clone();
            let kind = kind.clone();
            async move {
                if kind == "start-day" {
                    runner.start_project(&project, overnight_since).await
                } else {
                    runner.end_project(&project, archive_on_end_day).await
                }
            }
        }))
        .buffered(4)
        .collect()
        .await)
    }
}

#[derive(Clone)]
pub(crate) struct RitualScheduleStore {
    mailbox: Arc<dyn RitualScheduleMailbox>,
}

pub(crate) struct RitualScheduleRequest(RitualScheduleCommand);

enum RitualScheduleCommand {
    Read {
        response: oneshot::Sender<Result<RitualScheduleStatus, RitualError>>,
    },
    Update {
        schedule: RitualSchedule,
        response: oneshot::Sender<Result<RitualScheduleStatus, RitualError>>,
    },
    RecordRun {
        kind: String,
        occurred_at: i64,
        response: oneshot::Sender<Result<(), RitualError>>,
    },
    RecordFailure {
        detail: String,
        response: oneshot::Sender<Result<(), RitualError>>,
    },
}

#[async_trait]
pub(crate) trait RitualScheduleMailbox: Send + Sync {
    async fn submit(
        &self,
        request: RitualScheduleRequest,
    ) -> Result<(), RitualScheduleMailboxClosed>;
}

#[derive(Debug)]
pub(crate) struct RitualScheduleMailboxClosed;

pub(crate) struct RitualScheduleWorker;

impl RitualScheduleStore {
    pub(crate) fn new(mailbox: Arc<dyn RitualScheduleMailbox>) -> Self {
        Self { mailbox }
    }

    pub(crate) async fn read(&self) -> Result<RitualScheduleStatus, RitualError> {
        let (response, result) = oneshot::channel();
        self.send(RitualScheduleCommand::Read { response }).await?;
        result.await.map_err(|_| RitualError::WorkerUnavailable)?
    }

    pub(crate) async fn update(
        &self,
        schedule: RitualSchedule,
    ) -> Result<RitualScheduleStatus, RitualError> {
        validate_schedule(&schedule)?;
        let (response, result) = oneshot::channel();
        self.send(RitualScheduleCommand::Update { schedule, response })
            .await?;
        result.await.map_err(|_| RitualError::WorkerUnavailable)?
    }

    pub(crate) async fn record_run(&self, kind: &str, occurred_at: i64) -> Result<(), RitualError> {
        if !matches!(kind, "start-day" | "end-day") {
            return Err(RitualError::InvalidSchedule);
        }
        let (response, result) = oneshot::channel();
        self.send(RitualScheduleCommand::RecordRun {
            kind: kind.to_owned(),
            occurred_at,
            response,
        })
        .await?;
        result.await.map_err(|_| RitualError::WorkerUnavailable)?
    }

    pub(crate) async fn record_failure(&self, detail: &str) -> Result<(), RitualError> {
        let (response, result) = oneshot::channel();
        self.send(RitualScheduleCommand::RecordFailure {
            detail: detail.chars().take(MAX_FAILURE_LENGTH).collect(),
            response,
        })
        .await?;
        result.await.map_err(|_| RitualError::WorkerUnavailable)?
    }

    async fn send(&self, command: RitualScheduleCommand) -> Result<(), RitualError> {
        self.mailbox
            .submit(RitualScheduleRequest(command))
            .await
            .map_err(|_| RitualError::WorkerUnavailable)
    }
}

impl RitualScheduleWorker {
    pub(crate) fn handle(&self, connection: &Connection, request: RitualScheduleRequest) {
        match request.0 {
            RitualScheduleCommand::Read { response } => {
                let _ = response.send(read(connection));
            }
            RitualScheduleCommand::Update { schedule, response } => {
                let _ = response.send(update(connection, schedule));
            }
            RitualScheduleCommand::RecordRun {
                kind,
                occurred_at,
                response,
            } => {
                let _ = response.send(record_run(connection, &kind, occurred_at));
            }
            RitualScheduleCommand::RecordFailure { detail, response } => {
                let _ = response.send(record_failure(connection, &detail));
            }
        }
    }
}

#[derive(Clone)]
pub(crate) struct RitualAuthority {
    journal: WorkspaceJournal,
    schedule: RitualScheduleStore,
    runner: Arc<dyn RitualRunner>,
}

impl RitualAuthority {
    pub(crate) fn new(
        journal: WorkspaceJournal,
        schedule: RitualScheduleStore,
        runner: Arc<dyn RitualRunner>,
    ) -> Self {
        Self {
            journal,
            schedule,
            runner,
        }
    }

    pub(crate) async fn get_schedule(&self) -> Result<RitualScheduleStatus, RitualError> {
        self.schedule.read().await
    }

    pub(crate) async fn set_schedule(
        &self,
        schedule: RitualSchedule,
    ) -> Result<RitualScheduleStatus, RitualError> {
        let result = self.schedule.update(schedule).await?;
        self.journal
            .append(
                "daemon".to_owned(),
                "ritual.schedule.updated".to_owned(),
                serde_json::json!({
                    "archiveOnEndDay": result.archive_on_end_day,
                    "enabled": result.enabled,
                    "endMinutes": result.end_minutes,
                    "startMinutes": result.start_minutes,
                    "timezone": result.timezone,
                })
                .as_object()
                .cloned()
                .ok_or(RitualError::InvalidSchedule)?,
            )
            .await
            .map_err(|error| RitualError::Runner(error.to_string()))?;
        Ok(result)
    }

    pub(crate) async fn run(&self, kind: &str) -> Result<RitualRunResult, RitualError> {
        if kind != "start-day" && kind != "end-day" {
            return Err(RitualError::InvalidSchedule);
        }
        let schedule = self.schedule.read().await?;
        let projects = self
            .runner
            .run(kind, schedule.archive_on_end_day, schedule.last_end_at)
            .await?;
        let ready = projects
            .iter()
            .filter(|project| project.status == "ready")
            .count();
        let failed = projects.len().saturating_sub(ready);
        self.journal
            .append(
                "daemon".to_owned(),
                format!("ritual.{kind}.complete"),
                serde_json::json!({ "failed": failed, "ready": ready, "total": projects.len() })
                    .as_object()
                    .cloned()
                    .ok_or(RitualError::InvalidSchedule)?,
            )
            .await
            .map_err(|error| RitualError::Runner(error.to_string()))?;
        self.schedule.record_run(kind, now_millis()?).await?;
        Ok(RitualRunResult {
            kind: kind.to_owned(),
            projects,
            summary: format!("{ready} ready, {failed} need attention"),
        })
    }

    pub(crate) async fn record_schedule_failure(
        &self,
        kind: &str,
        detail: &str,
    ) -> Result<(), RitualError> {
        if kind != "start-day" && kind != "end-day" {
            return Err(RitualError::InvalidSchedule);
        }
        self.schedule.record_failure(detail).await?;
        self.journal
            .append(
                "daemon".to_owned(),
                "ritual.schedule.failed".to_owned(),
                serde_json::json!({ "detail": detail, "kind": kind })
                    .as_object()
                    .cloned()
                    .ok_or(RitualError::InvalidSchedule)?,
            )
            .await
            .map(|_| ())
            .map_err(|error| RitualError::Runner(error.to_string()))
    }
}

pub(crate) struct RitualScheduler {
    stop: watch::Sender<bool>,
    task: AsyncMutex<Option<tokio::task::JoinHandle<()>>>,
}

impl RitualScheduler {
    pub(crate) fn start(authority: RitualAuthority) -> Self {
        let (stop, mut stopped) = watch::channel(false);
        let task = tokio::spawn(async move {
            let mut ticker = tokio::time::interval(Duration::from_secs(30));
            loop {
                tokio::select! {
                    _ = ticker.tick() => run_scheduled(&authority, &mut stopped).await,
                    changed = stopped.changed() => {
                        if changed.is_err() || *stopped.borrow() { break; }
                    }
                }
            }
        });
        Self {
            stop,
            task: AsyncMutex::new(Some(task)),
        }
    }

    pub(crate) async fn shutdown(&self) {
        let _ = self.stop.send(true);
        if let Some(task) = self.task.lock().await.take() {
            let _ = task.await;
        }
    }
}

async fn run_scheduled(authority: &RitualAuthority, stopped: &mut watch::Receiver<bool>) {
    let Ok(schedule) = authority.get_schedule().await else {
        return;
    };
    let Ok(now) = now_millis() else {
        return;
    };
    let Some(kind) = due_kind(&schedule, now) else {
        return;
    };
    if authority.run(kind).await.is_ok() {
        return;
    }
    let _ = authority
        .record_schedule_failure(kind, "ritual scheduled run failed")
        .await;
    tokio::select! {
        _ = tokio::time::sleep(Duration::from_secs(5 * 60)) => {
            if !*stopped.borrow() && authority.run(kind).await.is_err() {
                let _ = authority
                    .record_schedule_failure(kind, "ritual scheduled retry failed")
                    .await;
            }
        }
        _ = stopped.changed() => {}
    }
}

fn due_kind(schedule: &RitualScheduleStatus, now: i64) -> Option<&'static str> {
    if !schedule.enabled {
        return None;
    }
    let current = zoned_parts(now, &schedule.timezone)?;
    if !schedule.weekdays.contains(&current.weekday) {
        return None;
    }
    if current.minutes == schedule.start_minutes
        && !same_local_date(schedule.last_start_at, now, &schedule.timezone)
    {
        return Some("start-day");
    }
    if current.minutes == schedule.end_minutes
        && !same_local_date(schedule.last_end_at, now, &schedule.timezone)
    {
        return Some("end-day");
    }
    None
}

struct ZonedParts {
    date: (i32, u32, u32),
    minutes: u16,
    weekday: u8,
}

fn zoned_parts(timestamp: i64, timezone: &str) -> Option<ZonedParts> {
    let timezone = timezone.parse::<Tz>().ok()?;
    let utc = Utc.timestamp_millis_opt(timestamp).single()?;
    let local: DateTime<Tz> = utc.with_timezone(&timezone);
    Some(ZonedParts {
        date: (local.year(), local.month(), local.day()),
        minutes: u16::try_from(local.hour() * 60 + local.minute()).ok()?,
        weekday: local.weekday().num_days_from_sunday() as u8,
    })
}

fn same_local_date(left: Option<i64>, right: i64, timezone: &str) -> bool {
    left.and_then(|left| zoned_parts(left, timezone).map(|parts| parts.date))
        == zoned_parts(right, timezone).map(|parts| parts.date)
}

fn now_millis() -> Result<i64, RitualError> {
    Ok(SystemTime::now()
        .duration_since(UNIX_EPOCH)?
        .as_millis()
        .try_into()
        .unwrap_or(i64::MAX))
}

fn sorted_weekdays(mut weekdays: Vec<u8>) -> Vec<u8> {
    weekdays.sort_unstable();
    weekdays.dedup();
    weekdays
}

fn validate_schedule(schedule: &RitualSchedule) -> Result<(), RitualError> {
    if schedule.timezone.trim().is_empty() || schedule.timezone.chars().count() > 100 {
        return Err(RitualError::InvalidTimezone);
    }
    let timezone = schedule.timezone.trim();
    if timezone.parse::<Tz>().is_err() {
        return Err(RitualError::InvalidTimezone);
    }
    if schedule.start_minutes > 1_439
        || schedule.end_minutes > 1_439
        || schedule.weekdays.is_empty()
        || schedule.weekdays.len() > 7
        || schedule.weekdays.iter().any(|day| *day > 6)
    {
        return Err(RitualError::InvalidSchedule);
    }
    Ok(())
}

async fn read_run_command(filesystem: &HostFilesystem, project_path: &str) -> Option<String> {
    let path = filesystem.paths().join(&[project_path, "agentstart.yaml"]);
    let text = filesystem.read_text(&path, 1_024 * 1_024).await.ok()??;
    let value = serde_saphyr::from_str::<serde_json::Value>(&text).ok()?;
    let scripts = value.get("scripts")?.as_object()?;
    let run = scripts.get("run")?.as_str()?.trim();
    (!run.is_empty()).then_some(run.to_owned())
}

fn default_status() -> RitualScheduleStatus {
    RitualScheduleStatus {
        archive_on_end_day: false,
        enabled: false,
        end_minutes: DEFAULT_END_MINUTES,
        start_minutes: DEFAULT_START_MINUTES,
        timezone: default_timezone(),
        weekdays: vec![1, 2, 3, 4, 5],
        last_end_at: None,
        last_failure: None,
        last_start_at: None,
    }
}

fn default_timezone() -> String {
    iana_time_zone::get_timezone()
        .ok()
        .filter(|timezone| timezone.parse::<Tz>().is_ok())
        .unwrap_or_else(|| "UTC".to_owned())
}

fn read(connection: &Connection) -> Result<RitualScheduleStatus, RitualError> {
    let status = connection
        .query_row(
            "SELECT enabled, start_minutes, end_minutes, timezone, weekdays_json,
                    archive_on_end_day, last_start_at, last_end_at, last_failure
             FROM ritual_schedule WHERE id = 1",
            [],
            |row| {
                let weekdays_json: String = row.get(4)?;
                let weekdays =
                    serde_json::from_str::<Vec<u8>>(&weekdays_json).map_err(|error| {
                        rusqlite::Error::FromSqlConversionFailure(
                            4,
                            rusqlite::types::Type::Text,
                            Box::new(error),
                        )
                    })?;
                Ok(RitualScheduleStatus {
                    enabled: row.get::<_, i64>(0)? != 0,
                    start_minutes: row.get::<_, i64>(1)?.try_into().map_err(|_| {
                        rusqlite::Error::FromSqlConversionFailure(
                            1,
                            rusqlite::types::Type::Integer,
                            "start_minutes out of range".into(),
                        )
                    })?,
                    end_minutes: row.get::<_, i64>(2)?.try_into().map_err(|_| {
                        rusqlite::Error::FromSqlConversionFailure(
                            2,
                            rusqlite::types::Type::Integer,
                            "end_minutes out of range".into(),
                        )
                    })?,
                    timezone: row.get(3)?,
                    weekdays,
                    archive_on_end_day: row.get::<_, i64>(5)? != 0,
                    last_start_at: row.get(6)?,
                    last_end_at: row.get(7)?,
                    last_failure: row.get(8)?,
                })
            },
        )
        .optional()
        .map_err(storage)?;
    if let Some(status) = status {
        return Ok(status);
    }
    let status = default_status();
    connection
        .execute(
            "INSERT INTO ritual_schedule(
               id, enabled, start_minutes, end_minutes, timezone, weekdays_json,
               archive_on_end_day, last_start_at, last_end_at, last_failure
             ) VALUES (1, 0, ?1, ?2, ?3, ?4, 0, NULL, NULL, NULL)",
            rusqlite::params![
                status.start_minutes,
                status.end_minutes,
                status.timezone,
                serde_json::to_string(&status.weekdays).map_err(storage)?,
            ],
        )
        .map_err(storage)?;
    Ok(status)
}

fn update(
    connection: &Connection,
    schedule: RitualSchedule,
) -> Result<RitualScheduleStatus, RitualError> {
    validate_schedule(&schedule)?;
    let weekdays = sorted_weekdays(schedule.weekdays);
    connection
        .execute(
            "INSERT INTO ritual_schedule(
               id, enabled, start_minutes, end_minutes, timezone, weekdays_json,
               archive_on_end_day, last_start_at, last_end_at, last_failure
             ) VALUES (1, ?1, ?2, ?3, ?4, ?5, ?6, NULL, NULL, NULL)
             ON CONFLICT(id) DO UPDATE SET enabled = excluded.enabled,
               start_minutes = excluded.start_minutes, end_minutes = excluded.end_minutes,
               timezone = excluded.timezone, weekdays_json = excluded.weekdays_json,
               archive_on_end_day = excluded.archive_on_end_day, last_failure = NULL",
            rusqlite::params![
                schedule.enabled as i64,
                schedule.start_minutes,
                schedule.end_minutes,
                schedule.timezone.trim(),
                serde_json::to_string(&weekdays).map_err(storage)?,
                schedule.archive_on_end_day as i64,
            ],
        )
        .map_err(storage)?;
    read(connection)
}

fn record_run(connection: &Connection, kind: &str, occurred_at: i64) -> Result<(), RitualError> {
    let column = match kind {
        "start-day" => "last_start_at",
        "end-day" => "last_end_at",
        _ => return Err(RitualError::InvalidSchedule),
    };
    connection
        .execute(
            &format!("UPDATE ritual_schedule SET {column} = ?1, last_failure = NULL WHERE id = 1"),
            [occurred_at],
        )
        .map_err(storage)?;
    Ok(())
}

fn record_failure(connection: &Connection, detail: &str) -> Result<(), RitualError> {
    connection
        .execute(
            "UPDATE ritual_schedule SET last_failure = ?1 WHERE id = 1",
            [detail],
        )
        .map_err(storage)?;
    Ok(())
}

fn storage(source: impl Error + Send + Sync + 'static) -> RitualError {
    RitualError::Storage(Box::new(source))
}
