use serde_json::{Value, json};

use super::scope::{GitAuthority, GitAuthorityError};

impl GitAuthority {
    pub(crate) async fn abort_operation(
        &self,
        worktree: &str,
        operation: &str,
    ) -> Result<Value, GitAuthorityError> {
        let scope = self.scope(worktree).await?;
        let _cache = self.begin_read_cache_invalidation();
        let args = match operation {
            "merge" => strings(["merge", "--abort"]),
            "rebase" => strings(["rebase", "--abort"]),
            "revert" => strings(["revert", "--abort"]),
            _ => return Err(GitAuthorityError::InvalidInput("invalid git operation")),
        };
        scope.runner.checked(args).await?;
        Ok(json!({ "ok": true }))
    }
}

fn strings<const N: usize>(values: [&str; N]) -> Vec<String> {
    values.into_iter().map(str::to_owned).collect()
}
