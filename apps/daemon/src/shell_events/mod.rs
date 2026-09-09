use std::collections::VecDeque;
use std::sync::atomic::{AtomicUsize, Ordering};
use std::sync::{Arc, Mutex, MutexGuard};

use serde::Serialize;
use serde_json::Number;
use tokio::sync::watch;

use crate::keybindings::KeybindingFileSnapshot;
use crate::star_nag::{StarNagDomainPromptMode, StarNagSurface};

const REPLAY_CAPACITY: usize = 256;

#[derive(Clone)]
pub(crate) struct ShellEventAuthority {
    inner: Arc<Inner>,
}

struct Inner {
    /// Why a plain atomic rather than folding this into `State`: mirrors Bun's
    /// `BunShellEventChannel.activeSubscribers` — a presence count with no ordering relationship
    /// to the event history/sequence, so it does not need the same lock.
    subscriber_count: AtomicUsize,
    state: Mutex<State>,
    wake: watch::Sender<u64>,
}

struct State {
    closed: bool,
    history: VecDeque<SequencedShellEvent>,
    sequence: u64,
}

#[derive(Clone)]
enum ShellEvent {
    KeybindingsChanged {
        snapshot: KeybindingFileSnapshot,
    },
    StarNagShow {
        mode: StarNagDomainPromptMode,
        surface: StarNagSurface,
    },
    StarNagHide,
}

#[derive(Clone)]
struct SequencedShellEvent {
    event: ShellEvent,
    sequence: u64,
}

#[derive(Debug, Serialize)]
#[serde(tag = "type", rename_all = "camelCase")]
pub(crate) enum ShellSubscriptionEvent {
    Ready {
        seq: ShellEventCursor,
    },
    Resync {
        seq: ShellEventCursor,
    },
    KeybindingsChanged {
        seq: ShellEventCursor,
        snapshot: KeybindingFileSnapshot,
    },
    StarNagShow {
        seq: ShellEventCursor,
        mode: StarNagDomainPromptMode,
        surface: StarNagSurface,
    },
    StarNagHide {
        seq: ShellEventCursor,
    },
}

#[derive(Clone, Debug, Serialize)]
#[serde(transparent)]
pub(crate) struct ShellEventCursor(Number);

pub(crate) struct ShellEventSubscription {
    authority: ShellEventAuthority,
    cursor: ShellEventCursor,
    initial: Option<ShellSubscriptionEvent>,
    pending: VecDeque<SequencedShellEvent>,
    wake: watch::Receiver<u64>,
}

impl ShellEventAuthority {
    pub(crate) fn new() -> Self {
        let (wake, _) = watch::channel(0);
        Self {
            inner: Arc::new(Inner {
                subscriber_count: AtomicUsize::new(0),
                state: Mutex::new(State {
                    closed: false,
                    history: VecDeque::with_capacity(REPLAY_CAPACITY),
                    sequence: 0,
                }),
                wake,
            }),
        }
    }

    pub(crate) fn publish_keybindings_changed(&self, snapshot: KeybindingFileSnapshot) {
        self.publish(ShellEvent::KeybindingsChanged { snapshot });
    }

    /// Why these two exist beside `publish_keybindings_changed` rather than a single generic
    /// `publish(ShellEvent)`: `ShellEvent` is a private enum of this module (matching how
    /// `KeybindingsChanged` was already the only variant) — callers construct events by domain
    /// intent, not by naming the internal representation.
    pub(crate) fn publish_star_nag_show(
        &self,
        mode: StarNagDomainPromptMode,
        surface: StarNagSurface,
    ) {
        self.publish(ShellEvent::StarNagShow { mode, surface });
    }

    pub(crate) fn publish_star_nag_hide(&self) {
        self.publish(ShellEvent::StarNagHide);
    }

    /// Why: mirrors Bun's `BunShellEventChannel.hasSubscribers()` — used to gate whether a Chrome
    /// audience actually exists before showing a nag/toast that would otherwise fire into a void.
    pub(crate) fn has_subscribers(&self) -> bool {
        self.inner.subscriber_count.load(Ordering::Acquire) > 0
    }

    fn publish(&self, event: ShellEvent) {
        let mut state = lock(&self.inner.state);
        if state.closed {
            return;
        }
        state.sequence = state.sequence.saturating_add(1);
        let sequence = state.sequence;
        state
            .history
            .push_back(SequencedShellEvent { event, sequence });
        while state.history.len() > REPLAY_CAPACITY {
            state.history.pop_front();
        }
        drop(state);
        self.inner.wake.send_replace(sequence);
    }

