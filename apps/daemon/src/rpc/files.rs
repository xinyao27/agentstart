pub(super) mod protocol;
mod protocol_values;

use crate::files::FilesAuthority;

#[derive(Clone)]
pub(super) struct FilesRpc {
    authority: FilesAuthority,
}

impl FilesRpc {
    pub(super) fn new(authority: FilesAuthority) -> Self {
        Self { authority }
    }

    pub(super) fn authority(&self) -> &FilesAuthority {
        &self.authority
    }
}
