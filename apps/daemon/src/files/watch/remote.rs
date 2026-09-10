use std::sync::atomic::{AtomicBool, Ordering};
use std::sync::{Arc, Mutex, MutexGuard};

use tokio::sync::{mpsc, watch};

use crate::hosts::{
    ExecutionHost, HostCommand, HostCommandErrorKind, HostCommandOutputObserver,
    HostCommandOutputStream, HostCommandStreamControl,
};

use super::super::FilesAuthority;
use super::super::model::{FileChangeEvent, FileWatchEvent};
use super::super::scope::FileScope;

const EVENT_BUFFER: usize = 256;
const EVENT_FIELD_LIMIT: usize = 16 * 1_024;
const PROBE_OUTPUT_LIMIT: usize = 1_024;
const PROBE_TIMEOUT_MS: u64 = 3_000;

#[derive(Clone, Copy, Eq, PartialEq)]
pub(super) enum Backend {
    Fswatch,
    Inotify,
    Polling,
}

struct RemoteEventObserver {
    backend: Backend,
    decoder: Mutex<Decoder>,
    overflowed: Arc<AtomicBool>,
    ready: watch::Sender<bool>,
    root: String,
    sender: mpsc::Sender<FileChangeEvent>,
    stderr: Mutex<StderrTail>,
}

enum Decoder {
    Csv(CsvDecoder),
    Nul(NulDecoder),
}

struct CsvDecoder {
    field: Vec<u8>,
    fields: Vec<Vec<u8>>,
    in_quotes: bool,
    quote_pending: bool,
}

struct StderrTail {
    bytes: Vec<u8>,
    inotify_ready: bool,
}

struct NulDecoder {
    field: Vec<u8>,
    fields: Vec<Vec<u8>>,
    probe_path: Option<String>,
    ready: bool,
}

pub(super) async fn resolve_backend(host: Arc<dyn ExecutionHost>) -> Backend {
    let script = r#"
system=$(uname -s 2>/dev/null || printf unknown)
supports() {
  "$1" --help 2>&1 | grep -F -q -- "$2"
}
if [ "$system" = Linux ] && command -v inotifywait >/dev/null 2>&1 \
  && supports inotifywait --csv \
  && supports inotifywait --recursive \
  && supports inotifywait --exclude; then
  printf inotify
elif command -v fswatch >/dev/null 2>&1 \
  && supports fswatch --allow-overflow \
  && supports fswatch --format \
  && supports fswatch --numeric \
  && supports fswatch --recursive \
  && supports fswatch --exclude; then
  printf fswatch
else
  printf polling
fi
"#;
    let mut command = HostCommand::new("sh", ["-c", script]);
    command.max_output_bytes = Some(PROBE_OUTPUT_LIMIT);
    command.timeout_ms = Some(PROBE_TIMEOUT_MS);
    match host.exec(command).await {
        Ok(output) if output.exit_code == 0 => match output.stdout.trim() {
            "inotify" => Backend::Inotify,
            "fswatch" => Backend::Fswatch,
            _ => Backend::Polling,
        },
        Ok(_) | Err(_) => Backend::Polling,
    }
}

