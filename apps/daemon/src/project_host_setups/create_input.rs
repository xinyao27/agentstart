use crate::projects::RuntimeProject;

use super::{ProjectHostSetup, SetupCreate};

pub(super) fn normalize(
    input: &mut SetupCreate,
    project: &RuntimeProject,
    existing: &[ProjectHostSetup],
) {
    input.setup_id = unique_id(
        input.setup_id.take(),
        &input.project_id,
        &input.host_id,
        existing,
    );
    input.path = trim(input.path.take());
    input.worktree_base_path = trim(input.worktree_base_path.take());
    input.git_username = trim(input.git_username.take());
    input.display_name = trim(input.display_name.take());
    if input.display_name.is_none() {
        input.display_name = Some(project.display_name.clone());
    }
}

fn trim(value: Option<String>) -> Option<String> {
    value
        .map(|value| value.trim().to_owned())
        .filter(|value| !value.is_empty())
}

fn unique_id(
    requested: Option<String>,
    project_id: &str,
    host_id: &str,
    existing: &[ProjectHostSetup],
) -> Option<String> {
    let base = requested
        .and_then(|value| trim(Some(value)))
        .unwrap_or_else(|| format!("{project_id}::{host_id}"));
    for suffix in 0_u64.. {
        let candidate = if suffix == 0 {
            base.clone()
        } else {
            format!("{base}-{suffix}")
        };
        if !existing.iter().any(|setup| setup.id == candidate) {
            return Some(candidate);
        }
    }
    unreachable!("an available setup identifier exists")
}
