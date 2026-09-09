use std::sync::atomic::{AtomicBool, AtomicU64, Ordering};
use std::sync::mpsc::{Receiver, RecvTimeoutError, SyncSender, TrySendError, sync_channel};
use std::sync::{Arc, Mutex, MutexGuard};
use std::thread::JoinHandle;
use std::time::{Duration, Instant, SystemTime, UNIX_EPOCH};

use serde_json::{Map, Value, json};

use super::policy::DiagnosticsPolicy;
use super::trace_context::SpanIdentity;
use super::trace_file::{TRACE_MAX_BYTES, TraceFileWriter, trace_file_path};
use crate::redaction::redact_value;

const TRACE_BATCH_SIZE: usize = 32;
const TRACE_BATCH_WINDOW: Duration = Duration::from_millis(200);
const TRACE_QUEUE_CAPACITY: usize = TRACE_BATCH_SIZE;
const TRACE_CONTROL_TIMEOUT: Duration = Duration::from_secs(5);
const PROCESS_RSS_SAMPLE_INTERVAL: Duration = Duration::from_secs(15);

#[derive(Clone, Default)]
pub struct DiagnosticsTrace {
    sink: Option<Arc<TraceSink>>,
}

pub(crate) struct TraceSpan {
    pending: Option<PendingSpan>,
    trace: DiagnosticsTrace,
}

struct TraceSink {
    is_closed: AtomicBool,
    process_rss_bytes: Arc<AtomicU64>,
    sender: Mutex<Option<SyncSender<TraceCommand>>>,
    worker: Mutex<Option<JoinHandle<()>>>,
}

struct PendingSpan {
    attributes: Map<String, Value>,
    events: Vec<Value>,
    name: &'static str,
    parent_span_id: Option<String>,
    span_id: String,
    started_at: Instant,
    start_time_unix_nano: u128,
    trace_id: String,
}

enum TraceCommand {
    Flush(SyncSender<()>),
    Record(Vec<u8>),
    Shutdown(SyncSender<()>),
}

