use serde_json::Value;

use crate::hosts::HostCommand;

use super::{GitHubAuthority, GitHubContext, GitHubError};

impl GitHubAuthority {
    pub(crate) async fn gh(
        &self,
        context: &GitHubContext,
        args: impl IntoIterator<Item = impl Into<String>>,
        timeout_ms: u64,
    ) -> Result<String, GitHubError> {
        self.gh_with_input(context, args, timeout_ms, None).await
    }

    pub(crate) async fn gh_with_input(
        &self,
        context: &GitHubContext,
        args: impl IntoIterator<Item = impl Into<String>>,
        timeout_ms: u64,
        stdin: Option<Vec<u8>>,
    ) -> Result<String, GitHubError> {
        let args = args.into_iter().map(Into::into).collect::<Vec<_>>();
        let bucket = crate::github::rate_limit::bucket_for(&args);
        if let Some(block) = bucket.and_then(|name| self.rate_guard(context, name)) {
            return Err(crate::github::rate_limit::rate_error(block));
        }
        let output = self.gh_unmetered(context, args, timeout_ms, stdin).await?;
        if let Some(bucket) = bucket {
            self.note_rate_spend(context, bucket);
        }
        Ok(output)
    }

    pub(in crate::github) async fn gh_unmetered(
        &self,
        context: &GitHubContext,
        args: impl IntoIterator<Item = impl Into<String>>,
        timeout_ms: u64,
        stdin: Option<Vec<u8>>,
    ) -> Result<String, GitHubError> {
        let _permit = self
            .permits
            .clone()
            .acquire_owned()
            .await
            .map_err(|_| GitHubError::Shutdown)?;
        let mut command = HostCommand::new("gh", args);
        command.cwd = Some(context.path.clone());
        command
            .env
            .push(("GH_PROMPT_DISABLED".to_owned(), "1".to_owned()));
        command.timeout_ms = Some(timeout_ms);
        command.max_output_bytes = Some(16 * 1_024 * 1_024);
        command.stdin = stdin;
        let output = context.host.exec(command).await?;
        if output.exit_code != 0 {
            return Err(GitHubError::Command(command_message(
                &output.stderr,
                &output.stdout,
                "GitHub CLI command failed",
            )));
        }
        Ok(output.stdout)
    }

    pub(crate) async fn gh_json(
        &self,
        context: &GitHubContext,
        args: impl IntoIterator<Item = impl Into<String>>,
        timeout_ms: u64,
    ) -> Result<Value, GitHubError> {
        Ok(serde_json::from_str(
            &self.gh(context, args, timeout_ms).await?,
        )?)
    }

    pub(crate) async fn gh_bytes(
        &self,
        context: &GitHubContext,
        args: impl IntoIterator<Item = impl Into<String>>,
        timeout_ms: u64,
    ) -> Result<Vec<u8>, GitHubError> {
        let args = args.into_iter().map(Into::into).collect::<Vec<_>>();
        let bucket = crate::github::rate_limit::bucket_for(&args);
        if let Some(block) = bucket.and_then(|name| self.rate_guard(context, name)) {
            return Err(crate::github::rate_limit::rate_error(block));
        }
        let _permit = self
            .permits
            .clone()
            .acquire_owned()
            .await
            .map_err(|_| GitHubError::Shutdown)?;
        let mut command = HostCommand::new("gh", args);
        command.cwd = Some(context.path.clone());
        command
            .env
            .push(("GH_PROMPT_DISABLED".to_owned(), "1".to_owned()));
        command.timeout_ms = Some(timeout_ms);
        command.max_output_bytes = Some(16 * 1_024 * 1_024);
        command.capture_stdout_bytes = true;
        let output = context.host.exec(command).await?;
        if output.exit_code != 0 {
            return Err(GitHubError::Command(command_message(
                &output.stderr,
                &output.stdout,
                "GitHub CLI command failed",
            )));
        }
        if let Some(bucket) = bucket {
            self.note_rate_spend(context, bucket);
        }
        Ok(output
            .stdout_bytes
            .unwrap_or_else(|| output.stdout.into_bytes()))
    }

    pub(crate) async fn git(
        &self,
        context: &GitHubContext,
        args: impl IntoIterator<Item = impl Into<String>>,
        timeout_ms: u64,
    ) -> Result<String, GitHubError> {
        let mut command = HostCommand::new("git", args);
        command.cwd = Some(context.path.clone());
        command.timeout_ms = Some(timeout_ms);
        command.max_output_bytes = Some(4 * 1_024 * 1_024);
        let output = context.host.exec(command).await?;
        if output.exit_code != 0 {
            return Err(GitHubError::Command(command_message(
                &output.stderr,
                &output.stdout,
                "git command failed",
            )));
        }
        Ok(output.stdout)
    }
}

fn command_message(stderr: &str, stdout: &str, fallback: &str) -> String {
    let value = if stderr.trim().is_empty() {
        stdout.trim()
    } else {
        stderr.trim()
    };
    if value.is_empty() {
        fallback.to_owned()
    } else {
        value.chars().take(4_096).collect()
    }
}
