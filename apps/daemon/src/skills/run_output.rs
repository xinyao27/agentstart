use std::sync::{Mutex, MutexGuard};
use tokio::sync::watch;

use crate::hosts::{HostCommandOutputObserver, HostCommandOutputStream, HostCommandStreamControl};

const MAX_BUFFER_BYTES: usize = 64 * 1024;

pub(super) struct SkillRunOutput {
    bytes: Mutex<Vec<u8>>,
    changes: watch::Sender<u64>,
}

impl SkillRunOutput {
    pub(super) fn new() -> Self {
        let (changes, _) = watch::channel(0);
        Self {
            bytes: Mutex::new(Vec::new()),
            changes,
        }
    }

    pub(super) fn subscribe(&self) -> watch::Receiver<u64> {
        self.changes.subscribe()
    }

    pub(super) fn text(&self) -> String {
        let bytes = lock(&self.bytes);
        let normalized = String::from_utf8_lossy(&strip_ansi(&bytes)).replace('\r', "\n");
        super::clamp_output(normalized)
    }
}

impl HostCommandOutputObserver for SkillRunOutput {
    fn observe(&self, _stream: HostCommandOutputStream, bytes: &[u8]) -> HostCommandStreamControl {
        let mut output = lock(&self.bytes);
        output.extend_from_slice(bytes);
        if output.len() > MAX_BUFFER_BYTES {
            let excess = output.len() - MAX_BUFFER_BYTES;
            output.drain(..excess);
        }
        drop(output);
        self.changes
            .send_modify(|version| *version = version.wrapping_add(1));
        HostCommandStreamControl::Continue
    }
}

fn strip_ansi(bytes: &[u8]) -> Vec<u8> {
    let mut output = Vec::with_capacity(bytes.len());
    let mut cursor = 0;
    while cursor < bytes.len() {
        if bytes[cursor..].starts_with(b"\x1b[") {
            let mut end = cursor + 2;
            while end < bytes.len()
                && (bytes[end].is_ascii_digit() || matches!(bytes[end], b';' | b'?'))
            {
                end += 1;
            }
            if end < bytes.len() && bytes[end].is_ascii_alphabetic() {
                cursor = end + 1;
                continue;
            }
        }
        output.push(bytes[cursor]);
        cursor += 1;
    }
    output
}

fn lock<T>(mutex: &Mutex<T>) -> MutexGuard<'_, T> {
    mutex
        .lock()
        .unwrap_or_else(std::sync::PoisonError::into_inner)
}
