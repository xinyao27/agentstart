use crate::provider_usage::ProviderUsageAuthority;

pub(super) mod protocol;

#[derive(Clone)]
pub(super) struct ProviderUsageRpc {
    authority: ProviderUsageAuthority,
}

impl ProviderUsageRpc {
    pub(super) fn new(authority: ProviderUsageAuthority) -> Self {
        Self { authority }
    }
}