pub(super) async fn run(
    authority: FilesAuthority,
    scope: FileScope,
    root: String,
    subscription_id: String,
    sender: mpsc::Sender<FileWatchEvent>,
    backend: Backend,
    mut cancel: watch::Receiver<bool>,
) {
    if !super::send_watch_started(&sender, &subscription_id).await {
        super::finish(&authority, &subscription_id);
        return;
    }
    let (source_sender, mut source) = mpsc::channel(EVENT_BUFFER);
    let (ready_sender, mut ready_receiver) = watch::channel(false);
    let overflowed = Arc::new(AtomicBool::new(false));
    let observer = Arc::new(RemoteEventObserver::new(
        backend,
        root.clone(),
        source_sender,
        overflowed.clone(),
        ready_sender,
    ));
    let command = watcher_command(backend, &root, cancel.clone(), observer.clone());
    let execution = scope.host.exec(command);
    tokio::pin!(execution);
    let mut is_ready = false;
    let mut batcher = super::WatchBatcher::new(root.clone());
    let mut terminal_error = None;
    loop {
        let inner_deadline = batcher.inner_deadline;
        let outer_deadline = batcher.outer_deadline;
        tokio::select! {
            biased;
            changed = cancel.changed() => {
                if changed.is_err() || *cancel.borrow() {
                    break;
                }
            }
            result = &mut execution => {
                if !*cancel.borrow() {
                    terminal_error = watcher_exit_error(result, observer.stderr_detail());
                }
                break;
            }
            changed = ready_receiver.changed(), if !is_ready => {
                if changed.is_err() {
                    break;
                }
                if *ready_receiver.borrow() {
                    is_ready = send_ready(&sender, &subscription_id).await;
                    if !is_ready {
                        break;
                    }
                }
            }
            event = source.recv() => match event {
                Some(event) => {
                    if overflowed.swap(false, Ordering::AcqRel) {
                        batcher.mark_inner_overflow();
                    }
                    batcher.push(event);
                }
                None => break,
            },
            () = super::wait_for_deadline(inner_deadline), if inner_deadline.is_some() => {
                batcher.flush_inner();
            }
            () = super::wait_for_deadline(outer_deadline), if outer_deadline.is_some() && is_ready => {
                let events = batcher.flush_outer();
                if !events.is_empty() {
                    authority.inventory.invalidate(scope.host.id(), &scope.path).await;
                    if sender.send(FileWatchEvent::Changed {
                        events,
                        worktree: scope.worktree_id.clone(),
                    }).await.is_err() {
                        break;
                    }
                }
            }
        }
    }
    batcher.discard_inner();
    let events = batcher.flush_outer();
    if is_ready && !events.is_empty() {
        authority
            .inventory
            .invalidate(scope.host.id(), &scope.path)
            .await;
        let _ = sender
            .send(FileWatchEvent::Changed {
                events,
                worktree: scope.worktree_id,
            })
            .await;
    }
    if let Some(message) = terminal_error {
        let _ = sender.send(FileWatchEvent::Error { message }).await;
    }
    let _ = sender.send(FileWatchEvent::End).await;
    super::finish(&authority, &subscription_id);
}

async fn send_ready(sender: &mpsc::Sender<FileWatchEvent>, subscription_id: &str) -> bool {
    sender
        .send(FileWatchEvent::Ready {
            subscription_id: subscription_id.to_owned(),
        })
        .await
        .is_ok()
}

fn watcher_exit_error(
    result: Result<crate::hosts::HostCommandOutput, crate::hosts::HostCommandError>,
    stderr_detail: Option<String>,
) -> Option<String> {
    match result {
        Err(error) if error.kind() == HostCommandErrorKind::Cancelled => None,
        Err(error) => stderr_detail.or_else(|| Some(error.to_string())),
        Ok(output) => Some(if let Some(detail) = stderr_detail {
            detail
        } else {
            format!(
                "remote file watcher exited with status {}",
                output.exit_code
            )
        }),
    }
}

fn watcher_command(
    backend: Backend,
    root: &str,
    cancel: watch::Receiver<bool>,
    observer: Arc<RemoteEventObserver>,
) -> HostCommand {
    let mut command = match backend {
        Backend::Inotify => inotify_command(root),
        Backend::Fswatch => fswatch_command(root),
        Backend::Polling => HostCommand::new("false", std::iter::empty::<String>()),
    };
    command.cancel = Some(cancel);
    command.disable_timeout = true;
    command.env.push(("LC_ALL".to_owned(), "C".to_owned()));
    command.output_observer = Some(observer);
    command.retain_stderr = false;
    command.retain_stdout = false;
    command
}

fn inotify_command(root: &str) -> HostCommand {
    let mut args = vec![
        "--monitor".to_owned(),
        "--recursive".to_owned(),
        "--csv".to_owned(),
        "--exclude".to_owned(),
        ignored_path_regex(root),
    ];
    for event in [
        "attrib",
        "close_write",
        "create",
        "delete",
        "delete_self",
        "modify",
        "move_self",
        "moved_from",
        "moved_to",
    ] {
        args.extend(["--event".to_owned(), event.to_owned()]);
    }
    args.extend(["--".to_owned(), root.to_owned()]);
    HostCommand::new("inotifywait", args)
}

