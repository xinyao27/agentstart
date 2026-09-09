use std::sync::atomic::Ordering;

use serde_json::{Value, json};

use super::{
    Provider, ProviderUsageAuthority, ProviderUsageError, SCAN_STALE_MS, bool_field, now_ms,
    number_field,
};
use super::{claude, codex, opencode};

struct ScanningFlag<'a>(&'a std::sync::atomic::AtomicBool);
impl Drop for ScanningFlag<'_> {
    fn drop(&mut self) {
        self.0.store(false, Ordering::Release);
    }
}

pub(super) async fn run(
    authority: &ProviderUsageAuthority,
    provider: Provider,
    force: bool,
) -> Result<(), ProviderUsageError> {
    let slot = authority.slot(provider);
    let (previous, enabled_revision) = {
        let _guard = slot.write_gate.lock().await;
        let state = authority.read(provider).await?;
        if !bool_field(state.get("scanState"), "enabled", true) {
            return Ok(());
        }
        (state, slot.enabled_revision.load(Ordering::Acquire))
    };
    let worktrees = match &authority.worktree_sources {
        Some(sources) => sources.load().await,
        None => Err(ProviderUsageError::Scan(
            "Provider usage worktree sources are unavailable".to_owned(),
        )),
    };
    let fingerprint = worktrees
        .as_ref()
        .ok()
        .and_then(|worktrees| serde_json::to_string(worktrees).ok());
    let fresh = number_field(previous.get("scanState"), "lastScanCompletedAt")
        .and_then(|value| i64::try_from(value).ok())
        .and_then(|value| now_ms().checked_sub(value))
        .is_some_and(|age| (0..SCAN_STALE_MS).contains(&age));
    let same_worktrees =
        fingerprint.as_deref() == previous.get("worktreeFingerprint").and_then(Value::as_str);
    let expected_schema = match provider {
        Provider::Claude => claude::SCHEMA_VERSION,
        Provider::Codex => codex::SCHEMA_VERSION,
        Provider::OpenCode => opencode::SCHEMA_VERSION,
    };
    let compatible = previous.get("schemaVersion").and_then(Value::as_u64) == Some(expected_schema);
    if !force && fresh && same_worktrees && compatible {
        return Ok(());
    }
    {
        let _guard = slot.write_gate.lock().await;
        let mut state = authority.read(provider).await?;
        if !bool_field(state.get("scanState"), "enabled", true) {
            return Ok(());
        }
        state["scanState"]["lastScanStartedAt"] = json!(now_ms());
        state["scanState"]["lastScanError"] = Value::Null;
        authority.write(provider, &state).await?;
        slot.is_scanning.store(true, Ordering::Release);
    }
    let _scanning = ScanningFlag(&slot.is_scanning);
    let scanned = match provider {
        Provider::Claude => match worktrees {
            Ok(worktrees) => tokio::task::spawn_blocking(move || claude::scan(previous, worktrees))
                .await
                .map_err(|error| ProviderUsageError::Scan(error.to_string()))
                .and_then(|result| result),
            Err(error) => Err(error),
        },
        Provider::Codex => match worktrees {
            Ok(worktrees) => {
                let root = authority.root.clone();
                tokio::task::spawn_blocking(move || codex::scan(root, previous, worktrees))
                    .await
                    .map_err(|error| ProviderUsageError::Scan(error.to_string()))
                    .and_then(|result| result)
            }
            Err(error) => Err(error),
        },
        Provider::OpenCode => match worktrees {
            Ok(worktrees) => {
                tokio::task::spawn_blocking(move || opencode::scan(previous, worktrees))
                    .await
                    .map_err(|error| ProviderUsageError::Scan(error.to_string()))
                    .and_then(|result| result)
            }
            Err(error) => Err(error),
        },
    };
    let _guard = slot.write_gate.lock().await;
    let mut state = authority.read(provider).await?;
    // Why: a scan may finish after the user disables it; retain that decision and the last successful cache.
    if !bool_field(state.get("scanState"), "enabled", true)
        || slot.enabled_revision.load(Ordering::Acquire) != enabled_revision
    {
        return Ok(());
    }
    match scanned {
        Ok(result) => {
            for key in [
                "schemaVersion",
                "processedFiles",
                "processedDatabases",
                "sessions",
                "dailyAggregates",
                "ownershipGeneration",
            ] {
                if let Some(value) = result.get(key) {
                    state[key] = value.clone();
                }
            }
            state["worktreeFingerprint"] = json!(fingerprint);
            state["scanState"]["lastScanCompletedAt"] = json!(now_ms());
            state["scanState"]["lastScanError"] = Value::Null;
        }
        Err(error) => state["scanState"]["lastScanError"] = json!(error.to_string()),
    }
    authority.write(provider, &state).await
}
