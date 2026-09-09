pub(in crate::rpc) mod protocol;

use std::sync::atomic::{AtomicU64, Ordering};

// Why shared: both wire surfaces name subscriptions with the same
// connection-scoped identity, so the sequence lives here exactly once.
pub(super) fn subscription_id(connection_id: &str) -> String {
    static SUBSCRIPTION_SEQUENCE: AtomicU64 = AtomicU64::new(1);
    format!(
        "runtime-driver-events-{connection_id}-{}",
        SUBSCRIPTION_SEQUENCE.fetch_add(1, Ordering::Relaxed)
    )
}
