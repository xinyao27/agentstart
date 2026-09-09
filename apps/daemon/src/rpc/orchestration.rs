mod protocol;

use std::collections::BTreeMap;

use serde_json::{Map, Value, json};
use sha2::{Digest, Sha256};
use yiru_protocol::protocol::v1::Status;

use crate::orchestration::{OrchestrationAuthority, OrchestrationError};

// Why: the protobuf handlers in `protocol/` construct a call with no CLI request id (mutation
// idempotency receipts are a CLI retry-after-crash concern the Chrome workbench's persistent
// socket does not share) but must still pass the current contract version, or `invoke` below
// would reject every mutation as `client_contract_missing`.
pub(super) const CONTRACT_VERSION: u32 = 1;

#[derive(Clone)]
pub(super) struct OrchestrationRpc {
    authority: OrchestrationAuthority,
}

pub(super) struct OrchestrationCall {
    pub(super) capability: Option<String>,
    pub(super) contract_version: Option<u32>,
    pub(super) principal_id: String,
    pub(super) request_id: Option<String>,
}

impl OrchestrationRpc {
    pub(super) fn new(authority: OrchestrationAuthority) -> Self {
        Self { authority }
    }

    async fn invoke(
        &self,
        method: &str,
        body: Option<Value>,
        call: &OrchestrationCall,
    ) -> Result<Value, OrchestrationError> {
        let body = body.unwrap_or_else(|| json!({}));
        let mutation = is_mutation(method, &body);
        if mutation {
            if matches!(method, "orchestration.run" | "orchestration.runStop") {
                return Err(migration_fence("command_retired"));
            }
            match call.contract_version {
                None => return Err(migration_fence("client_contract_missing")),
                Some(CONTRACT_VERSION) => {}
                Some(_) => return Err(migration_fence("client_contract_unsupported")),
            }
        }
        let caller_fingerprint = fingerprint(&call.principal_id);
        let Some(request_id) = call.request_id.as_ref().filter(|_| mutation) else {
            return self
                .authority
                .invoke(
                    method,
                    body,
                    call.capability.as_deref(),
                    Some(&caller_fingerprint),
                )
                .await;
        };
        let payload_hash = payload_hash(method, &body)?;
        let begun = self
            .authority
            .begin_mutation(
                caller_fingerprint.clone(),
                request_id.clone(),
                method.to_owned(),
                payload_hash.clone(),
            )
            .await?;
        match begun.get("disposition").and_then(Value::as_str) {
            Some("completed") => {
                let receipt = begun
                    .get("receipt")
                    .and_then(Value::as_str)
                    .ok_or_else(|| {
                        OrchestrationError::domain(
                            "operation_unknown",
                            format!("Mutation {request_id} completed without a readable receipt."),
                        )
                    })?;
                let result = serde_json::from_str(receipt).map_err(|_| {
                    OrchestrationError::domain(
                        "operation_unknown",
                        format!("Mutation {request_id} completed without a readable receipt."),
                    )
                })?;
                Ok(attach_mutation(result, request_id, true))
            }
            Some("pending") => Err(OrchestrationError::domain_with_data(
                "operation_unknown",
                format!(
                    "Mutation {request_id} may have been accepted before restart. Retry inspection or recovery with the same request ID."
                ),
                json!({ "requestId": request_id }),
            )),
            Some("started") => {
                let invocation = self
                    .authority
                    .invoke(
                        method,
                        body,
                        call.capability.as_deref(),
                        Some(&caller_fingerprint),
                    )
                    .await;
                match invocation {
                    Ok(result) => {
                        let result = attach_mutation(result, request_id, false);
                        self.authority
                            .complete_mutation(
                                caller_fingerprint,
                                request_id.clone(),
                                method.to_owned(),
                                payload_hash,
                                result.clone(),
                            )
                            .await?;
                        Ok(result)
                    }
                    Err(error) => {
                        if error.rpc_parts().map(|parts| parts.0) != Some("operation_unknown") {
                            self.authority
                                .discard_mutation(caller_fingerprint, request_id.clone())
                                .await;
                        }
                        Err(error)
                    }
                }
            }
            _ => Err(OrchestrationError::domain(
                "operation_unknown",
                format!("Mutation {request_id} has an invalid durable receipt state."),
            )),
        }
    }

