use async_trait::async_trait;
use tokio::sync::mpsc;

use crate::projects::{ProjectCatalogMailbox, ProjectCatalogMailboxClosed, ProjectCatalogRequest};
use crate::ritual::{RitualScheduleMailbox, RitualScheduleMailboxClosed, RitualScheduleRequest};
use crate::worktrees::{
    WorktreeArchiveMailbox, WorktreeArchiveMailboxClosed, WorktreeArchiveRequest,
    WorktreeMetadataMailbox, WorktreeMetadataMailboxClosed, WorktreeMetadataRequest,
};

use super::DatabaseCommand;
use crate::persistence::host_store::{HostStoreMailbox, HostStoreMailboxClosed, HostStoreRequest};

pub(super) struct DatabaseHostStoreMailbox(pub(super) mpsc::Sender<DatabaseCommand>);

pub(super) struct DatabaseProjectCatalogMailbox(pub(super) mpsc::Sender<DatabaseCommand>);

pub(super) struct DatabaseRitualScheduleMailbox(pub(super) mpsc::Sender<DatabaseCommand>);

pub(super) struct DatabaseWorktreeArchiveMailbox(pub(super) mpsc::Sender<DatabaseCommand>);

pub(super) struct DatabaseWorktreeMetadataMailbox(pub(super) mpsc::Sender<DatabaseCommand>);

#[async_trait]
impl HostStoreMailbox for DatabaseHostStoreMailbox {
    async fn submit(&self, request: HostStoreRequest) -> Result<(), HostStoreMailboxClosed> {
        self.0
            .send(DatabaseCommand::HostStore(request))
            .await
            .map_err(|_| HostStoreMailboxClosed)
    }
}

#[async_trait]
impl ProjectCatalogMailbox for DatabaseProjectCatalogMailbox {
    async fn submit(
        &self,
        request: ProjectCatalogRequest,
    ) -> Result<(), ProjectCatalogMailboxClosed> {
        self.0
            .send(DatabaseCommand::ProjectCatalog(request))
            .await
            .map_err(|_| ProjectCatalogMailboxClosed)
    }
}

#[async_trait]
impl RitualScheduleMailbox for DatabaseRitualScheduleMailbox {
    async fn submit(
        &self,
        request: RitualScheduleRequest,
    ) -> Result<(), RitualScheduleMailboxClosed> {
        self.0
            .send(DatabaseCommand::RitualSchedule(request))
            .await
            .map_err(|_| RitualScheduleMailboxClosed)
    }
}

#[async_trait]
impl WorktreeArchiveMailbox for DatabaseWorktreeArchiveMailbox {
    async fn submit(
        &self,
        request: WorktreeArchiveRequest,
    ) -> Result<(), WorktreeArchiveMailboxClosed> {
        self.0
            .send(DatabaseCommand::WorktreeArchive(request))
            .await
            .map_err(|_| WorktreeArchiveMailboxClosed)
    }
}

#[async_trait]
impl WorktreeMetadataMailbox for DatabaseWorktreeMetadataMailbox {
    async fn submit(
        &self,
        request: WorktreeMetadataRequest,
    ) -> Result<(), WorktreeMetadataMailboxClosed> {
        self.0
            .send(DatabaseCommand::WorktreeMetadata(request))
            .await
            .map_err(|_| WorktreeMetadataMailboxClosed)
    }
}
