use crate::account_usage::RateLimitResumeAuthority;

pub(crate) mod protocol;

#[derive(Clone)]
pub(super) struct RateLimitResumeRpc {
    authority: RateLimitResumeAuthority,
    accounts: super::accounts::AccountsRpc,
}

impl RateLimitResumeRpc {
    pub(super) fn new(
        authority: RateLimitResumeAuthority,
        accounts: super::accounts::AccountsRpc,
    ) -> Self {
        Self {
            authority,
            accounts,
        }
    }
}
