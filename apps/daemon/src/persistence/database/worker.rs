use rusqlite::Connection;
use tokio::sync::mpsc;

use crate::projects::ProjectCatalogWorker;
use crate::ritual::RitualScheduleWorker;
use crate::worktrees::{WorktreeArchiveWorker, WorktreeMetadataWorker};

use super::{DatabaseCommand, close_connection};
use crate::persistence::artifact_store::ArtifactStoreWorker;
use crate::persistence::browser_replay::BrowserReplayStoreWorker;
use crate::persistence::host_store::HostStoreWorker;
use crate::persistence::visual_regression::VisualRegressionStoreWorker;
use crate::persistence::workspace_journal::WorkspaceJournalWorker;

pub(super) fn run_database_worker(
    mut connection: Connection,
    mut commands: mpsc::Receiver<DatabaseCommand>,
) {
    let artifact_store = ArtifactStoreWorker;
    let browser_replays = BrowserReplayStoreWorker;
    let host_store = HostStoreWorker;
    let project_catalog = ProjectCatalogWorker;
    let ritual_schedule = RitualScheduleWorker;
    let visual_regressions = VisualRegressionStoreWorker;
    let worktree_archives = WorktreeArchiveWorker;
    let worktree_metadata = WorktreeMetadataWorker;
    let workspace_journal = WorkspaceJournalWorker::new();
    loop {
        match commands.blocking_recv() {
            Some(DatabaseCommand::ArtifactStore(command)) => {
                artifact_store.handle(&connection, command);
            }
            Some(DatabaseCommand::AgentSession(request)) => {
                super::super::agent_sessions::handle(&connection, request);
            }
            Some(DatabaseCommand::BrowserReplay(command)) => {
                browser_replays.handle(&connection, command);
            }
            Some(DatabaseCommand::HostStore(request)) => {
                host_store.handle(&mut connection, request, || {
                    workspace_journal.notify_committed();
                });
            }
            Some(DatabaseCommand::ProjectCatalog(request)) => {
                project_catalog.handle(&mut connection, request, || {
                    workspace_journal.notify_committed();
                });
            }
            Some(DatabaseCommand::RitualSchedule(request)) => {
                ritual_schedule.handle(&connection, request);
            }
            Some(DatabaseCommand::VisualRegression(command)) => {
                visual_regressions.handle(&connection, command);
            }
            Some(DatabaseCommand::WorktreeArchive(request)) => {
                worktree_archives.handle(&mut connection, request);
            }
            Some(DatabaseCommand::WorktreeMetadata(request)) => {
                worktree_metadata.handle(&mut connection, request);
            }
            Some(DatabaseCommand::WorkspaceJournal(command)) => {
                workspace_journal.handle(&mut connection, command);
            }
            Some(DatabaseCommand::Close(response)) => {
                let _ = response.send(close_connection(connection));
                return;
            }
            None => {
                let _ = close_connection(connection);
                return;
            }
        }
    }
}
