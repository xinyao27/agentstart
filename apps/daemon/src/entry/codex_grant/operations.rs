use std::collections::{HashMap, HashSet};

use serde_json::{Map, Value, json};

use super::model::{CapturedTrustMove, EntryRequest, GrantError, GrantRequest, TrustMove};
use super::session::{self, AppServerRpc};
use super::trust_key;

#[derive(Clone)]
struct HookListing {
    command: Option<String>,
    current_hash: String,
    enabled: bool,
    key: String,
    trust_status: String,
}

pub(super) async fn execute(request: EntryRequest) -> Result<Value, GrantError> {
    match request {
        EntryRequest::Grant(request) => grant(request).await,
        EntryRequest::Inspect {
            hooks_list_cwd,
            invocation,
            moves,
        } => {
            session::run(invocation, move |rpc| {
                Box::pin(inspect(rpc, hooks_list_cwd, moves))
            })
            .await
        }
        EntryRequest::Repair {
            hooks_list_cwd,
            invocation,
            moves,
        } => {
            session::run(invocation, move |rpc| {
                Box::pin(repair(rpc, hooks_list_cwd, moves))
            })
            .await
        }
    }
}

async fn grant(request: GrantRequest) -> Result<Value, GrantError> {
    let GrantRequest {
        expected_trust_keys,
        hooks_list_cwd,
        invocation,
        managed_command,
    } = request;
    session::run(invocation, move |rpc| {
        Box::pin(async move {
            let expected = expected_trust_keys.into_iter().collect::<HashSet<_>>();
            let listed = list_hooks(rpc, &hooks_list_cwd).await?;
            let managed = managed_listings(&listed, &managed_command, &expected);
            let coverage = normalized_coverage(&managed);
            if managed.len() != expected.len() || !contains_every(&coverage, &expected) {
                return Ok(json!({
                    "outcome": "verify-failed",
                    "reason": format!(
                        "hooks/list reported {} entries covering {} of {} expected managed entries",
                        managed.len(),
                        coverage.len(),
                        expected.len()
                    )
                }));
            }
            let needing_trust = managed
                .iter()
                .filter(|listing| listing.trust_status != "trusted")
                .cloned()
                .collect::<Vec<_>>();
            if !needing_trust.is_empty() {
                let value = needing_trust
                    .iter()
                    .map(|listing| {
                        (
                            listing.key.clone(),
                            json!({ "trusted_hash": listing.current_hash }),
                        )
                    })
                    .collect::<Map<_, _>>();
                rpc.request(
                    "config/batchWrite",
                    Some(json!({
                        "edits": [{
                            "keyPath": "hooks.state",
                            "value": value,
                            "mergeStrategy": "upsert"
                        }],
                        "reloadUserConfig": true
                    })),
                )
                .await?;
            }
            let verified = list_hooks(rpc, &hooks_list_cwd).await?;
            let verified = managed_listings(&verified, &managed_command, &expected);
            let coverage = normalized_coverage(&verified);
            let untrusted = verified
                .iter()
                .filter(|listing| listing.trust_status != "trusted")
                .collect::<Vec<_>>();
            if verified.len() != expected.len()
                || !contains_every(&coverage, &expected)
                || !untrusted.is_empty()
            {
                let reason = if let Some(listing) = untrusted.first() {
                    format!(
                        "post-grant verify left {} entries {}",
                        untrusted.len(),
                        listing.trust_status
                    )
                } else {
                    format!(
                        "post-grant verify reported {} entries covering {} of {} expected entries",
                        verified.len(),
                        coverage.len(),
                        expected.len()
                    )
                };
                return Ok(json!({ "outcome": "verify-failed", "reason": reason }));
            }
            Ok(json!({
                "outcome": "granted",
                "wroteTrust": !needing_trust.is_empty(),
                "entries": verified.into_iter().map(|listing| json!({
                    "key": listing.key,
                    "normalizedKey": trust_key::normalize(&listing.key),
                    "trustedHash": listing.current_hash
                })).collect::<Vec<_>>()
            }))
        })
    })
    .await
}

async fn inspect(
    rpc: &mut AppServerRpc,
    hooks_list_cwd: String,
    moves: Vec<TrustMove>,
) -> Result<Value, GrantError> {
    let listings = list_hooks(rpc, &hooks_list_cwd).await?;
    let matched = matching_listings(
        &listings,
        moves.iter().map(|entry| (&entry.old_key, &entry.command)),
    );
    if matched.len() != moves.len() {
        return Err(GrantError::Message(format!(
            "pre-mutation hooks/list reported {} of {} moved user hooks",
            matched.len(),
            moves.len()
        )));
    }
    let mut captured = Vec::with_capacity(moves.len());
    for entry in &moves {
        let normalized = trust_key::normalize(&entry.old_key);
        let listing = matched.get(&normalized).ok_or_else(|| {
            GrantError::Message(format!(
                "pre-mutation hooks/list did not report moved user hook {}",
                entry.old_key
            ))
        })?;
        captured.push(json!({
            "oldKey": entry.old_key,
            "newKey": entry.new_key,
            "command": entry.command,
            "reportedOldKey": listing.key,
            "wasTrusted": listing.trust_status == "trusted",
            "enabled": listing.enabled
        }));
    }
    Ok(json!({ "outcome": "inspected", "moves": captured }))
}

