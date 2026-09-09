mod agent_rows;
mod archive;
mod authority;
mod catalog;
mod create_branch;
mod git_scan;
mod legacy;
mod metadata;
mod port_probes;
mod projection;
mod records;
mod removal;

pub(crate) use archive::{
    WorktreeArchiveAuthority, WorktreeArchiveAuthorityError, WorktreeArchiveMailbox,
    WorktreeArchiveMailboxClosed, WorktreeArchiveRequest, WorktreeArchiveStore,
    WorktreeArchiveWorker,
};
pub(crate) use authority::{WorktreeAuthority, WorktreeAuthorityError};
pub(crate) use catalog::{ResolvedWorktree, WorktreeCatalog, WorktreeCatalogError};
pub(crate) use metadata::{
    WorkbenchWorktreeMetadata, WorktreeMetadataError, WorktreeMetadataMailbox,
    WorktreeMetadataMailboxClosed, WorktreeMetadataRequest, WorktreeMetadataStore,
    WorktreeMetadataWorker,
};
pub(crate) use projection::{LinkedPullRequest, WorktreePsResult, WorktreePsSummary};

pub(crate) fn import_legacy_metadata(
    connection: &mut rusqlite::Connection,
    user_data_path: &std::path::Path,
) -> Result<(), metadata::WorktreeMetadataError> {
    match legacy::read(user_data_path) {
        legacy::LegacyMetadata::Authoritative(entries) => {
            records::sync_workbench(connection, &entries)
        }
        legacy::LegacyMetadata::Unavailable => Ok(()),
    }
}
