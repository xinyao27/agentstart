mod agent_phase;
mod apns;
mod apns_queue;
mod cooldown;
mod native;
mod persistence;
mod sound;
mod subscription;

use std::collections::HashMap;
use std::error::Error;
use std::sync::{Arc, Mutex, MutexGuard, OnceLock};

use serde::{Deserialize, Serialize};
use thiserror::Error;
use tokio::sync::watch;

use crate::mobile::{MobileDeviceStore, MobilePresence};
use crate::persistence::WorkspaceJournal;
use cooldown::NotificationDeliveryPolicy;

pub(crate) use agent_phase::{
    AgentPhasePublisher, AgentPhaseWorker, agent_phase_channel, start_agent_phase_worker,
    transition_from_status,
};
pub(crate) use apns::{ApnsNotification, ApnsNotificationPhase};
use apns_queue::{ApnsDelivery, ApnsDeliveryStartError};
pub(crate) use persistence::{
    NotificationMailbox, NotificationMailboxClosed, NotificationRequest, NotificationWorker,
};
pub(crate) use sound::{
    NotificationSoundAuthority, NotificationSoundLoad, NotificationSoundUnavailable,
};
pub(crate) use subscription::NotificationSubscription;

pub(crate) const REPLAY_CAPACITY: usize = 256;

#[derive(Clone, Debug, Deserialize, Serialize)]
#[serde(tag = "type")]
pub(crate) enum MobileNotificationEvent {
    #[serde(rename = "notification", rename_all = "camelCase")]
    Notification {
        body: String,
        #[serde(skip_serializing_if = "Option::is_none")]
        notification_id: Option<String>,
        source: NotificationSource,
        title: String,
        #[serde(skip_serializing_if = "Option::is_none")]
        worktree_id: Option<String>,
    },
    #[serde(rename = "dismiss", rename_all = "camelCase")]
    Dismiss { notification_id: String },
}

#[derive(Clone, Copy, Debug, Deserialize, Serialize)]
#[serde(rename_all = "kebab-case")]
pub(crate) enum NotificationSource {
    AgentTaskComplete,
    TerminalBell,
    Test,
}

impl NotificationSource {
    pub(crate) const fn as_wire(self) -> &'static str {
        match self {
            Self::AgentTaskComplete => "agent-task-complete",
            Self::TerminalBell => "terminal-bell",
            Self::Test => "test",
        }
    }

    fn from_wire(value: &str) -> Option<Self> {
        match value {
            "agent-task-complete" => Some(Self::AgentTaskComplete),
            "terminal-bell" => Some(Self::TerminalBell),
            "test" => Some(Self::Test),
            _ => None,
        }
    }
}

#[derive(Clone, Debug, Serialize)]
#[serde(rename_all = "camelCase")]
pub(crate) struct ReplayableNotification {
    #[serde(flatten)]
    pub(crate) event: MobileNotificationEvent,
    pub(crate) notification_seq: i64,
}

#[derive(Clone)]
pub(crate) struct NotificationAuthority {
    apns: Arc<OnceLock<ApnsDelivery>>,
    delivery_policy: Arc<NotificationDeliveryPolicy>,
    registry: Arc<SubscriptionRegistry>,
    store: NotificationStore,
}

#[derive(Clone)]
pub(crate) struct NotificationStore {
    mailbox: Arc<dyn NotificationMailbox>,
}

struct SubscriptionRegistry {
    subscriptions: Mutex<HashMap<String, watch::Sender<bool>>>,
}