    pub(crate) fn subscribe(
        &self,
        last_seen_sequence: Option<ShellEventCursor>,
    ) -> ShellEventSubscription {
        // Why: install the wake receiver before reading the cursor so a publish cannot land in the
        // gap between the initial snapshot and the live subscription. Why increment here rather
        // than in `ShellEventSubscription`'s constructor: this is the only constructor.
        self.inner.subscriber_count.fetch_add(1, Ordering::AcqRel);
        let wake = self.inner.wake.subscribe();
        let state = lock(&self.inner.state);
        let cursor = last_seen_sequence
            .clone()
            .unwrap_or_else(|| ShellEventCursor::from_sequence(state.sequence));
        let (cursor, initial) = if last_seen_sequence.is_some() && requires_resync(&state, &cursor)
        {
            let cursor = ShellEventCursor::from_sequence(state.sequence);
            (
                cursor.clone(),
                ShellSubscriptionEvent::Resync { seq: cursor },
            )
        } else {
            (
                cursor.clone(),
                ShellSubscriptionEvent::Ready { seq: cursor },
            )
        };
        drop(state);
        ShellEventSubscription {
            authority: self.clone(),
            cursor,
            initial: Some(initial),
            pending: VecDeque::new(),
            wake,
        }
    }

    pub(crate) fn close(&self) {
        let mut state = lock(&self.inner.state);
        if state.closed {
            return;
        }
        state.closed = true;
        let sequence = state.sequence;
        drop(state);
        self.inner.wake.send_replace(sequence);
    }
}

impl ShellEventSubscription {
    pub(crate) async fn next(&mut self) -> Option<ShellSubscriptionEvent> {
        if let Some(initial) = self.initial.take() {
            return Some(initial);
        }
        loop {
            if let Some(entry) = self.pending.pop_front() {
                self.cursor = ShellEventCursor::from_sequence(entry.sequence);
                return Some(entry.into_subscription_event());
            }
            {
                let state = lock(&self.authority.inner.state);
                if requires_resync(&state, &self.cursor) {
                    self.cursor = ShellEventCursor::from_sequence(state.sequence);
                    return Some(ShellSubscriptionEvent::Resync {
                        seq: self.cursor.clone(),
                    });
                }
                let cursor = self.cursor.value();
                self.pending.extend(
                    state
                        .history
                        .iter()
                        .filter(|entry| entry.sequence as f64 > cursor)
                        .cloned(),
                );
                if let Some(entry) = self.pending.pop_front() {
                    self.cursor = ShellEventCursor::from_sequence(entry.sequence);
                    return Some(entry.into_subscription_event());
                }
                if state.closed {
                    return None;
                }
            }
            if self.wake.changed().await.is_err() {
                return None;
            }
        }
    }
}

/// Why: mirrors the `finally { this.activeSubscribers-- }` in Bun's `BunShellEventChannel.subscribe`
/// — the count must drop whenever a consumer disconnects, however that happens (normal stream end,
/// an aborted request, an error unwinding out of `dispatch_subscription`), so it belongs on `Drop`
/// rather than a specific call site.
impl Drop for ShellEventSubscription {
    fn drop(&mut self) {
        self.authority
            .inner
            .subscriber_count
            .fetch_sub(1, Ordering::AcqRel);
    }
}

impl SequencedShellEvent {
    fn into_subscription_event(self) -> ShellSubscriptionEvent {
        match self.event {
            ShellEvent::KeybindingsChanged { snapshot } => {
                ShellSubscriptionEvent::KeybindingsChanged {
                    seq: ShellEventCursor::from_sequence(self.sequence),
                    snapshot,
                }
            }
            ShellEvent::StarNagShow { mode, surface } => ShellSubscriptionEvent::StarNagShow {
                seq: ShellEventCursor::from_sequence(self.sequence),
                mode,
                surface,
            },
            ShellEvent::StarNagHide => ShellSubscriptionEvent::StarNagHide {
                seq: ShellEventCursor::from_sequence(self.sequence),
            },
        }
    }
}

impl ShellEventCursor {
    pub(crate) fn from_number(number: Number) -> Self {
        Self(number)
    }

    fn from_sequence(sequence: u64) -> Self {
        Self(Number::from(sequence))
    }

    // Why shared: the protobuf shell-events stream renders the same cursor the
    // legacy JSON channel serialized, so both read the numeric value here.
    pub(crate) fn value(&self) -> f64 {
        self.0.as_f64().unwrap_or(f64::NAN)
    }
}

fn requires_resync(state: &State, cursor: &ShellEventCursor) -> bool {
    let cursor = cursor.value();
    if cursor > state.sequence as f64 {
        return true;
    }
    state
        .history
        .front()
        .is_some_and(|oldest| cursor < oldest.sequence.saturating_sub(1) as f64)
}

fn lock<T>(mutex: &Mutex<T>) -> MutexGuard<'_, T> {
    mutex
        .lock()
        .unwrap_or_else(std::sync::PoisonError::into_inner)
}
