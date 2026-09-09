use std::future::Future;
use std::sync::Arc;

tokio::task_local! {
    /// The span every new span started on this task adopts as its parent.
    ///
    /// Why a task-local rather than a global: a value set here is visible only to
    /// the task that established the scope and to futures awaited inside it. It
    /// is never observable from another task, so two requests running
    /// concurrently cannot read each other's parent. `tokio::spawn` deliberately
    /// does not carry task-locals into the new task, which is what makes the
    /// isolation structural instead of a convention — a spawned task begins with
    /// no parent and can only acquire one by being handed an identity
    /// explicitly.
    static CURRENT_PARENT: SpanIdentity;
}

/// The identity of a span, cheap enough to carry on every nested call.
///
/// Why `Arc<str>`: the two hex identifiers are immutable for a span's lifetime,
/// so a clone is two reference-count bumps rather than two heap copies. Nothing
/// mutable is shared, so a captured identity cannot be altered by the span it
/// came from.
#[derive(Clone)]
pub(crate) struct SpanIdentity {
    span_id: Arc<str>,
    trace_id: Arc<str>,
}

impl SpanIdentity {
    pub(super) fn new(trace_id: &str, span_id: &str) -> Self {
        Self {
            span_id: Arc::from(span_id),
            trace_id: Arc::from(trace_id),
        }
    }

    pub(super) fn span_id(&self) -> &str {
        &self.span_id
    }

    pub(super) fn trace_id(&self) -> &str {
        &self.trace_id
    }

    /// The parent established for the current task, if any.
    ///
    /// Why `try_with`: outside a scope, off the runtime, or on a task that never
    /// received an identity, this is simply `None` and the caller starts a root.
    /// A missing context is never an error.
    pub(super) fn current() -> Option<Self> {
        CURRENT_PARENT.try_with(Clone::clone).ok()
    }

    /// Runs `future` with `self` as the parent adopted by spans started inside
    /// it, including spans created by code that cannot see this span.
    ///
    /// Why scoped rather than an enter/exit guard: the value lives exactly as
    /// long as the future. If the future is dropped mid-flight — a cancelled
    /// request, an aborted task, a `select!` losing a branch — the scope is
    /// dropped with it and nothing has to be unwound by hand, so cancellation
    /// cannot strand a parent behind for a later unrelated span to inherit.
    pub(crate) async fn scope<F>(self, future: F) -> F::Output
    where
        F: Future,
    {
        CURRENT_PARENT.scope(self, future).await
    }
}

/// Runs `future` under `identity` when there is one, and unchanged otherwise.
///
/// Why: tracing can be switched off by consent policy, in which case spans carry
/// no identity. Callers should not have to branch on that.
pub(crate) async fn scope_optional<F>(identity: Option<SpanIdentity>, future: F) -> F::Output
where
    F: Future,
{
    match identity {
        Some(identity) => identity.scope(future).await,
        None => future.await,
    }
}
