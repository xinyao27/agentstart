use crate::projects::Project;

use super::RepositoryRefsError;

pub(super) fn resolve(
    projects: Vec<Project>,
    selector: &str,
    host_id: &str,
) -> Result<Project, RepositoryRefsError> {
    let selector_kind = selector
        .split_once(':')
        .filter(|(kind, _)| matches!(*kind, "id" | "path" | "name"));
    let mut matches = projects.into_iter().filter(|project| {
        if project.execution_host_id != host_id {
            return false;
        }
        match selector_kind {
            Some(("id", value)) => project.id == value,
            Some(("path", value)) => paths_equal(&project.path, value),
            Some(("name", value)) => project.display_name == value,
            Some(_) => false,
            None => {
                project.id == selector
                    || paths_equal(&project.path, selector)
                    || project.display_name == selector
            }
        }
    });
    let Some(project) = matches.next() else {
        return Err(RepositoryRefsError::ProjectNotFound);
    };
    if matches.next().is_some() {
        return Err(RepositoryRefsError::SelectorAmbiguous);
    }
    Ok(project)
}

fn paths_equal(left: &str, right: &str) -> bool {
    crate::runtime_path::equal(left, right)
}
