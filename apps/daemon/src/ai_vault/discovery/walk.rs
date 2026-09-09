use std::collections::VecDeque;

use crate::hosts::{HostFileKind, HostFilesystem};

use super::super::accumulator;
use super::super::model::{AiVaultAgent, SessionCandidate};
use super::now_iso;
use super::roots::Root;

const MAX_DIRECTORY_DEPTH: usize = 12;
const MAX_DISCOVERY_ENTRIES: usize = 200_000;
const MAX_DISCOVERY_PATH_BYTES: usize = 32 * 1024 * 1024;

pub(super) async fn discover_files(
    filesystem: &HostFilesystem,
    root: &Root,
    budget: &mut DiscoveryBudget,
) -> Result<Vec<SessionCandidate>, String> {
    let stat = filesystem
        .stat(&root.path)
        .await
        .map_err(|error| error.to_string())?;
    if !stat.is_some_and(|stat| stat.kind == HostFileKind::Directory) {
        return Ok(Vec::new());
    }
    let mut queue = VecDeque::from([(root.path.clone(), 0_usize)]);
    let mut candidates = Vec::new();
    while let Some((directory, depth)) = queue.pop_front() {
        let entries = filesystem
            .read_dir(&directory)
            .await
            .map_err(|error| error.to_string())?;
        for entry in entries {
            let path = filesystem.paths().join(&[&directory, &entry.name]);
            budget.consume(&path)?;
            match entry.kind {
                HostFileKind::Directory
                    if depth < MAX_DIRECTORY_DEPTH && root.rule.descend(&entry.name, depth) =>
                {
                    queue.push_back((path, depth + 1))
                }
                HostFileKind::File if root.accepts(&path) => {
                    let Some(stat) = filesystem
                        .stat(&path)
                        .await
                        .map_err(|error| error.to_string())?
                    else {
                        continue;
                    };
                    let modified_at_ms = stat.modified_at_ms.unwrap_or(0);
                    candidates.push(SessionCandidate {
                        agent: root.agent,
                        codex_home: (root.agent == AiVaultAgent::Codex)
                            .then(|| filesystem.paths().dirname(&root.path)),
                        modified_at: accumulator::timestamp_iso(modified_at_ms)
                            .unwrap_or_else(now_iso),
                        modified_at_ms,
                        path,
                        size_bytes: stat.size_bytes,
                    });
                }
                _ => {}
            }
        }
    }
    Ok(candidates)
}

#[derive(Default)]
pub(super) struct DiscoveryBudget {
    entries: usize,
    path_bytes: usize,
}

impl DiscoveryBudget {
    fn consume(&mut self, path: &str) -> Result<(), String> {
        self.entries = self.entries.saturating_add(1);
        self.path_bytes = self.path_bytes.saturating_add(path.len());
        if self.entries > MAX_DISCOVERY_ENTRIES || self.path_bytes > MAX_DISCOVERY_PATH_BYTES {
            Err("AI Vault session file discovery capacity exceeded".to_owned())
        } else {
            Ok(())
        }
    }
}
