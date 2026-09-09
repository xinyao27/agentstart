mod checks;

use serde_json::{Map, Value, json};

use super::GitHubRepository;

pub(super) fn work_item(raw: &Value, repository: Option<&GitHubRepository>) -> Value {
    let number = number(raw, &["number"]);
    let mut item = Map::from_iter([
        ("id".to_owned(), json!(format!("pr:{number}"))),
        ("type".to_owned(), json!("pr")),
        ("number".to_owned(), json!(number)),
        ("title".to_owned(), text(raw, &["title"])),
        ("state".to_owned(), json!(state(raw))),
        ("url".to_owned(), text_first(raw, &["url", "html_url"])),
        ("labels".to_owned(), labels(raw)),
        (
            "updatedAt".to_owned(),
            text_first(raw, &["updatedAt", "updated_at"]),
        ),
        ("author".to_owned(), author(raw)),
        (
            "branchName".to_owned(),
            nested_text_first(raw, &[&["headRefName"], &["head", "ref"]]),
        ),
        (
            "baseRefName".to_owned(),
            nested_text_first(raw, &[&["baseRefName"], &["base", "ref"]]),
        ),
    ]);
    if let Some(avatar) = nested_string_first(
        raw,
        &[
            &["author", "avatarUrl"],
            &["user", "avatar_url"],
            &["author", "avatar_url"],
        ],
    ) {
        item.insert("authorAvatarUrl".to_owned(), json!(avatar));
    }
    for (output, alternatives) in [
        ("headSha", &[&["headRefOid"][..], &["head", "sha"]][..]),
        ("mergeStateStatus", &[&["mergeStateStatus"][..]][..]),
    ] {
        if let Some(value) = nested_string_first(raw, alternatives) {
            item.insert(output.to_owned(), json!(value));
        }
    }
    for (output, keys) in [
        ("additions", &["additions"][..]),
        ("deletions", &["deletions"][..]),
        ("changedFiles", &["changedFiles", "changed_files"][..]),
    ] {
        if let Some(value) = optional_number(raw, keys) {
            item.insert(output.to_owned(), json!(value));
        }
    }
    if let Some(value) = review_decision(raw.get("reviewDecision")) {
        item.insert("reviewDecision".to_owned(), value);
    }
    for (output, key) in [
        ("reviewRequests", "reviewRequests"),
        ("latestReviews", "latestReviews"),
        ("assignees", "assignees"),
    ] {
        if let Some(value) = raw.get(key) {
            item.insert(output.to_owned(), users(value, output == "latestReviews"));
        }
    }
    if let Some(value) = raw.get("statusCheckRollup") {
        item.insert("checksSummary".to_owned(), checks::summary(value));
    }
    if let Some(mergeable) = normalize_mergeable(raw.get("mergeable")).or_else(|| {
        (raw.get("mergeStateStatus").and_then(Value::as_str) == Some("DIRTY"))
            .then_some("CONFLICTING")
    }) {
        item.insert("mergeable".to_owned(), json!(mergeable));
    }
    if raw.get("autoMergeRequest").is_some() {
        item.insert(
            "autoMergeEnabled".to_owned(),
            json!(raw.get("autoMergeRequest").is_some_and(Value::is_object)),
        );
    }
    for key in [
        "autoMergeAllowed",
        "mergeQueueRequired",
        "mergeMethodSettings",
    ] {
        if let Some(value) = raw.get(key) {
            item.insert(key.to_owned(), value.clone());
        }
    }
    if let Some(value) = raw.get("maintainerCanModify").and_then(Value::as_bool) {
        item.insert("maintainerCanModify".to_owned(), json!(value));
    }
    if let Some(repository) = repository {
        item.insert(
            "prRepo".to_owned(),
            json!({ "owner": repository.owner, "repo": repository.repo }),
        );
        if let Some(head_owner) = head_owner(raw) {
            item.insert(
                "isCrossRepository".to_owned(),
                json!(head_owner != repository.owner),
            );
        }
    }
    Value::Object(item)
}

pub(super) fn pr_info(item: &Value) -> Value {
    let mut output = Map::from_iter([
        ("number".to_owned(), item["number"].clone()),
        ("title".to_owned(), item["title"].clone()),
        ("state".to_owned(), item["state"].clone()),
        ("url".to_owned(), item["url"].clone()),
        ("updatedAt".to_owned(), item["updatedAt"].clone()),
        (
            "checksStatus".to_owned(),
            item.pointer("/checksSummary/state")
                .cloned()
                .unwrap_or_else(|| json!("pending")),
        ),
        (
            "mergeable".to_owned(),
            item.get("mergeable")
                .cloned()
                .unwrap_or_else(|| json!("UNKNOWN")),
        ),
    ]);
    if let Some(value) = item.get("branchName") {
        output.insert("headRefName".to_owned(), value.clone());
    }
    for key in [
        "reviewDecision",
        "autoMergeEnabled",
        "autoMergeAllowed",
        "mergeQueueRequired",
        "mergeMethodSettings",
        "mergeStateStatus",
        "headSha",
        "baseRefName",
        "headRefName",
        "prRepo",
        "headRepo",
        "confirmedContainedHeadOid",
        "headDivergedFromMergedPRAtOid",
        "conflictSummary",
    ] {
        if let Some(value) = item.get(key) {
            output.insert(key.to_owned(), value.clone());
        }
    }
    Value::Object(output)
}

