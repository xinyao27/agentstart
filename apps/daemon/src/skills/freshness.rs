#[path = "freshness/artifacts.rs"]
mod artifacts;
#[path = "freshness/git-tree.rs"]
mod git_tree;
#[path = "freshness/identity.rs"]
mod identity;
#[path = "freshness/observation.rs"]
mod observation;
#[path = "freshness/verdict.rs"]
mod verdict;

const MAX_DEPTH: usize = 16;
const MAX_ENTRIES: usize = 2_048;
const MAX_FILES: usize = 512;
const MAX_FILE_BYTES: u64 = 4 * 1_024 * 1_024;
const MAX_TOTAL_BYTES: u64 = 32 * 1_024 * 1_024;

pub(crate) use artifacts::global_locks;
pub(crate) use observation::{failed_update_names, inventory};
