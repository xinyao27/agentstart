use std::io::{Read, Write};
use std::sync::Arc;
use std::sync::atomic::{AtomicBool, Ordering};
use std::sync::mpsc as blocking_mpsc;
use std::time::{Duration, SystemTime, UNIX_EPOCH};

use portable_pty::{ChildKiller, CommandBuilder, MasterPty, PtySize, native_pty_system};
use tokio::sync::{OwnedSemaphorePermit, Semaphore, mpsc, oneshot};

use super::launch::{TERMINAL_ENVIRONMENT, TerminalLaunch};
use super::model::TerminalProcessInspection;
use super::snapshot::{TerminalSnapshotProvider, run_model};
use super::{TerminalSessionError, identity};

const INPUT_QUEUE_DEPTH: usize = 128;
const INPUT_CHUNK_BYTES: usize = 16 * 1_024;
const INPUT_QUEUE_BUDGET_BYTES: usize = 32 * 1_024 * 1_024;
const MAX_INPUT_BYTES: usize = 16 * 1_024 * 1_024;
const OUTPUT_CHUNK_BYTES: usize = 16 * 1_024;
const PROCESS_THREAD_STACK_BYTES: usize = 256 * 1_024;

pub(super) enum ProcessEvent {
    Exited {
        exit_code: i32,
        pty_id: String,
    },
    Output {
        bytes: Vec<u8>,
        observed_at: i64,
        pty_id: String,
    },
    ReaderFinished {
        observed_at: i64,
        pty_id: String,
        history: String,
    },
}

pub(super) enum TerminalEvent {
    Barrier(oneshot::Sender<()>),
    Clear {
        pty_id: String,
        result: oneshot::Sender<Option<TerminalClear>>,
    },
    Process(ProcessEvent),
}

pub(super) type TerminalClear = (Option<String>, String, String);

#[derive(Clone)]
pub(super) struct ProcessControl {
    commands: blocking_mpsc::SyncSender<ProcessCommand>,
    input_budget: Arc<Semaphore>,
    live: Arc<AtomicBool>,
    pid: Option<u32>,
}

enum ProcessCommand {
    Inspect {
        result: oneshot::Sender<TerminalProcessInspection>,
    },
    Kill {
        result: oneshot::Sender<Result<(), String>>,
    },
    Resize {
        cols: u16,
        result: oneshot::Sender<Result<(), String>>,
        rows: u16,
    },
    Write {
        _budget: OwnedSemaphorePermit,
        bytes: Vec<u8>,
        delay_before_suffix: bool,
        result: oneshot::Sender<Result<(), String>>,
        suffix: Vec<u8>,
    },
}

struct ProcessLoop {
    commands: blocking_mpsc::Receiver<ProcessCommand>,
    killer: Box<dyn ChildKiller + Send + Sync>,
    master: Box<dyn MasterPty + Send>,
    snapshot_provider: TerminalSnapshotProvider,
    pid: Option<u32>,
    writer: Box<dyn Write + Send>,
}

pub(super) struct SpawnedProcess {
    pub(super) control: ProcessControl,
    pub(super) pty_id: String,
    pub(super) snapshot_provider: TerminalSnapshotProvider,
    pub(super) start: ProcessStart,
}

pub(super) struct ProcessStart {
    control: oneshot::Sender<()>,
    model: Option<oneshot::Sender<()>>,
    reader: oneshot::Sender<()>,
    waiter: oneshot::Sender<()>,
}

