// Why: the client-events authority emits typed subscription events shared
// with the legacy JSON stream; this is the single place that renders those
// events into the typed protobuf wire messages.
use agentstart_protocol::runtime::v1::client_events_json_value::Kind as JsonKind;
use agentstart_protocol::runtime::v1::client_events_service_event::Event;
use agentstart_protocol::runtime::v1::{
    ClientEventsActivateWorktree, ClientEventsJsonNull, ClientEventsJsonValue,
    ClientEventsJsonValueEntry, ClientEventsJsonValueList, ClientEventsJsonValueObject,
    ClientEventsServiceEvent, ClientEventsSubscribeReady,
    ClientEventsWorktreeHeadIdentitiesChanged, ClientEventsWorktreeHeadIdentity,
    ClientEventsWorktreeRename, ClientEventsWorktreesChanged,
};
use serde_json::Value;

use crate::client_events::ClientSubscriptionEvent;

pub(super) fn event(event: ClientSubscriptionEvent) -> ClientEventsServiceEvent {
    let event = match event {
        ClientSubscriptionEvent::Ready { subscription_id } => {
            Event::Ready(ClientEventsSubscribeReady { subscription_id })
        }
        ClientSubscriptionEvent::ReposChanged => Event::ReposChanged(true),
        ClientSubscriptionEvent::WorktreesChanged { repo_id, renamed } => {
            Event::WorktreesChanged(ClientEventsWorktreesChanged {
                repo_id,
                renamed: renamed.map(|renamed| ClientEventsWorktreeRename {
                    old_worktree_id: renamed.old_worktree_id,
                    new_worktree_id: renamed.new_worktree_id,
                }),
            })
        }
        ClientSubscriptionEvent::ActivateWorktree {
            repo_id,
            worktree_id,
            setup,
            startup,
            default_tabs,
        } => Event::ActivateWorktree(ClientEventsActivateWorktree {
            repo_id,
            worktree_id,
            setup: setup.as_ref().map(json_value),
            startup: startup.as_ref().map(json_value),
            default_tabs: default_tabs.as_ref().map(json_value),
        }),
        ClientSubscriptionEvent::WorktreeHeadIdentitiesChanged {
            repo_id,
            identities,
        } => Event::WorktreeHeadIdentitiesChanged(ClientEventsWorktreeHeadIdentitiesChanged {
            repo_id,
            identities: identities
                .iter()
                .map(|identity| ClientEventsWorktreeHeadIdentity {
                    worktree_path: identity.worktree_path.clone(),
                    head: identity.head.clone(),
                    branch: identity.branch.clone(),
                })
                .collect(),
        }),
        ClientSubscriptionEvent::End => Event::End(true),
    };
    ClientEventsServiceEvent { event: Some(event) }
}

fn json_value(value: &Value) -> ClientEventsJsonValue {
    let kind = match value {
        Value::Null => JsonKind::NullValue(ClientEventsJsonNull::Value as i32),
        Value::Bool(value) => JsonKind::BoolValue(*value),
        Value::Number(value) => JsonKind::NumberValue(value.as_f64().unwrap_or_default()),
        Value::String(value) => JsonKind::StringValue(value.clone()),
        Value::Array(values) => JsonKind::ListValue(ClientEventsJsonValueList {
            values: values.iter().map(json_value).collect(),
        }),
        Value::Object(object) => JsonKind::ObjectValue(ClientEventsJsonValueObject {
            entries: object
                .iter()
                .map(|(key, value)| ClientEventsJsonValueEntry {
                    key: key.clone(),
                    value: Some(json_value(value)),
                })
                .collect(),
        }),
    };
    ClientEventsJsonValue { kind: Some(kind) }
}
