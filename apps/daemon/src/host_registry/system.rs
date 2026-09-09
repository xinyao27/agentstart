use std::sync::Arc;

use crate::hosts::ExecutionHost;

use super::git_bash::is_available as is_git_bash_available;
use super::pwsh::PwshCapability;
use super::wsl::WslCapability;

#[derive(Clone)]
pub(crate) struct SystemHostCapabilities {
    local: Arc<dyn ExecutionHost>,
    pwsh: PwshCapability,
    wsl: WslCapability,
}

impl SystemHostCapabilities {
    pub(crate) fn new(local: Arc<dyn ExecutionHost>) -> Self {
        Self {
            local,
            pwsh: PwshCapability::new(),
            wsl: WslCapability::new(),
        }
    }

    pub(crate) async fn is_wsl_available(&self) -> bool {
        self.wsl.available(self.local.clone()).await
    }

    pub(crate) async fn list_wsl_distros(&self) -> Vec<String> {
        self.wsl.list_distros(self.local.clone()).await
    }

    pub(crate) async fn is_pwsh_available(&self) -> bool {
        self.pwsh.available(self.local.clone()).await
    }

    pub(crate) fn is_git_bash_available(&self) -> bool {
        is_git_bash_available()
    }
}