async fn repair(
    rpc: &mut AppServerRpc,
    hooks_list_cwd: String,
    moves: Vec<CapturedTrustMove>,
) -> Result<Value, GrantError> {
    let listings = list_hooks(rpc, &hooks_list_cwd).await?;
    let matched = matching_listings(
        &listings,
        moves.iter().map(|entry| (&entry.new_key, &entry.command)),
    );
    if matched.len() != moves.len() {
        return Err(GrantError::Message(format!(
            "post-mutation hooks/list reported {} of {} moved user hooks",
            matched.len(),
            moves.len()
        )));
    }
    let mut seen = HashSet::new();
    let mut keys_to_clear = Vec::new();
    for key in moves.iter().map(|entry| entry.reported_old_key.as_str()) {
        if seen.insert(key.to_owned()) {
            keys_to_clear.push(key.to_owned());
        }
    }
    for listing in matched.values() {
        if seen.insert(listing.key.clone()) {
            keys_to_clear.push(listing.key.clone());
        }
    }
    let mut edits = keys_to_clear
        .into_iter()
        .map(|key| {
            json!({
                "keyPath": quoted_key_path(&key),
                "value": null,
                "mergeStrategy": "replace"
            })
        })
        .collect::<Vec<_>>();
    for entry in &moves {
        let normalized = trust_key::normalize(&entry.new_key);
        let listing = matched.get(&normalized).ok_or_else(|| {
            GrantError::Message(format!(
                "post-mutation hooks/list did not report moved user hook {}",
                entry.new_key
            ))
        })?;
        if entry.was_trusted {
            let mut value = Map::new();
            value.insert(
                "trusted_hash".to_owned(),
                Value::String(listing.current_hash.clone()),
            );
            if !entry.enabled {
                value.insert("enabled".to_owned(), Value::Bool(false));
            }
            edits.push(json!({
                "keyPath": quoted_key_path(&listing.key),
                "value": value,
                "mergeStrategy": "replace"
            }));
        } else if !entry.enabled {
            edits.push(json!({
                "keyPath": quoted_key_path(&listing.key),
                "value": { "enabled": false },
                "mergeStrategy": "replace"
            }));
        }
    }
    rpc.request(
        "config/batchWrite",
        Some(json!({ "edits": edits, "reloadUserConfig": true })),
    )
    .await?;
    let verified = list_hooks(rpc, &hooks_list_cwd).await?;
    let verified = matching_listings(
        &verified,
        moves.iter().map(|entry| (&entry.new_key, &entry.command)),
    );
    for entry in &moves {
        let normalized = trust_key::normalize(&entry.new_key);
        let valid = verified.get(&normalized).is_some_and(|listing| {
            (listing.trust_status == "trusted") == entry.was_trusted
                && listing.enabled == entry.enabled
        });
        if !valid {
            return Err(GrantError::Message(format!(
                "post-rebase verify failed for moved user hook {}",
                entry.new_key
            )));
        }
    }
    Ok(json!({
        "outcome": "repaired",
        "repaired": moves.iter().filter(|entry| entry.was_trusted).count()
    }))
}

async fn list_hooks(
    rpc: &mut AppServerRpc,
    hooks_list_cwd: &str,
) -> Result<Vec<HookListing>, GrantError> {
    let result = rpc
        .request("hooks/list", Some(json!({ "cwds": [hooks_list_cwd] })))
        .await?;
    Ok(collect_hook_listings(&result))
}

fn collect_hook_listings(result: &Value) -> Vec<HookListing> {
    let mut listings = Vec::new();
    let mut seen = HashSet::new();
    let Some(data) = result.get("data").and_then(Value::as_array) else {
        return listings;
    };
    for entry in data {
        let Some(hooks) = entry.get("hooks").and_then(Value::as_array) else {
            continue;
        };
        for hook in hooks {
            let Some(key) = hook.get("key").and_then(Value::as_str) else {
                continue;
            };
            let Some(current_hash) = hook.get("currentHash").and_then(Value::as_str) else {
                continue;
            };
            let Some(trust_status) = hook.get("trustStatus").and_then(Value::as_str) else {
                continue;
            };
            if !seen.insert(key.to_owned()) {
                continue;
            }
            listings.push(HookListing {
                command: hook
                    .get("command")
                    .and_then(Value::as_str)
                    .map(str::to_owned),
                current_hash: current_hash.to_owned(),
                enabled: hook.get("enabled").and_then(Value::as_bool).unwrap_or(true),
                key: key.to_owned(),
                trust_status: trust_status.to_owned(),
            });
        }
    }
    listings
}

fn managed_listings(
    listings: &[HookListing],
    managed_command: &str,
    expected: &HashSet<String>,
) -> Vec<HookListing> {
    listings
        .iter()
        .filter(|listing| {
            listing.command.as_deref() == Some(managed_command)
                && expected.contains(&trust_key::normalize(&listing.key))
        })
        .cloned()
        .collect()
}

fn normalized_coverage(listings: &[HookListing]) -> HashSet<String> {
    listings
        .iter()
        .map(|listing| trust_key::normalize(&listing.key))
        .collect()
}

fn contains_every(values: &HashSet<String>, expected: &HashSet<String>) -> bool {
    expected.iter().all(|value| values.contains(value))
}

fn matching_listings<'a>(
    listings: &'a [HookListing],
    moves: impl Iterator<Item = (&'a String, &'a String)>,
) -> HashMap<String, &'a HookListing> {
    let expected = moves
        .map(|(key, command)| (trust_key::normalize(key), command.as_str()))
        .collect::<HashMap<_, _>>();
    listings
        .iter()
        .filter_map(|listing| {
            let key = trust_key::normalize(&listing.key);
            (listing.command.as_deref() == expected.get(&key).copied()).then_some((key, listing))
        })
        .collect()
}

fn quoted_key_path(key: &str) -> String {
    format!(
        "hooks.state.\"{}\"",
        key.replace('\\', "\\\\").replace('"', "\\\"")
    )
}
