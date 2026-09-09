use std::sync::atomic::AtomicU64;

use crate::skills::SkillsAuthority;

pub(super) mod protocol;
pub(super) mod protocol_values;

// Why: the legacy JSON surface for the skills namespace is retired; only the
// protobuf handlers remain, backed by the same skills authority.

static SUBSCRIPTION_SEQUENCE: AtomicU64 = AtomicU64::new(0);

#[derive(Clone)]
pub(super) struct SkillsRpc {
    pub(super) authority: SkillsAuthority,
}

impl SkillsRpc {
    pub(super) fn new(authority: SkillsAuthority) -> Self {
        Self { authority }
    }
}