    // Why: thin protobuf entry points, one per OrchestrationService rpc — mirrors
    // AgentSessionRpc::protocol_providers/protocol_list/... in agent_session.rs. Each just
    // forwards into `protocol::<fn>`, which decodes the request, builds the same JSON body the
    // deleted legacy method used, and calls `invoke` above so both the (now-removed) JSON surface
    // and the protobuf surface only ever shared this one OrchestrationRpc/OrchestrationAuthority
    // implementation. `protocol_call.rs` (owned elsewhere) calls these with
    // `context.access().principal_id()`.
    pub(super) async fn protocol_run_create(
        &self,
        payload: &[u8],
        principal_id: &str,
    ) -> Result<Vec<u8>, Status> {
        protocol::run_create(self, payload, principal_id).await
    }

    pub(super) async fn protocol_run_use(
        &self,
        payload: &[u8],
        principal_id: &str,
    ) -> Result<Vec<u8>, Status> {
        protocol::run_use(self, payload, principal_id).await
    }

    pub(super) async fn protocol_run_current(
        &self,
        payload: &[u8],
        principal_id: &str,
    ) -> Result<Vec<u8>, Status> {
        protocol::run_current(self, payload, principal_id).await
    }

    pub(super) async fn protocol_run_list(
        &self,
        payload: &[u8],
        principal_id: &str,
    ) -> Result<Vec<u8>, Status> {
        protocol::run_list(self, payload, principal_id).await
    }

    pub(super) async fn protocol_run_show(
        &self,
        payload: &[u8],
        principal_id: &str,
    ) -> Result<Vec<u8>, Status> {
        protocol::run_show(self, payload, principal_id).await
    }

    pub(super) async fn protocol_task_create(
        &self,
        payload: &[u8],
        principal_id: &str,
    ) -> Result<Vec<u8>, Status> {
        protocol::task_create(self, payload, principal_id).await
    }

    pub(super) async fn protocol_task_list(
        &self,
        payload: &[u8],
        principal_id: &str,
    ) -> Result<Vec<u8>, Status> {
        protocol::task_list(self, payload, principal_id).await
    }

    pub(super) async fn protocol_task_update(
        &self,
        payload: &[u8],
        principal_id: &str,
    ) -> Result<Vec<u8>, Status> {
        protocol::task_update(self, payload, principal_id).await
    }

    pub(super) async fn protocol_dispatch(
        &self,
        payload: &[u8],
        principal_id: &str,
    ) -> Result<Vec<u8>, Status> {
        protocol::dispatch(self, payload, principal_id).await
    }

    pub(super) async fn protocol_dispatch_show(
        &self,
        payload: &[u8],
        principal_id: &str,
    ) -> Result<Vec<u8>, Status> {
        protocol::dispatch_show(self, payload, principal_id).await
    }

    pub(super) async fn protocol_send(
        &self,
        payload: &[u8],
        principal_id: &str,
    ) -> Result<Vec<u8>, Status> {
        protocol::send(self, payload, principal_id).await
    }

    pub(super) async fn protocol_check(
        &self,
        payload: &[u8],
        principal_id: &str,
    ) -> Result<Vec<u8>, Status> {
        protocol::check(self, payload, principal_id).await
    }

    pub(super) async fn protocol_reply(
        &self,
        payload: &[u8],
        principal_id: &str,
    ) -> Result<Vec<u8>, Status> {
        protocol::reply(self, payload, principal_id).await
    }

    pub(super) async fn protocol_inbox(
        &self,
        payload: &[u8],
        principal_id: &str,
    ) -> Result<Vec<u8>, Status> {
        protocol::inbox(self, payload, principal_id).await
    }

    pub(super) async fn protocol_ask(
        &self,
        payload: &[u8],
        principal_id: &str,
    ) -> Result<Vec<u8>, Status> {
        protocol::ask(self, payload, principal_id).await
    }

    pub(super) async fn protocol_run(
        &self,
        payload: &[u8],
        principal_id: &str,
    ) -> Result<Vec<u8>, Status> {
        protocol::run(self, payload, principal_id).await
    }

    pub(super) async fn protocol_run_stop(
        &self,
        payload: &[u8],
        principal_id: &str,
    ) -> Result<Vec<u8>, Status> {
        protocol::run_stop(self, payload, principal_id).await
    }

