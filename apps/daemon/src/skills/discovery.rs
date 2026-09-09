#[path = "discovery/merge.rs"]
mod merge;
#[path = "discovery/roots.rs"]
mod roots;
#[path = "discovery/scan.rs"]
mod scan;

pub(crate) use merge::{merge_candidates, string_field};
pub(crate) use roots::{SourceRoot, home_roots};
pub(crate) use scan::scan_root;
