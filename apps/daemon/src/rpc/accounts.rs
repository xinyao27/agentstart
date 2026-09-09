use crate::account_usage::AccountsAuthority;

pub(super) mod protocol;

#[derive(Clone)]
pub(super) struct AccountsRpc {
    pub(super) authority: AccountsAuthority,
}

impl AccountsRpc {
    pub(super) fn new(authority: AccountsAuthority) -> Self {
        Self { authority }
    }

    pub(super) fn authority(&self) -> AccountsAuthority {
        self.authority.clone()
    }
}