#[derive(Debug, Error)]
pub(crate) enum NotificationError {
    #[error("notification clock failed: {0}")]
    Clock(#[from] std::time::SystemTimeError),
    #[error("notification identifier generation failed: {0}")]
    Random(#[from] getrandom::Error),
    #[error("mobile_notification_insert_failed")]
    InsertFailed,
    #[error("notification storage failed")]
    Storage(#[source] Box<dyn Error + Send + Sync>),
    #[error("notification database worker is unavailable")]
    WorkerUnavailable,
}

impl NotificationAuthority {
    pub(crate) fn new(mailbox: Arc<dyn NotificationMailbox>) -> Self {
        Self {
            apns: Arc::new(OnceLock::new()),
            delivery_policy: Arc::new(NotificationDeliveryPolicy::default()),
            registry: Arc::new(SubscriptionRegistry {
                subscriptions: Mutex::new(HashMap::new()),
            }),
            store: NotificationStore { mailbox },
        }
    }

    pub(crate) fn configure_apns(
        &self,
        devices: MobileDeviceStore,
        presence: MobilePresence,
        journal: WorkspaceJournal,
        endpoint: Option<String>,
        token: Option<String>,
    ) -> Result<bool, ApnsDeliveryStartError> {
        if self.apns.get().is_some() {
            return Ok(false);
        }
        let delivery = ApnsDelivery::start(devices, presence, journal, endpoint, token)?;
        Ok(self.apns.set(delivery).is_ok())
    }

    pub(crate) fn enqueue_apns(&self, notification: ApnsNotification) -> bool {
        self.apns
            .get()
            .is_some_and(|delivery| delivery.enqueue(notification))
    }

    pub(crate) async fn shutdown_apns(&self) {
        if let Some(delivery) = self.apns.get() {
            delivery.shutdown().await;
        }
    }

    pub(crate) async fn dispatch(
        &self,
        event: MobileNotificationEvent,
    ) -> Result<ReplayableNotification, NotificationError> {
        self.store.dispatch(event).await
    }

    pub(crate) fn reserve_local_delivery(&self, key: &str) -> bool {
        self.delivery_policy.reserve_local(key)
    }

    pub(crate) fn reserve_mobile_delivery(&self, key: &str) -> bool {
        self.delivery_policy.reserve_mobile(key)
    }

    pub(crate) fn rollback_local_delivery(&self, key: &str) {
        self.delivery_policy.rollback_local(key);
    }

    pub(crate) fn rollback_mobile_delivery(&self, key: &str) {
        self.delivery_policy.rollback_mobile(key);
    }

    pub(crate) async fn dismiss(
        &self,
        notification_id: String,
    ) -> Result<ReplayableNotification, NotificationError> {
        self.dispatch(MobileNotificationEvent::Dismiss { notification_id })
            .await
    }

    pub(crate) async fn missed_since(
        &self,
        last_seen_seq: i64,
    ) -> Result<Vec<ReplayableNotification>, NotificationError> {
        self.store.missed_since(last_seen_seq).await
    }

    pub(crate) async fn latest_sequence(&self) -> Result<i64, NotificationError> {
        self.store.latest_sequence().await
    }

    pub(crate) async fn open_subscription(
        &self,
        after_sequence: i64,
    ) -> Result<NotificationSubscription, NotificationError> {
        let committed = self.store.subscribe_commits().await?;
        let id = format!("notifications-{}", random_uuid()?);
        let (cancel, cancelled) = watch::channel(false);
        lock_subscriptions(&self.registry.subscriptions).insert(id.clone(), cancel);
        Ok(NotificationSubscription::new(
            id,
            after_sequence,
            self.store.clone(),
            committed,
            cancelled,
            self.registry.clone(),
        ))
    }
}

impl SubscriptionRegistry {
    fn close(&self, id: &str) {
        let Some(cancel) = lock_subscriptions(&self.subscriptions).remove(id) else {
            return;
        };
        let _ = cancel.send(true);
    }
}

impl NotificationError {
    pub(super) fn storage(source: impl Error + Send + Sync + 'static) -> Self {
        Self::Storage(Box::new(source))
    }
}

fn lock_subscriptions(
    subscriptions: &Mutex<HashMap<String, watch::Sender<bool>>>,
) -> MutexGuard<'_, HashMap<String, watch::Sender<bool>>> {
    subscriptions
        .lock()
        .unwrap_or_else(std::sync::PoisonError::into_inner)
}

fn random_uuid() -> Result<String, getrandom::Error> {
    let mut bytes = [0_u8; 16];
    getrandom::fill(&mut bytes)?;
    bytes[6] = (bytes[6] & 0x0f) | 0x40;
    bytes[8] = (bytes[8] & 0x3f) | 0x80;
    Ok(format!(
        "{:02x}{:02x}{:02x}{:02x}-{:02x}{:02x}-{:02x}{:02x}-{:02x}{:02x}-{:02x}{:02x}{:02x}{:02x}{:02x}{:02x}",
        bytes[0],
        bytes[1],
        bytes[2],
        bytes[3],
        bytes[4],
        bytes[5],
        bytes[6],
        bytes[7],
        bytes[8],
        bytes[9],
        bytes[10],
        bytes[11],
        bytes[12],
        bytes[13],
        bytes[14],
        bytes[15]
    ))
}
