use super::super::{pricing_catalog::Catalog, worktrees::Location};
use super::{parser::Event, pricing, priority::Snapshot};
use serde_json::{Value, json};
use std::collections::BTreeMap;

const USAGE_KEYS: [&str; 6] = [
    "eventCount",
    "inputTokens",
    "cachedInputTokens",
    "outputTokens",
    "reasoningOutputTokens",
    "totalTokens",
];
const SESSION_KEYS: [&str; 6] = [
    "eventCount",
    "totalInputTokens",
    "totalCachedInputTokens",
    "totalOutputTokens",
    "totalReasoningOutputTokens",
    "totalTokens",
];
#[derive(Default)]
pub(super) struct Aggregation {
    sessions: BTreeMap<String, Value>,
    daily: BTreeMap<String, Value>,
}
impl Aggregation {
    pub fn add(
        &mut self,
        event: Event,
        day: String,
        location: Location,
        priority: &Snapshot,
        catalog: &Catalog,
    ) {
        let inferred = event.model.is_none();
        let model_key = event.model.as_deref().unwrap_or("unknown");
        let model_label = event.model.as_deref().unwrap_or("Unknown model");
        let t = event.tokens;
        let usage = json!({"eventCount":1,"inputTokens":t.input_tokens,"cachedInputTokens":t.cached_input_tokens,
            "outputTokens":t.output_tokens,"reasoningOutputTokens":t.reasoning_output_tokens,
            "totalTokens":t.total_tokens,"hasInferredPricing":inferred});
        let mut location_row = usage.clone();
        patch(
            &mut location_row,
            json!({"locationKey":location.project_key,"projectLabel":location.project_label,
            "repoId":location.repo_id,"worktreeId":location.worktree_id}),
        );
        let mut model_row = usage.clone();
        patch(
            &mut model_row,
            json!({"modelKey":model_key,"modelLabel":model_label}),
        );
        let mut location_model_row = usage.clone();
        patch(
            &mut location_model_row,
            json!({"locationKey":location.project_key,"modelKey":model_key,"modelLabel":model_label,
            "repoId":location.repo_id,"worktreeId":location.worktree_id}),
        );
        let session = json!({"sessionId":event.session_id,"firstTimestamp":event.timestamp,"lastTimestamp":event.timestamp,
            "primaryModel":event.model,"hasMixedModels":false,"primaryProjectLabel":location.project_label,
            "hasMixedLocations":false,"primaryWorktreeId":location.worktree_id,"primaryRepoId":location.repo_id,
            "eventCount":1,"totalInputTokens":t.input_tokens,"totalCachedInputTokens":t.cached_input_tokens,
            "totalOutputTokens":t.output_tokens,"totalReasoningOutputTokens":t.reasoning_output_tokens,
            "totalTokens":t.total_tokens,"hasInferredPricing":inferred,
            "locationBreakdown":[location_row],"modelBreakdown":[model_row],"locationModelBreakdown":[location_model_row]});
        self.merge_session(session);
        let priority_model = event
            .turn_id
            .as_ref()
            .and_then(|id| priority.models.get(id));
        let model = priority_model
            .and_then(|m| m.as_deref())
            .or(event.model.as_deref());
        let cost = pricing::price(
            model,
            t,
            priority_model.is_some(),
            priority_model.and_then(|m| m.as_deref()),
            catalog,
        );
        let mut daily = usage;
        patch(
            &mut daily,
            json!({"day":day,"model":event.model,"projectKey":location.project_key,
            "projectLabel":location.project_label,"repoId":location.repo_id,"worktreeId":location.worktree_id,
            "estimatedCostUsd":cost,"unpricedTokens":if cost.is_none(){t.total_tokens}else{0}}),
        );
        self.merge_daily(daily);
    }
    pub fn merge_file(&mut self, file: &Value) {
        if let Some(rows) = file.get("sessions").and_then(Value::as_array) {
            for row in rows {
                self.merge_session(row.clone());
            }
        }
        if let Some(rows) = file.get("dailyAggregates").and_then(Value::as_array) {
            for row in rows {
                self.merge_daily(row.clone());
            }
        }
    }
    fn merge_session(&mut self, row: Value) {
        let key = string(&row, "sessionId").to_owned();
        let Some(existing) = self.sessions.get_mut(&key) else {
            self.sessions.insert(key, row);
            return;
        };
        if string(&row, "firstTimestamp") < string(existing, "firstTimestamp") {
            existing["firstTimestamp"] = row["firstTimestamp"].clone();
        }
        if string(&row, "lastTimestamp") > string(existing, "lastTimestamp") {
            existing["lastTimestamp"] = row["lastTimestamp"].clone();
        }
        add_usage(existing, &row, &SESSION_KEYS);
        for (field, keys) in [
            ("locationBreakdown", &["locationKey"][..]),
            ("modelBreakdown", &["modelKey"][..]),
            ("locationModelBreakdown", &["locationKey", "modelKey"][..]),
        ] {
            let Some(incoming) = row.get(field).and_then(Value::as_array) else {
                continue;
            };
            if !existing[field].is_array() {
                existing[field] = json!([]);
            }
            if let Some(target) = existing[field].as_array_mut() {
                for source in incoming {
                    if let Some(found) = target
                        .iter_mut()
                        .find(|candidate| keys.iter().all(|key| candidate[*key] == source[*key]))
                    {
                        add_usage(found, source, &USAGE_KEYS);
                    } else {
                        target.push(source.clone());
                    }
                }
            }
        }
    }
    fn merge_daily(&mut self, row: Value) {
        let key = serde_json::to_string(&[&row["day"], &row["model"], &row["projectKey"]])
            .unwrap_or_default();
        let Some(existing) = self.daily.get_mut(&key) else {
            self.daily.insert(key, row);
            return;
        };
        add_usage(existing, &row, &USAGE_KEYS);
        existing["unpricedTokens"] = json!(
            number(existing, "unpricedTokens").saturating_add(number(&row, "unpricedTokens"))
        );
        let left = existing["estimatedCostUsd"].as_f64();
        let right = row["estimatedCostUsd"].as_f64();
        existing["estimatedCostUsd"] = json!(if left.is_none() && right.is_none() {
            None
        } else {
            Some(left.unwrap_or(0.0) + right.unwrap_or(0.0))
        });
    }
    pub fn finish(self) -> (Vec<Value>, Vec<Value>) {
        let mut sessions = self.sessions.into_values().collect::<Vec<_>>();
        for session in &mut sessions {
            for field in ["locationBreakdown", "modelBreakdown"] {
                if let Some(rows) = session[field].as_array_mut() {
                    rows.sort_by_key(|row| std::cmp::Reverse(number(row, "totalTokens")));
                }
            }
            let locations = session["locationBreakdown"]
                .as_array()
                .cloned()
                .unwrap_or_default();
            let models = session["modelBreakdown"]
                .as_array()
                .cloned()
                .unwrap_or_default();
            let primary_location = locations.first();
            let primary_model = models.first();
            session["primaryProjectLabel"] = if locations.len() > 1 {
                json!("Multiple locations")
            } else {
                primary_location
                    .map(|v| v["projectLabel"].clone())
                    .unwrap_or(json!("Unknown location"))
            };
            session["hasMixedLocations"] = json!(locations.len() > 1);
            session["primaryWorktreeId"] = primary_location
                .map(|v| v["worktreeId"].clone())
                .unwrap_or(Value::Null);
            session["primaryRepoId"] = primary_location
                .map(|v| v["repoId"].clone())
                .unwrap_or(Value::Null);
            session["primaryModel"] = if models.len() > 1 {
                json!("Mixed models")
            } else {
                primary_model
                    .map(|v| v["modelLabel"].clone())
                    .unwrap_or(Value::Null)
            };
            session["hasMixedModels"] = json!(models.len() > 1);
        }
        sessions.sort_by(|a, b| string(b, "lastTimestamp").cmp(string(a, "lastTimestamp")));
        let mut daily = self.daily.into_values().collect::<Vec<_>>();
        daily.sort_by(|a, b| {
            (string(a, "day"), string(a, "projectLabel"))
                .cmp(&(string(b, "day"), string(b, "projectLabel")))
        });
        (sessions, daily)
    }
}
fn add_usage(target: &mut Value, source: &Value, keys: &[&str]) {
    for key in keys {
        target[*key] = json!(number(target, key).saturating_add(number(source, key)));
    }
    target["hasInferredPricing"] = json!(
        target["hasInferredPricing"].as_bool().unwrap_or(false)
            || source["hasInferredPricing"].as_bool().unwrap_or(false)
    );
}
fn patch(target: &mut Value, source: Value) {
    if let (Some(target), Value::Object(source)) = (target.as_object_mut(), source) {
        target.extend(source);
    }
}
fn number(value: &Value, key: &str) -> u64 {
    value.get(key).and_then(Value::as_u64).unwrap_or(0)
}
fn string<'a>(value: &'a Value, key: &str) -> &'a str {
    value.get(key).and_then(Value::as_str).unwrap_or("")
}