pub(super) fn user(raw: &Value) -> Option<Value> {
    let login = raw
        .get("login")
        .and_then(Value::as_str)
        .or_else(|| raw.as_str())?
        .trim();
    (!login.is_empty()).then(|| {
        json!({
            "login": login,
            "name": raw.get("name").and_then(Value::as_str),
            "avatarUrl": raw.get("avatarUrl").or_else(|| raw.get("avatar_url"))
                .and_then(Value::as_str).unwrap_or("")
        })
    })
}

pub(super) fn normalize_mergeable(value: Option<&Value>) -> Option<&'static str> {
    match value
        .and_then(Value::as_str)
        .map(str::to_ascii_uppercase)
        .as_deref()
    {
        Some("MERGEABLE") => Some("MERGEABLE"),
        Some("CONFLICTING") => Some("CONFLICTING"),
        Some("UNKNOWN") => Some("UNKNOWN"),
        _ => None,
    }
}

fn state(raw: &Value) -> &'static str {
    if raw.get("mergedAt").is_some_and(|value| !value.is_null())
        || raw.get("merged_at").is_some_and(|value| !value.is_null())
        || raw.get("state").and_then(Value::as_str) == Some("MERGED")
    {
        "merged"
    } else if raw.get("state").and_then(Value::as_str) == Some("CLOSED")
        || raw.get("state").and_then(Value::as_str) == Some("closed")
    {
        "closed"
    } else if raw.get("isDraft").and_then(Value::as_bool) == Some(true)
        || raw.get("draft").and_then(Value::as_bool) == Some(true)
    {
        "draft"
    } else {
        "open"
    }
}

fn author(raw: &Value) -> Value {
    nested_string_first(raw, &[&["author", "login"], &["user", "login"]])
        .map_or(Value::Null, |value| json!(value))
}

fn labels(raw: &Value) -> Value {
    Value::Array(
        raw.get("labels")
            .and_then(Value::as_array)
            .into_iter()
            .flatten()
            .filter_map(|value| value.get("name").and_then(Value::as_str))
            .map(|value| json!(value))
            .collect(),
    )
}

fn users(raw: &Value, review: bool) -> Value {
    Value::Array(
        raw.as_array()
            .into_iter()
            .flatten()
            .filter_map(|value| {
                let source = if review {
                    value.get("author").unwrap_or(value)
                } else {
                    value
                };
                let mut mapped = user(source)?;
                if review && let Some(state) = value.get("state") {
                    mapped["state"] = state.clone();
                }
                Some(mapped)
            })
            .collect(),
    )
}

fn review_decision(value: Option<&Value>) -> Option<Value> {
    match value.and_then(Value::as_str) {
        Some("APPROVED" | "CHANGES_REQUESTED" | "REVIEW_REQUIRED") => value.cloned(),
        Some(_) => Some(Value::Null),
        None => None,
    }
}

fn head_owner(raw: &Value) -> Option<&str> {
    nested_string_first(
        raw,
        &[
            &["headRepositoryOwner", "login"],
            &["head", "repo", "owner", "login"],
            &["head", "user", "login"],
        ],
    )
}

fn number(raw: &Value, keys: &[&str]) -> u64 {
    optional_number(raw, keys).unwrap_or(0)
}

fn optional_number(raw: &Value, keys: &[&str]) -> Option<u64> {
    keys.iter().find_map(|key| raw.get(key)?.as_u64())
}

fn text(raw: &Value, keys: &[&str]) -> Value {
    text_first(raw, keys)
}

fn text_first(raw: &Value, keys: &[&str]) -> Value {
    keys.iter()
        .find_map(|key| raw.get(key)?.as_str())
        .map_or_else(|| json!(""), |value| json!(value))
}

fn nested_text_first(raw: &Value, alternatives: &[&[&str]]) -> Value {
    nested_string_first(raw, alternatives).map_or_else(|| json!(""), |value| json!(value))
}

fn nested_string_first<'a>(raw: &'a Value, alternatives: &[&[&str]]) -> Option<&'a str> {
    alternatives.iter().find_map(|path| {
        path.iter()
            .try_fold(raw, |value, key| value.get(*key))?
            .as_str()
    })
}