fn fswatch_command(root: &str) -> HostCommand {
    let script = r#"
probe=$(mktemp -d "${TMPDIR:-/tmp}/agentstart-watch.XXXXXX") || exit 1
cleanup() {
  if [ -n "${pulse_pid:-}" ]; then kill "$pulse_pid" 2>/dev/null || :; fi
  rm -rf -- "$probe"
}
trap cleanup EXIT HUP INT TERM
printf 'AGENTSTART_PROBE\000%s\000' "$probe"
(
  while :; do
    : > "$probe/ready"
    sleep 0.05
    rm -f -- "$probe/ready"
  done
) &
pulse_pid=$!
fswatch --recursive --numeric --allow-overflow --format '%p%0%f%0' --latency 0.15 --exclude "$2" -- "$probe" "$1"
"#;
    HostCommand::new(
        "sh",
        [
            "-c".to_owned(),
            script.to_owned(),
            "agentstart-fswatch".to_owned(),
            root.to_owned(),
            ignored_path_regex(root),
        ],
    )
}

fn ignored_path_regex(root: &str) -> String {
    let ignored = super::WATCH_IGNORES
        .iter()
        .map(|segment| regex::escape(segment))
        .collect::<Vec<_>>()
        .join("|");
    let root = regex::escape(root.trim_end_matches('/'));
    format!(r"^{root}/([^/]+/)*({ignored})(/|$)")
}

impl RemoteEventObserver {
    fn new(
        backend: Backend,
        root: String,
        sender: mpsc::Sender<FileChangeEvent>,
        overflowed: Arc<AtomicBool>,
        ready: watch::Sender<bool>,
    ) -> Self {
        let decoder = match backend {
            Backend::Inotify => Decoder::Csv(CsvDecoder::new()),
            Backend::Fswatch => Decoder::Nul(NulDecoder::new()),
            Backend::Polling => Decoder::Nul(NulDecoder::new()),
        };
        Self {
            backend,
            decoder: Mutex::new(decoder),
            overflowed,
            ready,
            root,
            sender,
            stderr: Mutex::new(StderrTail::new()),
        }
    }

    fn emit(&self, event: FileChangeEvent) -> HostCommandStreamControl {
        match self.sender.try_send(event) {
            Ok(()) => HostCommandStreamControl::Continue,
            Err(mpsc::error::TrySendError::Full(_)) => {
                self.overflowed.store(true, Ordering::Release);
                HostCommandStreamControl::Continue
            }
            Err(mpsc::error::TrySendError::Closed(_)) => HostCommandStreamControl::Stop,
        }
    }

    fn mark_ready(&self) -> HostCommandStreamControl {
        if self.ready.send(true).is_ok() {
            HostCommandStreamControl::Continue
        } else {
            HostCommandStreamControl::Stop
        }
    }

    fn observe_stderr(&self, bytes: &[u8]) -> bool {
        lock(&self.stderr).observe(bytes, self.backend == Backend::Inotify)
    }

    fn stderr_detail(&self) -> Option<String> {
        let detail = String::from_utf8_lossy(&lock(&self.stderr).bytes)
            .trim()
            .to_owned();
        (!detail.is_empty()).then_some(detail)
    }

    fn observe_inotify(&self, bytes: &[u8]) -> HostCommandStreamControl {
        let mut guard = lock(&self.decoder);
        let Decoder::Csv(decoder) = &mut *guard else {
            return HostCommandStreamControl::Continue;
        };
        let records = decoder.observe(bytes, &self.overflowed);
        drop(guard);
        for record in records {
            let Some(event) = parse_inotify_record(&self.root, &record) else {
                continue;
            };
            if self.emit(event) == HostCommandStreamControl::Stop {
                return HostCommandStreamControl::Stop;
            }
        }
        HostCommandStreamControl::Continue
    }

    fn observe_fswatch(&self, bytes: &[u8]) -> HostCommandStreamControl {
        let mut guard = lock(&self.decoder);
        let Decoder::Nul(decoder) = &mut *guard else {
            return HostCommandStreamControl::Continue;
        };
        let records = decoder.observe(bytes, &self.overflowed);
        let mut ready = false;
        let mut event_records = Vec::new();
        for record in records {
            match decoder.classify(&record) {
                NulRecord::Event => event_records.push(record),
                NulRecord::Ready => ready = true,
                NulRecord::Setup => {}
            }
        }
        drop(guard);
        if ready && self.mark_ready() == HostCommandStreamControl::Stop {
            return HostCommandStreamControl::Stop;
        }
        for record in event_records {
            let Some(event) = parse_fswatch_record(&self.root, &record) else {
                continue;
            };
            if self.emit(event) == HostCommandStreamControl::Stop {
                return HostCommandStreamControl::Stop;
            }
        }
        HostCommandStreamControl::Continue
    }
}

