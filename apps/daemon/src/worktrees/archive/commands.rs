use std::sync::Arc;

use crate::hosts::{ExecutionHost, HostCommand};

use super::authority::WorktreeArchiveAuthorityError;

pub(super) struct GitCommands {
    cwd: String,
    host: Arc<dyn ExecutionHost>,
}

impl GitCommands {
    pub(super) fn new(host: Arc<dyn ExecutionHost>, cwd: String) -> Self {
        Self { cwd, host }
    }

    pub(super) async fn run<const N: usize>(
        &self,
        args: [&str; N],
    ) -> Result<String, WorktreeArchiveAuthorityError> {
        self.execute(args.into_iter().map(str::to_owned).collect())
            .await
    }

    pub(super) async fn checked<I>(&self, args: I) -> Result<String, WorktreeArchiveAuthorityError>
    where
        I: IntoIterator,
        I::Item: Into<String>,
    {
        self.execute(args.into_iter().map(Into::into).collect())
            .await
    }

    async fn execute(&self, args: Vec<String>) -> Result<String, WorktreeArchiveAuthorityError> {
        let mut command = HostCommand::new("git", args);
        command.cwd = Some(self.cwd.clone());
        command.env = vec![
            ("GIT_TERMINAL_PROMPT".to_owned(), "0".to_owned()),
            ("LC_ALL".to_owned(), "C".to_owned()),
        ];
        let output = self
            .host
            .exec(command)
            .await
            .map_err(|error| WorktreeArchiveAuthorityError::Operation(error.to_string()))?;
        if output.exit_code == 0 {
            return Ok(output.stdout);
        }
        let detail = if output.stderr.trim().is_empty() {
            output.stdout.trim()
        } else {
            output.stderr.trim()
        };
        Err(WorktreeArchiveAuthorityError::Operation(
            if detail.is_empty() {
                format!("git exited with status {}", output.exit_code)
            } else {
                detail.to_owned()
            },
        ))
    }
}