enum SpanExit<'a> {
    Failure(&'a str),
    Interrupted(Option<&'a str>),
    Success,
}

impl DiagnosticsTrace {
    pub(crate) fn new(user_data_path: &std::path::Path) -> Self {
        if !DiagnosticsPolicy::resolve().local_file_enabled {
            return Self::default();
        }
        let (sender, receiver) = sync_channel(TRACE_QUEUE_CAPACITY);
        let path = trace_file_path(user_data_path);
        let process_rss_bytes = Arc::new(AtomicU64::new(0));
        let worker_process_rss_bytes = Arc::clone(&process_rss_bytes);
        let worker = match std::thread::Builder::new()
            .name("yiru-diagnostics-trace".to_owned())
            .spawn(move || {
                trace_worker(
                    receiver,
                    TraceFileWriter::new(path),
                    worker_process_rss_bytes,
                );
            }) {
            Ok(worker) => worker,
            Err(_) => return Self::default(),
        };
        Self {
            sink: Some(Arc::new(TraceSink {
                is_closed: AtomicBool::new(false),
                process_rss_bytes,
                sender: Mutex::new(Some(sender)),
                worker: Mutex::new(Some(worker)),
            })),
        }
    }

    /// Starts a span that adopts whatever parent the current task is scoped to.
    ///
    /// Why this is the default: nested work — a Git command, a terminal session,
    /// an AI Vault scan — holds a `DiagnosticsTrace` but has no reference to the
    /// request that caused it. Reading the ambient parent here is what
    /// correlates those spans without threading a parent through every
    /// signature. Outside any scope this is a root, which is how the documented
    /// root boundaries behave.
    pub(crate) fn start_span(
        &self,
        name: &'static str,
        attributes: Map<String, Value>,
    ) -> TraceSpan {
        self.start_span_with_parent(name, attributes, SpanIdentity::current())
    }

    /// Starts a span that deliberately ignores any ambient parent.
    ///
    /// Why: a few boundaries begin a trace by definition, and must not be
    /// attached to whatever happened to be on the task that created them. See
    /// the callers for the reason each one is a root.
    pub(crate) fn start_root_span(
        &self,
        name: &'static str,
        attributes: Map<String, Value>,
    ) -> TraceSpan {
        self.start_span_with_parent(name, attributes, None)
    }

    fn start_span_with_parent(
        &self,
        name: &'static str,
        attributes: Map<String, Value>,
        parent: Option<SpanIdentity>,
    ) -> TraceSpan {
        let pending = self.sink.as_ref().and_then(|_| {
            let trace_id = match &parent {
                Some(parent) => parent.trace_id().to_owned(),
                None => random_hex::<16>()?,
            };
            Some(PendingSpan {
                attributes,
                events: Vec::new(),
                name,
                parent_span_id: parent.map(|parent| parent.span_id().to_owned()),
                span_id: random_hex::<8>()?,
                started_at: Instant::now(),
                start_time_unix_nano: unix_nanos(),
                trace_id,
            })
        });
        TraceSpan {
            pending,
            trace: self.clone(),
        }
    }

    pub(crate) fn flush(&self) {
        let Some(sink) = &self.sink else {
            return;
        };
        sink.flush();
    }

    pub(crate) fn shutdown(&self) {
        let Some(sink) = &self.sink else {
            return;
        };
        sink.shutdown();
    }

    pub(crate) fn process_rss_bytes(&self) -> Option<u64> {
        self.sink
            .as_ref()
            .map(|sink| sink.process_rss_bytes.load(Ordering::Relaxed))
            .filter(|rss_bytes| *rss_bytes > 0)
    }

    fn record(&self, record: Value) {
        let Some(sink) = &self.sink else {
            return;
        };
        let Ok(mut line) = serde_json::to_vec(&redact_value(record)) else {
            return;
        };
        line.push(b'\n');
        if line.len() as u64 > TRACE_MAX_BYTES {
            return;
        }
        sink.record(line);
    }
}

impl TraceSpan {
    /// Starts a child of this span using the same linkage the ambient parent
    /// uses, for the case where the parent is already in lexical scope.
    pub(crate) fn child(&self, name: &'static str, attributes: Map<String, Value>) -> Self {
        self.trace
            .start_span_with_parent(name, attributes, self.identity())
    }

    /// This span's identity, for handing across a boundary the ambient context
    /// deliberately does not cross — notably `tokio::spawn`.
    pub(crate) fn identity(&self) -> Option<SpanIdentity> {
        self.pending
            .as_ref()
            .map(|pending| SpanIdentity::new(&pending.trace_id, &pending.span_id))
    }

    /// Runs `future` with this span as the ambient parent.
    ///
    /// Why it takes `&self`: the borrow ends when the future completes, so the
    /// caller can still finish the span afterwards with the outcome.
    pub(crate) async fn scope<F>(&self, future: F) -> F::Output
    where
        F: std::future::Future,
    {
        super::trace_context::scope_optional(self.identity(), future).await
    }

    pub(crate) fn set_attribute(&mut self, key: &'static str, value: Value) {
        if let Some(pending) = &mut self.pending {
            pending.attributes.insert(key.to_owned(), value);
        }
    }

    pub(crate) fn failure(&mut self, cause: &str) {
        self.finish(SpanExit::Failure(cause));
    }

    pub(crate) fn interrupt(&mut self, cause: Option<&str>) {
        self.finish(SpanExit::Interrupted(cause));
    }

    pub(crate) fn success(&mut self) {
        self.finish(SpanExit::Success);
    }

    pub(crate) fn suppress(&mut self) {
        self.pending = None;
    }

    fn finish(&mut self, exit: SpanExit<'_>) {
        let Some(pending) = self.pending.take() else {
            return;
        };
        let end_time_unix_nano = unix_nanos();
        let duration_ms = pending.started_at.elapsed().as_secs_f64() * 1_000.0;
        let exit = match exit {
            SpanExit::Failure(cause) => json!({ "_tag": "Failure", "cause": cause }),
            SpanExit::Interrupted(Some(cause)) => {
                json!({ "_tag": "Interrupted", "cause": cause })
            }
            SpanExit::Interrupted(None) => json!({ "_tag": "Interrupted" }),
            SpanExit::Success => json!({ "_tag": "Success" }),
        };
        let mut record = json!({
            "type": "effect-span",
            "name": pending.name,
            "traceId": pending.trace_id,
            "spanId": pending.span_id,
            "kind": "internal",
            "startTimeUnixNano": pending.start_time_unix_nano.to_string(),
            "endTimeUnixNano": end_time_unix_nano.to_string(),
            "durationMs": duration_ms,
            "attributes": pending.attributes,
            "events": pending.events,
            "exit": exit
        });
        if let Some(parent_span_id) = pending.parent_span_id
            && let Some(record) = record.as_object_mut()
        {
            record.insert("parentSpanId".to_owned(), Value::String(parent_span_id));
        }
        self.trace.record(record);
    }
}

impl Drop for TraceSpan {
    fn drop(&mut self) {
        self.finish(SpanExit::Interrupted(None));
    }
}

impl TraceSink {
    fn record(&self, line: Vec<u8>) {
        if self.is_closed.load(Ordering::Acquire) {
            return;
        }
        let sender = lock(&self.sender).as_ref().cloned();
        if let Some(sender) = sender
            && let Err(TrySendError::Disconnected(_)) = sender.try_send(TraceCommand::Record(line))
        {
            self.is_closed.store(true, Ordering::Release);
        }
    }

    fn flush(&self) {
        if self.is_closed.load(Ordering::Acquire) {
            return;
        }
        let (sender, receiver) = sync_channel(0);
        let trace_sender = lock(&self.sender).as_ref().cloned();
        if trace_sender
            .is_some_and(|trace_sender| trace_sender.send(TraceCommand::Flush(sender)).is_ok())
        {
            let _ = receiver.recv_timeout(TRACE_CONTROL_TIMEOUT);
        }
    }

    fn shutdown(&self) {
        if self.is_closed.swap(true, Ordering::AcqRel) {
            return;
        }
        let (sender, receiver) = sync_channel(0);
        // Why: taking the sole producer makes shutdown terminal even when its acknowledgement is
        // lost; the worker either receives Shutdown or observes disconnection, and is always joined.
        let trace_sender = lock(&self.sender).take();
        if trace_sender.is_some_and(|trace_sender| {
            trace_sender
                .try_send(TraceCommand::Shutdown(sender))
                .is_ok()
        }) {
            let _ = receiver.recv_timeout(TRACE_CONTROL_TIMEOUT);
        }
        if let Some(worker) = lock(&self.worker).take() {
            let _ = worker.join();
        }
    }
}

impl Drop for TraceSink {
    fn drop(&mut self) {
        if !self.is_closed.swap(true, Ordering::AcqRel) {
            let (sender, receiver) = sync_channel(0);
            let trace_sender = self
                .sender
                .get_mut()
                .unwrap_or_else(std::sync::PoisonError::into_inner)
                .take();
            if trace_sender.is_some_and(|trace_sender| {
                trace_sender
                    .try_send(TraceCommand::Shutdown(sender))
                    .is_ok()
            }) {
                let _ = receiver.recv_timeout(TRACE_CONTROL_TIMEOUT);
            }
        }
        let worker = self
            .worker
            .get_mut()
            .unwrap_or_else(std::sync::PoisonError::into_inner)
            .take();
        if let Some(worker) = worker {
            let _ = worker.join();
        }
    }
}

fn trace_worker(
    receiver: Receiver<TraceCommand>,
    mut writer: TraceFileWriter,
    process_rss_bytes: Arc<AtomicU64>,
) {
    let mut batch = Vec::with_capacity(TRACE_BATCH_SIZE);
    let mut flush_at: Option<Instant> = None;
    let mut rss_sampler = ProcessRssSampler::new();
    refresh_process_rss(&mut rss_sampler, &process_rss_bytes);
    let mut sample_rss_at = Instant::now() + PROCESS_RSS_SAMPLE_INTERVAL;
    loop {
        let now = Instant::now();
        if flush_at.is_some_and(|deadline| deadline <= now) {
            write_batch(&mut writer, &mut batch);
            writer.flush();
            flush_at = None;
        }
        if sample_rss_at <= now {
            refresh_process_rss(&mut rss_sampler, &process_rss_bytes);
            sample_rss_at = now + PROCESS_RSS_SAMPLE_INTERVAL;
        }
        let deadline = flush_at.map_or(sample_rss_at, |flush_at| flush_at.min(sample_rss_at));
        let command =
            match receiver.recv_timeout(deadline.saturating_duration_since(Instant::now())) {
                Ok(command) => command,
                Err(RecvTimeoutError::Timeout) => continue,
                Err(RecvTimeoutError::Disconnected) => break,
            };
        match command {
            TraceCommand::Record(line) => {
                if batch.is_empty() {
                    flush_at = Some(Instant::now() + TRACE_BATCH_WINDOW);
                }
                batch.push(line);
                if batch.len() >= TRACE_BATCH_SIZE {
                    write_batch(&mut writer, &mut batch);
                    flush_at = None;
                }
            }
            TraceCommand::Flush(acknowledgement) => {
                write_batch(&mut writer, &mut batch);
                writer.flush();
                let _ = acknowledgement.send(());
                flush_at = None;
            }
            TraceCommand::Shutdown(acknowledgement) => {
                write_batch(&mut writer, &mut batch);
                writer.flush();
                let _ = acknowledgement.send(());
                return;
            }
        }
    }
    write_batch(&mut writer, &mut batch);
    writer.flush();
}

fn refresh_process_rss(sampler: &mut ProcessRssSampler, process_rss_bytes: &AtomicU64) {
    process_rss_bytes.store(sampler.sample().unwrap_or(0), Ordering::Relaxed);
}

#[cfg(any(unix, windows))]
struct ProcessRssSampler {
    pid: sysinfo::Pid,
    system: sysinfo::System,
}

#[cfg(any(unix, windows))]
impl ProcessRssSampler {
    fn new() -> Self {
        Self {
            pid: sysinfo::Pid::from_u32(std::process::id()),
            system: sysinfo::System::new(),
        }
    }

    fn sample(&mut self) -> Option<u64> {
        use sysinfo::{ProcessRefreshKind, ProcessesToUpdate};

        self.system.refresh_processes_specifics(
            ProcessesToUpdate::Some(&[self.pid]),
            true,
            ProcessRefreshKind::nothing().with_memory().without_tasks(),
        );
        self.system.process(self.pid).map(sysinfo::Process::memory)
    }
}

#[cfg(not(any(unix, windows)))]
struct ProcessRssSampler;

#[cfg(not(any(unix, windows)))]
impl ProcessRssSampler {
    fn new() -> Self {
        Self
    }

    fn sample(&mut self) -> Option<u64> {
        None
    }
}

fn write_batch(writer: &mut TraceFileWriter, batch: &mut Vec<Vec<u8>>) {
    for line in batch.drain(..) {
        writer.append(&line);
    }
}

fn random_hex<const N: usize>() -> Option<String> {
    let mut bytes = [0_u8; N];
    getrandom::fill(&mut bytes).ok()?;
    Some(
        bytes
            .into_iter()
            .map(|byte| format!("{byte:02x}"))
            .collect(),
    )
}

fn unix_nanos() -> u128 {
    SystemTime::now()
        .duration_since(UNIX_EPOCH)
        .unwrap_or_default()
        .as_nanos()
}

fn lock<T>(mutex: &Mutex<T>) -> MutexGuard<'_, T> {
    mutex
        .lock()
        .unwrap_or_else(std::sync::PoisonError::into_inner)
}
