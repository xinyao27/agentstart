use crate::app_control::AppControlAuthority;

pub(super) mod protocol;

#[derive(Clone)]
pub(super) struct AppControlRpc {
    authority: AppControlAuthority,
}

impl AppControlRpc {
    pub(super) fn new(authority: AppControlAuthority) -> Self {
        Self { authority }
    }
}
