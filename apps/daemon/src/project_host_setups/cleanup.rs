use tokio::sync::oneshot;

use super::{
    CleanupTombstone, ProjectHostSetupAuthority, ProjectHostSetupError, ProjectHostSetupRequest,
};

impl ProjectHostSetupAuthority {
    pub(crate) async fn replay_cleanups(&self) -> Result<(), ProjectHostSetupError> {
        let (response, result) = oneshot::channel();
        self.projects
            .submit_project_host_setups(ProjectHostSetupRequest::PendingCleanups { response })
            .await?;
        for cleanup in super::authority::receive(result).await? {
            self.replay_cleanup(cleanup).await?;
        }
        Ok(())
    }

    pub(crate) async fn replay_cleanup(
        &self,
        cleanup: CleanupTombstone,
    ) -> Result<(), ProjectHostSetupError> {
        let host_id = (!cleanup.prune_all_hosts).then_some(cleanup.host_id.as_str());
        self.sessions
            .prune_repo_owner(&cleanup.repo_id, host_id)
            .await?;
        self.state_cleanup.replay(&cleanup).await?;
        let (response, result) = oneshot::channel();
        self.projects
            .submit_project_host_setups(ProjectHostSetupRequest::AckCleanup { cleanup, response })
            .await?;
        super::authority::receive(result).await
    }
}
