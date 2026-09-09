use std::collections::HashMap;
use std::sync::{Arc, Mutex, MutexGuard};
use std::time::{Duration, Instant};

use serde_json::{Map, Value};

use crate::diagnostics::{DiagnosticsTrace, TraceSpan};

const FAST_SUCCESS_THRESHOLD: Duration = Duration::from_millis(250);
const FAST_SUCCESS_WINDOW: Duration = Duration::from_secs(60);
const FAST_SUCCESS_BUDGET_PER_WINDOW: u16 = 60;
const SAMPLING_MAX_BUCKETS: usize = 512;

#[derive(Clone)]
pub(crate) struct GitCommandTrace {
    diagnostics: DiagnosticsTrace,
    sampling: Arc<Mutex<HashMap<String, SamplingBucket>>>,
}

pub(super) struct GitCommandSpan {
    sampling: Arc<Mutex<HashMap<String, SamplingBucket>>>,
    sampling_key: String,
    span: TraceSpan,
    started_at: Instant,
}

struct SamplingBucket {
    emitted: u16,
    window_started_at: Instant,
}

impl GitCommandTrace {
    pub(crate) fn new(diagnostics: DiagnosticsTrace) -> Self {
        Self {
            diagnostics,
            sampling: Arc::new(Mutex::new(HashMap::new())),
        }
    }

    pub(super) fn start(&self, args: &[String], cwd: &str) -> GitCommandSpan {
        let subcommand = subcommand(args);
        let mut attributes = Map::new();
        attributes.insert("cwd".to_owned(), Value::String(cwd.to_owned()));
        attributes.insert("git.arg_count".to_owned(), Value::from(args.len() as u64));
        attributes.insert(
            "git.subcommand".to_owned(),
            Value::String(subcommand.to_owned()),
        );
        attributes.insert("kind".to_owned(), Value::String("git".to_owned()));
        GitCommandSpan {
            sampling: Arc::clone(&self.sampling),
            sampling_key: format!("{subcommand}\0{cwd}"),
            span: self.diagnostics.start_span("git.exec", attributes),
            started_at: Instant::now(),
        }
    }
}

impl GitCommandSpan {
    pub(super) fn success(&mut self, exit_code: Option<i32>) {
        if let Some(exit_code) = exit_code {
            self.span
                .set_attribute("git.exit_code", Value::from(exit_code));
        } else {
            self.span
                .set_attribute("git.stopped_early", Value::Bool(true));
        }
        if self.started_at.elapsed() < FAST_SUCCESS_THRESHOLD && !self.admit_fast_success() {
            self.span.suppress();
            return;
        }
        self.span.success();
    }

    pub(super) fn failure(&mut self, cause: &str, exit_code: Option<i32>) {
        if let Some(exit_code) = exit_code {
            self.span
                .set_attribute("git.exit_code", Value::from(exit_code));
        }
        self.span.failure(cause);
    }

    pub(super) fn interrupt(&mut self, cause: &str) {
        self.span.interrupt(Some(cause));
    }

    fn admit_fast_success(&self) -> bool {
        let mut sampling = lock(&self.sampling);
        sampling.retain(|_, bucket| bucket.window_started_at.elapsed() < FAST_SUCCESS_WINDOW);
        let bucket = sampling
            .entry(self.sampling_key.clone())
            .or_insert(SamplingBucket {
                emitted: 0,
                window_started_at: self.started_at,
            });
        if bucket.window_started_at.elapsed() >= FAST_SUCCESS_WINDOW {
            *bucket = SamplingBucket {
                emitted: 0,
                window_started_at: self.started_at,
            };
        }
        let admitted = bucket.emitted < FAST_SUCCESS_BUDGET_PER_WINDOW;
        if admitted {
            bucket.emitted += 1;
        }
        while sampling.len() > SAMPLING_MAX_BUCKETS {
            let Some(oldest) = sampling
                .iter()
                .min_by_key(|(_, bucket)| bucket.window_started_at)
                .map(|(key, _)| key.clone())
            else {
                break;
            };
            sampling.remove(&oldest);
        }
        admitted
    }
}

fn subcommand(args: &[String]) -> &str {
    let mut index = 0;
    while index < args.len() {
        let argument = &args[index];
        if argument == "--" {
            return "<none>";
        }
        if global_option_with_operand(argument) {
            index += 2;
            continue;
        }
        if global_option_with_inline_operand(argument) || global_flag(argument) {
            index += 1;
            continue;
        }
        if !argument.starts_with('-') {
            return argument;
        }
        index += 1;
    }
    "<none>"
}

fn global_option_with_operand(argument: &str) -> bool {
    matches!(
        argument,
        "-c" | "-C"
            | "--git-dir"
            | "--work-tree"
            | "--config-env"
            | "--namespace"
            | "--exec-path"
            | "--super-prefix"
            | "--pathspec-from-file"
    )
}

fn global_option_with_inline_operand(argument: &str) -> bool {
    [
        "--git-dir=",
        "--work-tree=",
        "--config-env=",
        "--namespace=",
        "--exec-path=",
        "--super-prefix=",
        "--pathspec-from-file=",
    ]
    .iter()
    .any(|prefix| argument.starts_with(prefix))
        || (argument.starts_with("-c") && argument.len() > 2)
        || (argument.starts_with("-C") && argument.len() > 2)
}

fn global_flag(argument: &str) -> bool {
    matches!(
        argument,
        "--bare"
            | "--no-pager"
            | "--paginate"
            | "--literal-pathspecs"
            | "--glob-pathspecs"
            | "--noglob-pathspecs"
            | "--icase-pathspecs"
            | "--no-optional-locks"
            | "--pathspec-file-nul"
    )
}

fn lock<T>(mutex: &Mutex<T>) -> MutexGuard<'_, T> {
    mutex
        .lock()
        .unwrap_or_else(std::sync::PoisonError::into_inner)
}
