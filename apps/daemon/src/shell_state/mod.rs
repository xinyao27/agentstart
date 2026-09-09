mod github_cache;
pub(crate) mod onboarding;

use std::path::Path;

use serde_json::Value;

use crate::ui::UiAuthority;

pub(crate) use github_cache::GitHubCacheError;
use github_cache::GitHubCacheStore;

#[derive(Clone)]
pub(crate) struct ShellStateAuthority {
    cache: GitHubCacheStore,
    ui: UiAuthority,
}

impl ShellStateAuthority {
    pub(crate) async fn open(
        user_data_path: &Path,
        ui: UiAuthority,
    ) -> Result<Self, GitHubCacheError> {
        Ok(Self {
            cache: GitHubCacheStore::open(user_data_path).await?,
            ui,
        })
    }

    pub(crate) fn get_github_cache(&self) -> Value {
        self.cache.get()
    }

    pub(crate) async fn set_github_cache(&self, value: &Value) -> Result<(), GitHubCacheError> {
        self.cache.set(value).await
    }

    pub(crate) fn get_onboarding(&self) -> Value {
        self.ui.get_onboarding()
    }

    pub(crate) fn update_onboarding(&self, value: &Value) -> Value {
        self.ui.update_onboarding(value)
    }
}