pub(super) async fn spawn(
    launch: TerminalLaunch,
    cols: u16,
    rows: u16,
    events: mpsc::Sender<TerminalEvent>,
) -> Result<SpawnedProcess, TerminalSessionError> {
    let pty_id = identity::random_id()?;
    let spawn_id = pty_id.clone();
    let opened = tokio::task::spawn_blocking(move || open(launch, cols, rows)).await??;
    let OpenedProcess {
        child,
        killer,
        master,
        reader,
        writer,
    } = opened;
    let pid = child.process_id();
    let (commands, command_receiver) = blocking_mpsc::sync_channel(INPUT_QUEUE_DEPTH);
    let input_budget = Arc::new(Semaphore::new(INPUT_QUEUE_BUDGET_BYTES / INPUT_CHUNK_BYTES));
    let live = Arc::new(AtomicBool::new(true));
    let (snapshot_provider, model_commands) = TerminalSnapshotProvider::channel();
    let alternate_screen = snapshot_provider.alternate_screen_state();
    let (model_start, model_ready) = oneshot::channel();
    let model_events = events.clone();
    let model_id = pty_id.clone();
    // Why: parsing and snapshot serialization are CPU work, so a bounded dedicated lane applies
    // reader backpressure without putting a mutex or blocking work on a Tokio runtime thread.
    spawn_process_thread(
        &format!("agentstart-pty-model-{}", short_id(&pty_id)),
        move || {
            if model_ready.blocking_recv().is_ok() {
                run_model(
                    model_commands,
                    cols,
                    rows,
                    model_id,
                    model_events,
                    alternate_screen,
                );
            }
        },
    )?;
    let (reader_start, reader_ready) = oneshot::channel();
    let reader_snapshot_provider = snapshot_provider.clone();
    spawn_process_thread(
        &format!("agentstart-pty-reader-{}", short_id(&pty_id)),
        move || {
            if reader_ready.blocking_recv().is_ok() {
                run_reader(reader, reader_snapshot_provider.clone());
                reader_snapshot_provider.finish(epoch_millis());
            }
        },
    )?;
    let (control_start, control_ready) = oneshot::channel();
    let control_snapshot_provider = snapshot_provider.clone();
    spawn_process_thread(
        &format!("agentstart-pty-control-{}", short_id(&pty_id)),
        move || {
            if control_ready.blocking_recv().is_ok() {
                run_process_control(ProcessLoop {
                    commands: command_receiver,
                    killer,
                    master,
                    snapshot_provider: control_snapshot_provider,
                    pid,
                    writer,
                });
            }
        },
    )?;
    let (waiter_start, waiter_ready) = oneshot::channel();
    let waiter_live = live.clone();
    spawn_process_thread(
        &format!("agentstart-pty-waiter-{}", short_id(&pty_id)),
        move || {
            if waiter_ready.blocking_recv().is_ok() {
                let mut child = child;
                let exit_code = child
                    .wait()
                    .map(|status| i32::try_from(status.exit_code()).unwrap_or(i32::MAX))
                    .unwrap_or(-1);
                waiter_live.store(false, Ordering::Release);
                let _ = events.blocking_send(TerminalEvent::Process(ProcessEvent::Exited {
                    exit_code,
                    pty_id: spawn_id,
                }));
            }
        },
    )?;
    Ok(SpawnedProcess {
        control: ProcessControl {
            commands,
            input_budget,
            live,
            pid,
        },
        pty_id,
        snapshot_provider,
        start: ProcessStart {
            control: control_start,
            model: Some(model_start),
            reader: reader_start,
            waiter: waiter_start,
        },
    })
}

impl ProcessStart {
    pub(super) fn release_model(&mut self) {
        if let Some(model) = self.model.take() {
            let _ = model.send(());
        }
    }

    pub(super) fn release(mut self) {
        self.release_model();
        let _ = self.reader.send(());
        let _ = self.control.send(());
        let _ = self.waiter.send(());
    }
}

impl ProcessControl {
    pub(super) fn pid(&self) -> Option<u32> {
        self.pid
    }

    pub(super) fn is_live(&self) -> bool {
        self.live.load(Ordering::Acquire)
    }

    pub(super) async fn foreground_process(&self) -> Option<String> {
        self.inspect().await?.foreground_process
    }

    pub(super) async fn inspect(&self) -> Option<TerminalProcessInspection> {
        let (result, receiver) = oneshot::channel();
        self.commands
            .try_send(ProcessCommand::Inspect { result })
            .ok()?;
        receiver.await.ok()
    }

    pub(super) async fn write(
        &self,
        bytes: Vec<u8>,
        suffix: Vec<u8>,
        delay_before_suffix: bool,
    ) -> Result<(), TerminalSessionError> {
        if bytes.is_empty() && suffix.is_empty() || bytes.len() > MAX_INPUT_BYTES {
            return Err(TerminalSessionError::InvalidInput("terminal input size"));
        }
        let queued_bytes = bytes.len().saturating_add(suffix.len()).max(1);
        let permit_count = u32::try_from(queued_bytes.div_ceil(INPUT_CHUNK_BYTES))
            .map_err(|_| TerminalSessionError::InvalidInput("terminal input size"))?;
        let budget = self
            .input_budget
            .clone()
            .try_acquire_many_owned(permit_count)
            .map_err(|_| TerminalSessionError::NotWritable)?;
        self.execute(|result| ProcessCommand::Write {
            _budget: budget,
            bytes,
            delay_before_suffix,
            result,
            suffix,
        })
        .await
    }

    pub(super) async fn resize(&self, cols: u16, rows: u16) -> Result<(), TerminalSessionError> {
        self.execute(|result| ProcessCommand::Resize { cols, result, rows })
            .await
    }

    pub(super) async fn kill(&self) -> Result<(), TerminalSessionError> {
        self.execute(|result| ProcessCommand::Kill { result }).await
    }

    async fn execute(
        &self,
        command: impl FnOnce(oneshot::Sender<Result<(), String>>) -> ProcessCommand,
    ) -> Result<(), TerminalSessionError> {
        let (result, receiver) = oneshot::channel();
        self.commands
            .try_send(command(result))
            .map_err(|_| TerminalSessionError::NotWritable)?;
        receiver
            .await
            .map_err(|_| TerminalSessionError::NotWritable)?
            .map_err(TerminalSessionError::Process)
    }
}