    pub(super) async fn protocol_gate_create(
        &self,
        payload: &[u8],
        principal_id: &str,
    ) -> Result<Vec<u8>, Status> {
        protocol::gate_create(self, payload, principal_id).await
    }

    pub(super) async fn protocol_gate_resolve(
        &self,
        payload: &[u8],
        principal_id: &str,
    ) -> Result<Vec<u8>, Status> {
        protocol::gate_resolve(self, payload, principal_id).await
    }

    pub(super) async fn protocol_gate_list(
        &self,
        payload: &[u8],
        principal_id: &str,
    ) -> Result<Vec<u8>, Status> {
        protocol::gate_list(self, payload, principal_id).await
    }

    pub(super) async fn protocol_reset(
        &self,
        payload: &[u8],
        principal_id: &str,
    ) -> Result<Vec<u8>, Status> {
        protocol::reset(self, payload, principal_id).await
    }

    pub(super) async fn protocol_worker_start(
        &self,
        payload: &[u8],
        principal_id: &str,
    ) -> Result<Vec<u8>, Status> {
        protocol::worker_start(self, payload, principal_id).await
    }

    pub(super) async fn protocol_worker_show(
        &self,
        payload: &[u8],
        principal_id: &str,
    ) -> Result<Vec<u8>, Status> {
        protocol::worker_show(self, payload, principal_id).await
    }

    pub(super) async fn protocol_worker_read(
        &self,
        payload: &[u8],
        principal_id: &str,
    ) -> Result<Vec<u8>, Status> {
        protocol::worker_read(self, payload, principal_id).await
    }

    pub(super) async fn protocol_worker_stop(
        &self,
        payload: &[u8],
        principal_id: &str,
    ) -> Result<Vec<u8>, Status> {
        protocol::worker_stop(self, payload, principal_id).await
    }

    pub(super) async fn protocol_worker_abandon(
        &self,
        payload: &[u8],
        principal_id: &str,
    ) -> Result<Vec<u8>, Status> {
        protocol::worker_abandon(self, payload, principal_id).await
    }

    pub(super) async fn protocol_federation_attach_start(
        &self,
        payload: &[u8],
        principal_id: &str,
    ) -> Result<Vec<u8>, Status> {
        protocol::federation_attach_start(self, payload, principal_id).await
    }

    pub(super) async fn protocol_federation_pull(
        &self,
        payload: &[u8],
        principal_id: &str,
    ) -> Result<Vec<u8>, Status> {
        protocol::federation_pull(self, payload, principal_id).await
    }

    pub(super) async fn protocol_federation_ack(
        &self,
        payload: &[u8],
        principal_id: &str,
    ) -> Result<Vec<u8>, Status> {
        protocol::federation_ack(self, payload, principal_id).await
    }

    pub(super) async fn protocol_federation_import(
        &self,
        payload: &[u8],
        principal_id: &str,
    ) -> Result<Vec<u8>, Status> {
        protocol::federation_import(self, payload, principal_id).await
    }

    pub(super) async fn protocol_federation_show(
        &self,
        payload: &[u8],
        principal_id: &str,
    ) -> Result<Vec<u8>, Status> {
        protocol::federation_show(self, payload, principal_id).await
    }

    pub(super) async fn protocol_federation_read(
        &self,
        payload: &[u8],
        principal_id: &str,
    ) -> Result<Vec<u8>, Status> {
        protocol::federation_read(self, payload, principal_id).await
    }

    pub(super) async fn protocol_federation_read_output(
        &self,
        payload: &[u8],
        principal_id: &str,
    ) -> Result<Vec<u8>, Status> {
        protocol::federation_read_output(self, payload, principal_id).await
    }

    pub(super) async fn protocol_federation_stop(
        &self,
        payload: &[u8],
        principal_id: &str,
    ) -> Result<Vec<u8>, Status> {
        protocol::federation_stop(self, payload, principal_id).await
    }
}

