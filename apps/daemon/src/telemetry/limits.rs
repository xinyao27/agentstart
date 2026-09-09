use std::collections::HashMap;
use std::time::Instant;

const DEFAULT_CAPACITY: f64 = 30.0;
const AGENT_ERROR_CAPACITY: f64 = 20.0;
const WINDOW_SECONDS: f64 = 60.0;
const SESSION_CEILING: u16 = 1_000;
const CONSENT_CEILING: u8 = 5;

struct Bucket {
    tokens: f64,
    capacity: f64,
    last_refill: Instant,
    warned: bool,
}

#[derive(Default)]
pub(super) struct SessionLimits {
    buckets: HashMap<String, Bucket>,
    consent_count: u8,
    consent_warned: bool,
    session_count: u16,
    session_warned: bool,
}

impl SessionLimits {
    pub(super) fn consume_event(&mut self, name: &str) -> bool {
        let now = Instant::now();
        let capacity = if name == "agent_error" {
            AGENT_ERROR_CAPACITY
        } else {
            DEFAULT_CAPACITY
        };
        let bucket = self.buckets.entry(name.to_owned()).or_insert(Bucket {
            tokens: capacity,
            capacity,
            last_refill: now,
            warned: false,
        });
        let elapsed = now.duration_since(bucket.last_refill).as_secs_f64();
        if elapsed > 0.0 {
            bucket.tokens =
                (bucket.tokens + elapsed / WINDOW_SECONDS * bucket.capacity).min(bucket.capacity);
            bucket.last_refill = now;
        }
        if bucket.tokens < 1.0 {
            if !bucket.warned {
                bucket.warned = true;
                eprintln!(
                    "[telemetry] per-event burst cap hit for '{name}'; dropping further events"
                );
            }
            return false;
        }
        if self.session_count >= SESSION_CEILING {
            if !self.session_warned {
                self.session_warned = true;
                eprintln!(
                    "[telemetry] per-session event ceiling ({SESSION_CEILING}) hit; dropping further events"
                );
            }
            return false;
        }
        bucket.tokens -= 1.0;
        self.session_count += 1;
        true
    }

    pub(super) fn consume_consent(&mut self) -> bool {
        if self.consent_count >= CONSENT_CEILING {
            if !self.consent_warned {
                self.consent_warned = true;
                eprintln!(
                    "[telemetry] consent-mutation rate limit ({CONSENT_CEILING}/session) hit; dropping further mutations"
                );
            }
            return false;
        }
        self.consent_count += 1;
        true
    }
}
