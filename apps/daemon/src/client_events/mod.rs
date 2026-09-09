use std::collections::HashMap;
use std::sync::atomic::{AtomicU64, Ordering};
use std::sync::{Arc, Mutex, MutexGuard};

use serde::Serialize;
use serde_json::Value;
use tokio::sync::mpsc;

const SUBSCRIPTION_CAPACITY: usize = 64;

#[derive(Clone)]
pub(crate) struct ClientEventsAuthority {
    inner: Arc<Inner>,
}

struct Inner {
    next_id: AtomicU64,
    subscribers: Mutex<HashMap<String, mpsc::Sender<ClientEvent>>>,
}

#[derive(Clone, Debug)]
enum ClientEvent {
    ReposChanged,
    WorktreesChanged {
        repo_id: String,
        renamed: Option<WorktreeRename>,
    },
    ActivateWorktree {
        repo_id: String,
        worktree_id: String,
        setup: Option<Value>,
        startup: Option<Value>,
        default_tabs: Option<Value>,
    },
    WorktreeHeadIdentitiesChanged {
        repo_id: String,
        identities: Vec<WorktreeHeadIdentity>,
    },
}

#[derive(Clone, Debug, PartialEq, Eq, Serialize)]
#[serde(rename_all = "camelCase")]
pub(crate) struct WorktreeHeadIdentity {
    pub(crate) worktree_path: String,
    pub(crate) head: String,
    pub(crate) branch: Option<String>,
}

#[derive(Clone, Debug, Serialize)]
#[serde(rename_all = "camelCase")]
pub(crate) struct WorktreeRename {
    pub(crate) old_worktree_id: String,
    pub(crate) new_worktree_id: String,
}

#[derive(Debug, Serialize)]
#[serde(tag = "type", rename_all = "camelCase")]
pub(crate) enum ClientSubscriptionEvent {
    Ready {
        subscription_id: String,
    },
    ReposChanged,
    WorktreesChanged {
        repo_id: String,
        #[serde(skip_serializing_if = "Option::is_none")]
        renamed: Option<WorktreeRename>,
    },
    ActivateWorktree {
        repo_id: String,
        worktree_id: String,
        #[serde(skip_serializing_if = "Option::is_none")]
        setup: Option<Value>,
        #[serde(skip_serializing_if = "Option::is_none")]
        startup: Option<Value>,
        #[serde(skip_serializing_if = "Option::is_none")]
        default_tabs: Option<Value>,
    },
    WorktreeHeadIdentitiesChanged {
        repo_id: String,
        identities: Vec<WorktreeHeadIdentity>,
    },
    End,
}

pub(crate) struct ClientEventSubscription {
    authority: ClientEventsAuthority,
    ended: bool,
    id: String,
    receiver: mpsc::Receiver<ClientEvent>,
    ready: bool,
}

impl ClientEventsAuthority {
    pub(crate) fn new() -> Self {
        Self {
            inner: Arc::new(Inner {
                next_id: AtomicU64::new(1),
                subscribers: Mutex::new(HashMap::new()),
            }),
        }
    }

    pub(crate) fn publish_repos_changed(&self) {
        self.publish(ClientEvent::ReposChanged);
    }

    pub(crate) fn publish_worktrees_changed(&self, repo_id: String) {
        self.publish_worktrees_changed_with_rename(repo_id, None);
    }

    pub(crate) fn publish_worktrees_changed_with_rename(
        &self,
        repo_id: String,
        renamed: Option<(String, String)>,
    ) {
        self.publish(ClientEvent::WorktreesChanged {
            repo_id,
            renamed: renamed.map(|(old_worktree_id, new_worktree_id)| WorktreeRename {
                old_worktree_id,
                new_worktree_id,
            }),
        });
    }

    pub(crate) fn publish_activate_worktree(
        &self,
        repo_id: String,
        worktree_id: String,
        setup: Option<Value>,
        startup: Option<Value>,
        default_tabs: Option<Value>,
    ) {
        self.publish(ClientEvent::ActivateWorktree {
            repo_id,
            worktree_id,
            setup,
            startup,
            default_tabs,
        });
    }

    pub(crate) fn publish_worktree_head_identities_changed(
        &self,
        repo_id: String,
        identities: Vec<WorktreeHeadIdentity>,
    ) {
        self.publish(ClientEvent::WorktreeHeadIdentitiesChanged {
            repo_id,
            identities,
        });
    }

    fn publish(&self, event: ClientEvent) {
        let mut subscribers = lock(&self.inner.subscribers);
        subscribers.retain(|_, sender| match sender.try_send(event.clone()) {
            Ok(()) => true,
            Err(mpsc::error::TrySendError::Closed(_) | mpsc::error::TrySendError::Full(_)) => false,
        });
    }

    pub(crate) fn subscribe(&self, connection_id: &str) -> ClientEventSubscription {
        let sequence = self.inner.next_id.fetch_add(1, Ordering::Relaxed);
        let id = format!("runtime-client-events-{connection_id}-{sequence}");
        let (sender, receiver) = mpsc::channel(SUBSCRIPTION_CAPACITY);
        lock(&self.inner.subscribers).insert(id.clone(), sender);
        ClientEventSubscription {
            authority: self.clone(),
            ended: false,
            id,
            receiver,
            ready: false,
        }
    }

    pub(crate) fn unsubscribe(&self, connection_id: &str, subscription_id: &str) -> bool {
        if !subscription_id.starts_with(&format!("runtime-client-events-{connection_id}-")) {
            return false;
        }
        lock(&self.inner.subscribers).remove(subscription_id);
        true
    }
}

impl ClientEventSubscription {
    pub(crate) async fn next(&mut self) -> Option<ClientSubscriptionEvent> {
        if !self.ready {
            self.ready = true;
            return Some(ClientSubscriptionEvent::Ready {
                subscription_id: self.id.clone(),
            });
        }
        if self.ended {
            return None;
        }
        match self.receiver.recv().await {
            Some(ClientEvent::ReposChanged) => Some(ClientSubscriptionEvent::ReposChanged),
            Some(ClientEvent::WorktreesChanged { repo_id, renamed }) => {
                Some(ClientSubscriptionEvent::WorktreesChanged { repo_id, renamed })
            }
            Some(ClientEvent::ActivateWorktree {
                repo_id,
                worktree_id,
                setup,
                startup,
                default_tabs,
            }) => Some(ClientSubscriptionEvent::ActivateWorktree {
                repo_id,
                worktree_id,
                setup,
                startup,
                default_tabs,
            }),
            Some(ClientEvent::WorktreeHeadIdentitiesChanged {
                repo_id,
                identities,
            }) => Some(ClientSubscriptionEvent::WorktreeHeadIdentitiesChanged {
                repo_id,
                identities,
            }),
            None => {
                self.ended = true;
                Some(ClientSubscriptionEvent::End)
            }
        }
    }
}

impl Drop for ClientEventSubscription {
    fn drop(&mut self) {
        lock(&self.authority.inner.subscribers).remove(&self.id);
    }
}

fn lock<T>(mutex: &Mutex<T>) -> MutexGuard<'_, T> {
    mutex
        .lock()
        .unwrap_or_else(std::sync::PoisonError::into_inner)
}