fn is_mutation(method: &str, body: &Value) -> bool {
    if matches!(method, "orchestration.run" | "orchestration.runStop") {
        return true;
    }
    if method == "orchestration.check" {
        if body.get("ack").is_some_and(Value::is_string) {
            return true;
        }
        return !(body.get("peek").and_then(Value::as_bool) == Some(true)
            || body.get("all").and_then(Value::as_bool) == Some(true)
            || body.get("unread").and_then(Value::as_bool) == Some(false));
    }
    if method == "orchestration.dispatch" {
        return body.get("dryRun").and_then(Value::as_bool) != Some(true);
    }
    matches!(
        method,
        "orchestration.runCreate"
            | "orchestration.runUse"
            | "orchestration.send"
            | "orchestration.reply"
            | "orchestration.taskCreate"
            | "orchestration.taskUpdate"
            | "orchestration.workerStart"
            | "orchestration.workerStop"
            | "orchestration.workerAbandon"
            | "orchestration.ask"
            | "orchestration.gateCreate"
            | "orchestration.gateResolve"
            | "orchestration.reset"
            | "orchestration.federationAttachStart"
            | "orchestration.federationAck"
            | "orchestration.federationImport"
            | "orchestration.federationStop"
    )
}

fn migration_fence(reason: &'static str) -> OrchestrationError {
    OrchestrationError::domain_with_data(
        "orchestration_migration_required",
        "This orchestration mutation uses an obsolete contract. No effects were applied.",
        json!({
            "reason": reason,
            "requiredContractVersion": CONTRACT_VERSION,
            "effectsApplied": false,
            "guide": { "topic": "orchestration", "full": true },
            "nextCommandArgs": ["skills", "get", "orchestration", "--full"],
            "nextSteps": [
                "Using this same Yiru CLI executable, run: skills get orchestration --full",
                "Read the returned guide completely and do not retry the previous command unchanged."
            ],
        }),
    )
}

fn payload_hash(method: &str, body: &Value) -> Result<String, OrchestrationError> {
    let canonical = canonicalize(json!({ "method": method, "params": body }));
    let encoded = serde_json::to_vec(&canonical)
        .map_err(|error| OrchestrationError::domain("encoding_failed", error.to_string()))?;
    Ok(hex_digest(&encoded))
}

fn canonicalize(value: Value) -> Value {
    match value {
        Value::Array(values) => Value::Array(values.into_iter().map(canonicalize).collect()),
        Value::Object(values) => {
            let sorted = values
                .into_iter()
                .map(|(key, value)| (key, canonicalize(value)))
                .collect::<BTreeMap<_, _>>();
            Value::Object(Map::from_iter(sorted))
        }
        value => value,
    }
}

fn fingerprint(principal_id: &str) -> String {
    hex_digest(principal_id.as_bytes())
}

fn hex_digest(value: &[u8]) -> String {
    let digest = Sha256::digest(value);
    let mut encoded = String::with_capacity(digest.len() * 2);
    for byte in digest {
        use std::fmt::Write;
        let _ = write!(&mut encoded, "{byte:02x}");
    }
    encoded
}

fn attach_mutation(mut result: Value, request_id: &str, replayed: bool) -> Value {
    let mutation = json!({ "requestId": request_id, "replayed": replayed });
    match result.as_object_mut() {
        Some(object) => {
            object.insert("mutation".to_owned(), mutation);
            result
        }
        None => json!({ "result": result, "mutation": mutation }),
    }
}

// Why: retargets the legacy JSON dispatch()'s HTTP-shaped error_status table (401/404/409/501/400)
// onto the protobuf Status codes protocol/*.rs handlers return, so an OrchestrationError domain
// code keeps mapping to the same class of failure across both transports.
pub(super) fn protocol_status_code(code: &str) -> yiru_protocol::protocol::v1::StatusCode {
    use yiru_protocol::protocol::v1::StatusCode;
    match code {
        "authentication_required" => StatusCode::Unauthenticated,
        "method_not_found"
        | "run_not_found"
        | "task_not_found"
        | "dispatch_not_found"
        | "message_not_found"
        | "gate_not_found"
        | "terminal_not_found"
        | "worktree_not_found"
        | "worktree_not_found_on_server" => StatusCode::NotFound,
        "consumer_fenced"
        | "request_mismatch"
        | "operation_unknown"
        | "answer_conflict"
        | "worker_identity_changed"
        | "source_changed"
        | "stale_delivery"
        | "dispatch_inactive"
        | "task_not_startable"
        | "circuit_broken"
        | "orchestration_migration_required" => StatusCode::FailedPrecondition,
        "capability_unsupported" => StatusCode::Unimplemented,
        "invalid_argument" | "encoding_failed" => StatusCode::InvalidArgument,
        _ => StatusCode::Internal,
    }
}
