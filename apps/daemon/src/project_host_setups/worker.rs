use tokio::sync::oneshot;

use crate::projects::ProjectCatalogError;

use super::{ProjectHostSetupRequest, StoredMutation};

pub(crate) struct ProjectHostSetupWorker;

impl ProjectHostSetupWorker {
    pub(crate) fn handle(
        connection: &mut rusqlite::Connection,
        request: ProjectHostSetupRequest,
        on_committed: impl FnOnce(),
    ) {
        let committed = match request {
            ProjectHostSetupRequest::AckCleanup { cleanup, response } => {
                let _ = response.send(super::records::ack_cleanup(connection, cleanup));
                false
            }
            ProjectHostSetupRequest::Attach {
                expected_revision,
                prepared,
                response,
            } => send(
                response,
                super::records::attach_repository(connection, expected_revision, prepared),
            ),
            ProjectHostSetupRequest::Create { input, response } => {
                send(response, super::records::create(connection, input))
            }
            ProjectHostSetupRequest::Delete { input, response } => {
                send(response, super::records::delete(connection, input))
            }
            ProjectHostSetupRequest::List { response } => {
                let _ = response.send(super::records::list(connection));
                false
            }
            ProjectHostSetupRequest::PendingCleanups { response } => {
                let _ = response.send(super::records::pending_cleanups(connection));
                false
            }
            ProjectHostSetupRequest::Update { input, response } => {
                send(response, super::records::update(connection, input))
            }
        };
        if committed {
            on_committed();
        }
    }
}

fn send(
    response: oneshot::Sender<Result<StoredMutation, ProjectCatalogError>>,
    result: Result<StoredMutation, ProjectCatalogError>,
) -> bool {
    let committed = result.is_ok();
    let _ = response.send(result);
    committed
}