#[cfg(unix)]
fn kill_process_tree(pid: Option<u32>) -> bool {
    let Some(pid) = pid else {
        return false;
    };
    let graceful = signal_session(pid, nix::sys::signal::Signal::SIGHUP);
    if graceful {
        std::thread::sleep(Duration::from_millis(250));
    }
    signal_session(pid, nix::sys::signal::Signal::SIGKILL) || graceful
}

#[cfg(unix)]
fn signal_session(session_id: u32, signal: nix::sys::signal::Signal) -> bool {
    use nix::sys::signal::kill;
    use nix::unistd::Pid;
    use sysinfo::{Pid as SystemPid, ProcessRefreshKind, ProcessesToUpdate, System};

    let session_id = SystemPid::from_u32(session_id);
    let mut system = System::new();
    system.refresh_processes_specifics(
        ProcessesToUpdate::All,
        true,
        ProcessRefreshKind::nothing().without_tasks(),
    );
    let mut signaled = false;
    for pid in system
        .processes()
        .iter()
        .filter(|(_, process)| process.session_id() == Some(session_id))
        .filter_map(|(pid, _)| i32::try_from(pid.as_u32()).ok())
    {
        signaled |= kill(Pid::from_raw(pid), signal).is_ok();
    }
    signaled
}

#[cfg(windows)]
fn kill_process_tree(pid: Option<u32>) -> bool {
    let Some(pid) = pid else {
        return false;
    };
    std::process::Command::new("taskkill")
        .args(["/PID", &pid.to_string(), "/T", "/F"])
        .status()
        .is_ok_and(|status| status.success())
}

struct OpenedProcess {
    child: Box<dyn portable_pty::Child + Send + Sync>,
    killer: Box<dyn ChildKiller + Send + Sync>,
    master: Box<dyn MasterPty + Send>,
    reader: Box<dyn Read + Send>,
    writer: Box<dyn Write + Send>,
}

fn open(
    launch: TerminalLaunch,
    cols: u16,
    rows: u16,
) -> Result<OpenedProcess, TerminalSessionError> {
    let pair = native_pty_system()
        .openpty(size(cols, rows))
        .map_err(TerminalSessionError::process)?;
    let reader = pair
        .master
        .try_clone_reader()
        .map_err(TerminalSessionError::process)?;
    let writer = pair
        .master
        .take_writer()
        .map_err(TerminalSessionError::process)?;
    let mut command = CommandBuilder::new(launch.executable);
    command.args(launch.args);
    if let Some(cwd) = launch.cwd {
        command.cwd(cwd);
    }
    // Why: daemon launchers can suppress color for their own logs, but an interactive terminal
    // must advertise its own capabilities. Login startup files can still opt out explicitly.
    command.env_remove("NO_COLOR");
    for name in ["FORCE_COLOR", "CLICOLOR"] {
        if std::env::var(name).is_ok_and(|value| value == "0") {
            command.env_remove(name);
        }
    }
    // Why: these capabilities existed on the original PTY host. Agent CLIs
    // use them to enable true-color rendering and terminal hyperlinks.
    for (name, value) in TERMINAL_ENVIRONMENT {
        command.env(name, value);
    }
    for (name, value) in launch.env {
        command.env(name, value);
    }
    for name in launch.env_to_delete {
        command.env_remove(name);
    }
    let child = pair
        .slave
        .spawn_command(command)
        .map_err(TerminalSessionError::process)?;
    let killer = child.clone_killer();
    drop(pair.slave);
    Ok(OpenedProcess {
        child,
        killer,
        master: pair.master,
        reader,
        writer,
    })
}

fn run_reader(mut reader: Box<dyn Read + Send>, snapshot_provider: TerminalSnapshotProvider) {
    let mut buffer = vec![0_u8; OUTPUT_CHUNK_BYTES];
    loop {
        match reader.read(&mut buffer) {
            Ok(0) | Err(_) => return,
            Ok(count) => {
                if !snapshot_provider.ingest(buffer[..count].to_vec(), epoch_millis()) {
                    return;
                }
            }
        }
    }
}

fn epoch_millis() -> i64 {
    SystemTime::now()
        .duration_since(UNIX_EPOCH)
        .map(|duration| i64::try_from(duration.as_millis()).unwrap_or(i64::MAX))
        .unwrap_or(0)
}

