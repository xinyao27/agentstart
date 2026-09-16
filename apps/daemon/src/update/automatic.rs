use std::time::{SystemTime, UNIX_EPOCH};

use serde_json::{Map, Value, json};

use crate::ui::UiAuthority;

use super::UpdateCheckOptions;
use super::service::{DaemonUpdater, DaemonUpdaterAutomaticOutcome, DaemonUpdaterError};

/// How long one check suppresses the next, so restarting the daemon is not a network call.
const AUTOMATIC_CHECK_TTL_MS: u64 = 20 * 60 * 60 * 1_000;
/// Where the check records itself, as epoch milliseconds.
const LAST_CHECK_KEY: &str = "lastUpdateCheckAt";

/// Checks for a release as the runtime comes up, and installs it when the daemon owns its binary.
///
/// Why: the caller is startup, so this never blocks the daemon from reaching ready — the network
/// work happens in a spawned task and a failure only logs. A channel that manages the binary itself
/// (Homebrew, the npm shim, the macOS app bundle) reports `automatic: false` and returns here, so
/// nothing is checked, downloaded, or replaced for an install the daemon must not touch.
pub(crate) fn spawn_startup_automatic_update(updater: DaemonUpdater, ui: UiAuthority) {
    if !updater.support().automatic {
        return;
    }
    if last_check_is_recent(&ui) {
        return;
    }
    tokio::spawn(async move {
        match updater
            .run_automatic_update(UpdateCheckOptions::default())
            .await
        {
            // Why: recording the attempt either way keeps a failure from retrying on every launch.
            Ok(DaemonUpdaterAutomaticOutcome::Installed) => {
                record_check(&ui);
                eprintln!("[update] installed an automatic update; restarting into it");
            }
            Ok(DaemonUpdaterAutomaticOutcome::NotAvailable) => record_check(&ui),
            // Why: the run never reached the release lookup because a manual check owns the
            // updater and will finish the same work. Consuming the gate here would suppress the
            // next automatic check for a day over nothing.
            Err(DaemonUpdaterError::InProgress) => {}
            Err(error) => {
                record_check(&ui);
                // Why: nobody asked for this check, so its failure belongs in the updater status
                // for a client to render, never in a prompt of its own.
                eprintln!("[update] automatic update check failed: {}", error.code());
            }
        }
    });
}

fn last_check_is_recent(ui: &UiAuthority) -> bool {
    let checked_at = ui.get().get(LAST_CHECK_KEY).and_then(Value::as_u64);
    let (Some(checked_at), Some(now)) = (checked_at, now_millis()) else {
        return false;
    };
    now.saturating_sub(checked_at) < AUTOMATIC_CHECK_TTL_MS
}

fn record_check(ui: &UiAuthority) {
    let Some(now) = now_millis() else {
        return;
    };
    ui.set(Map::from_iter([(LAST_CHECK_KEY.to_owned(), json!(now))]));
}

fn now_millis() -> Option<u64> {
    SystemTime::now()
        .duration_since(UNIX_EPOCH)
        .ok()
        .map(|elapsed| u64::try_from(elapsed.as_millis()).unwrap_or(u64::MAX))
}
