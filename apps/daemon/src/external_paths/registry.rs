use std::collections::VecDeque;
use std::path::{Path, PathBuf};

const AUTHORIZED_EXTERNAL_PATHS_MAX: usize = 4_096;

#[derive(Default)]
pub(super) struct AuthorizedPaths {
    entries: VecDeque<PathBuf>,
}

impl AuthorizedPaths {
    pub(super) fn remember(&mut self, path: PathBuf) {
        if let Some(index) = self.entries.iter().position(|entry| entry == &path) {
            self.entries.remove(index);
        }
        self.entries.push_back(path);
        while self.entries.len() > AUTHORIZED_EXTERNAL_PATHS_MAX {
            self.entries.pop_front();
        }
    }

    pub(super) fn contains(&self, path: &Path) -> bool {
        self.entries
            .iter()
            .any(|authorized| is_descendant_or_equal(path, authorized))
    }
}

#[cfg(not(windows))]
fn is_descendant_or_equal(target: &Path, base: &Path) -> bool {
    target.starts_with(base)
}

#[cfg(windows)]
fn is_descendant_or_equal(target: &Path, base: &Path) -> bool {
    let target = comparable_windows_components(target);
    let base = comparable_windows_components(base);
    target.len() >= base.len()
        && target
            .iter()
            .zip(base.iter())
            .all(|(left, right)| left == right)
}

#[cfg(windows)]
fn comparable_windows_components(path: &Path) -> Vec<String> {
    path.components()
        .map(|component| component.as_os_str().to_string_lossy().to_ascii_lowercase())
        .collect()
}
