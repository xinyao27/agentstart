mod authority;
mod commands;
mod events;
mod hook;

pub(crate) use hook::run_effective as run_effective_archive_hook;
pub(crate) use hook::run_setup as run_effective_setup_hook;
mod records;
mod store;

pub(crate) use authority::{WorktreeArchiveAuthority, WorktreeArchiveAuthorityError};
pub(crate) use store::{
    WorktreeArchiveMailbox, WorktreeArchiveMailboxClosed, WorktreeArchiveRequest,
    WorktreeArchiveStore, WorktreeArchiveWorker,
};