impl HostCommandOutputObserver for RemoteEventObserver {
    fn observe(&self, stream: HostCommandOutputStream, bytes: &[u8]) -> HostCommandStreamControl {
        if stream == HostCommandOutputStream::Stderr {
            return if self.observe_stderr(bytes) {
                self.mark_ready()
            } else {
                HostCommandStreamControl::Continue
            };
        }
        match self.backend {
            Backend::Inotify => self.observe_inotify(bytes),
            Backend::Fswatch if stream == HostCommandOutputStream::Stdout => {
                self.observe_fswatch(bytes)
            }
            Backend::Fswatch | Backend::Polling => HostCommandStreamControl::Continue,
        }
    }
}

impl CsvDecoder {
    fn new() -> Self {
        Self {
            field: Vec::new(),
            fields: Vec::new(),
            in_quotes: false,
            quote_pending: false,
        }
    }

    fn observe(&mut self, bytes: &[u8], overflowed: &AtomicBool) -> Vec<Vec<Vec<u8>>> {
        let mut records = Vec::new();
        for byte in bytes {
            if self.in_quotes {
                if self.quote_pending {
                    match byte {
                        b'"' => self.field.push(b'"'),
                        b',' => {
                            self.finish_field();
                            self.in_quotes = false;
                        }
                        b'\n' => {
                            self.finish_record(&mut records);
                            self.in_quotes = false;
                        }
                        b'\r' => {
                            self.in_quotes = false;
                        }
                        value => {
                            self.field.push(*value);
                            self.in_quotes = false;
                        }
                    }
                    self.quote_pending = false;
                } else if *byte == b'"' {
                    self.quote_pending = true;
                } else {
                    self.field.push(*byte);
                }
            } else {
                match byte {
                    b'"' if self.field.is_empty() => self.in_quotes = true,
                    b',' => self.finish_field(),
                    b'\n' => self.finish_record(&mut records),
                    b'\r' => {}
                    value => self.field.push(*value),
                }
            }
            if self.pending_len() > EVENT_FIELD_LIMIT {
                self.reset();
                overflowed.store(true, Ordering::Release);
            }
        }
        records
    }

    fn finish_field(&mut self) {
        self.fields.push(std::mem::take(&mut self.field));
    }

    fn finish_record(&mut self, records: &mut Vec<Vec<Vec<u8>>>) {
        self.finish_field();
        records.push(std::mem::take(&mut self.fields));
    }

    fn pending_len(&self) -> usize {
        self.field.len() + self.fields.iter().map(Vec::len).sum::<usize>()
    }

    fn reset(&mut self) {
        self.field.clear();
        self.fields.clear();
        self.in_quotes = false;
        self.quote_pending = false;
    }
}

impl StderrTail {
    fn new() -> Self {
        Self {
            bytes: Vec::new(),
            inotify_ready: false,
        }
    }

    fn observe(&mut self, bytes: &[u8], detect_inotify_ready: bool) -> bool {
        self.bytes.extend_from_slice(bytes);
        if self.bytes.len() > EVENT_FIELD_LIMIT {
            let keep_from = self.bytes.len() - EVENT_FIELD_LIMIT;
            self.bytes.drain(..keep_from);
        }
        if !detect_inotify_ready || self.inotify_ready {
            return false;
        }
        self.inotify_ready = self
            .bytes
            .windows(b"Watches established.".len())
            .any(|window| window == b"Watches established.");
        self.inotify_ready
    }
}

impl NulDecoder {
    fn new() -> Self {
        Self {
            field: Vec::new(),
            fields: Vec::new(),
            probe_path: None,
            ready: false,
        }
    }

    fn observe(&mut self, bytes: &[u8], overflowed: &AtomicBool) -> Vec<Vec<Vec<u8>>> {
        let mut records = Vec::new();
        for byte in bytes {
            if *byte == 0 {
                self.fields.push(std::mem::take(&mut self.field));
                if self.fields.len() == 2 {
                    records.push(std::mem::take(&mut self.fields));
                }
            } else {
                self.field.push(*byte);
            }
            if self.field.len() > EVENT_FIELD_LIMIT {
                self.field.clear();
                self.fields.clear();
                overflowed.store(true, Ordering::Release);
            }
        }
        records
    }