fn run_process_control(mut process: ProcessLoop) {
    while let Ok(command) = process.commands.recv() {
        match command {
            ProcessCommand::Inspect { result } => {
                let _ = result.send(process_inspection(
                    process.pid,
                    terminal_foreground_process_group(process.master.as_ref()),
                ));
            }
            ProcessCommand::Kill { result } => {
                let tree_signaled = kill_process_tree(process.pid);
                let outcome = match process.killer.kill() {
                    Ok(()) => Ok(()),
                    Err(_) if tree_signaled => Ok(()),
                    Err(error) => Err(error.to_string()),
                };
                let _ = result.send(outcome);
            }
            ProcessCommand::Resize { cols, result, rows } => {
                let outcome = process
                    .master
                    .resize(size(cols, rows))
                    .map_err(|error| error.to_string());
                if outcome.is_ok() {
                    process.snapshot_provider.resize(cols, rows);
                }
                let _ = result.send(outcome);
            }
            ProcessCommand::Write {
                _budget,
                bytes,
                delay_before_suffix,
                result,
                suffix,
            } => {
                let mut outcome = write_and_flush(&mut process.writer, &bytes);
                if outcome.is_ok() && delay_before_suffix && !suffix.is_empty() {
                    std::thread::sleep(Duration::from_millis(500));
                }
                if outcome.is_ok() {
                    outcome = write_and_flush(&mut process.writer, &suffix);
                }
                let _ = result.send(outcome.map_err(|error| error.to_string()));
            }
        }
    }
    kill_process_tree(process.pid);
    let _ = process.killer.kill();
}

fn spawn_process_thread(
    name: &str,
    operation: impl FnOnce() + Send + 'static,
) -> Result<(), TerminalSessionError> {
    std::thread::Builder::new()
        .name(name.to_owned())
        .stack_size(PROCESS_THREAD_STACK_BYTES)
        .spawn(operation)
        .map(|_| ())
        .map_err(TerminalSessionError::process)
}

fn short_id(id: &str) -> &str {
    id.get(..8).unwrap_or(id)
}

#[cfg(unix)]
fn terminal_foreground_process_group(master: &dyn MasterPty) -> Option<u32> {
    master
        .process_group_leader()
        .and_then(|pid| u32::try_from(pid).ok())
}

#[cfg(windows)]
fn terminal_foreground_process_group(_master: &dyn MasterPty) -> Option<u32> {
    None
}

fn process_inspection(
    root_pid: Option<u32>,
    foreground_process_group: Option<u32>,
) -> TerminalProcessInspection {
    use sysinfo::{Pid, ProcessRefreshKind, ProcessesToUpdate, System};

    let Some(root_pid) = root_pid else {
        return TerminalProcessInspection {
            foreground_process: None,
            has_child_processes: false,
        };
    };
    let root = Pid::from_u32(root_pid);
    let mut system = System::new();
    system.refresh_processes_specifics(
        ProcessesToUpdate::All,
        true,
        ProcessRefreshKind::nothing().without_tasks(),
    );
    let descendants = system
        .processes()
        .iter()
        .filter_map(|(pid, process)| {
            descendant_depth(&system, *pid, root)
                .filter(|depth| *depth > 0)
                .map(|_| (*pid, process.name().to_string_lossy().into_owned()))
        })
        .collect::<Vec<_>>();
    let foreground_process = foreground_process_group
        .and_then(|pid| system.process(Pid::from_u32(pid)))
        .or_else(|| {
            let parent_pids = descendants
                .iter()
                .filter_map(|(pid, _)| system.process(*pid)?.parent())
                .collect::<std::collections::HashSet<_>>();
            let mut leaves = descendants
                .iter()
                .filter(|(pid, _)| !parent_pids.contains(pid));
            let leaf = leaves.next()?;
            if leaves.next().is_none() {
                system.process(leaf.0)
            } else {
                None
            }
        })
        .or_else(|| descendants.is_empty().then(|| system.process(root))?)
        .map(|process| process.name().to_string_lossy().into_owned());
    TerminalProcessInspection {
        foreground_process,
        has_child_processes: !descendants.is_empty(),
    }
}

fn descendant_depth(
    system: &sysinfo::System,
    mut pid: sysinfo::Pid,
    root: sysinfo::Pid,
) -> Option<usize> {
    let mut depth = 0;
    loop {
        if pid == root {
            return Some(depth);
        }
        pid = system.process(pid)?.parent()?;
        depth += 1;
        if depth > 256 {
            return None;
        }
    }
}

fn write_and_flush(writer: &mut Box<dyn Write + Send>, bytes: &[u8]) -> std::io::Result<()> {
    if bytes.is_empty() {
        return Ok(());
    }
    for chunk in bytes.chunks(INPUT_CHUNK_BYTES) {
        writer.write_all(chunk)?;
        writer.flush()?;
    }
    Ok(())
}

fn size(cols: u16, rows: u16) -> PtySize {
    PtySize {
        cols,
        rows,
        pixel_height: 0,
        pixel_width: 0,
    }
}