    fn classify(&mut self, record: &[Vec<u8>]) -> NulRecord {
        let [path, value] = record else {
            return NulRecord::Setup;
        };
        if path == b"AGENTSTART_PROBE" {
            self.probe_path = Some(String::from_utf8_lossy(value).into_owned());
            return NulRecord::Setup;
        }
        let path = String::from_utf8_lossy(path);
        if self
            .probe_path
            .as_deref()
            .is_some_and(|probe| path == probe || path.starts_with(&format!("{probe}/")))
        {
            if self.ready {
                NulRecord::Setup
            } else {
                self.ready = true;
                NulRecord::Ready
            }
        } else {
            NulRecord::Event
        }
    }
}

enum NulRecord {
    Event,
    Ready,
    Setup,
}

fn parse_inotify_record(root: &str, fields: &[Vec<u8>]) -> Option<FileChangeEvent> {
    let [directory, events, file] = fields else {
        return None;
    };
    let directory = String::from_utf8_lossy(directory);
    let file = String::from_utf8_lossy(file);
    let path = if file.is_empty() {
        directory.into_owned()
    } else if directory.ends_with('/') {
        format!("{directory}{file}")
    } else {
        format!("{directory}/{file}")
    };
    let path = absolute_event_path(root, &path)?;
    if is_ignored(root, &path) {
        return None;
    }
    let events = String::from_utf8_lossy(events);
    let is_directory = events.split(',').any(|event| event == "ISDIR");
    let kind = if events.contains("Q_OVERFLOW")
        || events.contains("DELETE_SELF")
        || events.contains("MOVE_SELF")
    {
        "overflow"
    } else if events.contains("MOVED_FROM") || events.contains("DELETE") {
        "delete"
    } else if events.contains("MOVED_TO") || events.contains("CREATE") {
        "create"
    } else {
        "update"
    };
    Some(FileChangeEvent {
        absolute_path: if kind == "overflow" {
            root.to_owned()
        } else {
            path
        },
        is_directory: (kind != "delete" && kind != "overflow").then_some(is_directory),
        kind,
        old_absolute_path: None,
    })
}

fn parse_fswatch_record(root: &str, fields: &[Vec<u8>]) -> Option<FileChangeEvent> {
    let [path, flags] = fields else {
        return None;
    };
    let path = absolute_event_path(root, &String::from_utf8_lossy(path))?;
    if is_ignored(root, &path) {
        return None;
    }
    let flags = String::from_utf8_lossy(flags).parse::<u32>().ok()?;
    let kind = if flags & 8_192 != 0 || flags & 16 != 0 && flags & (2 | 8 | 128 | 256) == 0 {
        "overflow"
    } else if flags & (8 | 128) != 0 {
        "delete"
    } else if flags & (2 | 256) != 0 {
        "create"
    } else {
        "update"
    };
    Some(FileChangeEvent {
        absolute_path: if kind == "overflow" {
            root.to_owned()
        } else {
            path
        },
        is_directory: match kind {
            "delete" | "overflow" => None,
            _ if flags & 1_024 != 0 => Some(true),
            _ if flags & 512 != 0 => Some(false),
            _ => None,
        },
        kind,
        old_absolute_path: None,
    })
}

fn absolute_event_path(root: &str, path: &str) -> Option<String> {
    let root = match root.trim_end_matches('/') {
        "" => "/",
        root => root,
    };
    if path.starts_with('/') {
        let is_inside = root == "/" || path == root || path.starts_with(&format!("{root}/"));
        let relative = path
            .strip_prefix(root)
            .unwrap_or(path)
            .trim_start_matches('/');
        (is_inside && has_safe_segments(relative)).then(|| path.to_owned())
    } else {
        let relative = path.strip_prefix("./").unwrap_or(path);
        (!relative.is_empty() && has_safe_segments(relative)).then(|| {
            if root == "/" {
                format!("/{relative}")
            } else {
                format!("{root}/{relative}")
            }
        })
    }
}

fn is_ignored(root: &str, path: &str) -> bool {
    path.strip_prefix(root)
        .unwrap_or(path)
        .trim_start_matches('/')
        .split('/')
        .any(|segment| super::WATCH_IGNORES.contains(&segment))
}

fn has_safe_segments(path: &str) -> bool {
    !path.split('/').any(|segment| matches!(segment, "." | ".."))
}

fn lock<T>(mutex: &Mutex<T>) -> MutexGuard<'_, T> {
    mutex
        .lock()
        .unwrap_or_else(std::sync::PoisonError::into_inner)
}
