use std::collections::{HashMap, HashSet};

use rusqlite::{Transaction, params};

use crate::projects::{ProjectCatalogError, identity};

use super::super::super::import_model::ProjectGroupImportMode;
use super::super::super::import_scope::{self, FolderScope};
use super::super::super::model::{ProjectGroup, ProjectGroupCreatedFrom};

pub(super) struct GroupResolver<'a> {
    created: HashMap<String, ProjectGroup>,
    group_name: String,
    mode: ProjectGroupImportMode,
    parent_path: String,
    root: Option<ProjectGroup>,
    scope_set: HashSet<String>,
    scopes: HashMap<String, FolderScope>,
    transaction: &'a Transaction<'a>,
}

impl<'a> GroupResolver<'a> {
    pub(super) fn new(
        transaction: &'a Transaction<'a>,
        mode: ProjectGroupImportMode,
        parent_path: String,
        group_name: String,
        scopes: Vec<FolderScope>,
    ) -> Self {
        let scope_set = scopes
            .iter()
            .map(|scope| scope.relative_path.clone())
            .collect();
        let scopes = scopes
            .into_iter()
            .map(|scope| (scope.relative_path.clone(), scope))
            .collect();
        Self {
            created: HashMap::new(),
            group_name,
            mode,
            parent_path,
            root: None,
            scope_set,
            scopes,
            transaction,
        }
    }

    pub(super) fn root(&self) -> Option<ProjectGroup> {
        self.root.clone()
    }

    pub(super) fn group_for_repo(
        &mut self,
        repo_path: &str,
    ) -> Result<Option<String>, ProjectCatalogError> {
        if matches!(self.mode, ProjectGroupImportMode::Separate) {
            return Ok(None);
        }
        let root = self.ensure_root()?.id;
        let Some(scope) =
            import_scope::nearest_for_repo(&self.parent_path, repo_path, &self.scope_set)
        else {
            return Ok(Some(root));
        };
        Ok(Some(self.ensure_scope(&scope)?.id))
    }

    fn ensure_root(&mut self) -> Result<ProjectGroup, ProjectCatalogError> {
        if let Some(root) = self.root.clone() {
            return Ok(root);
        }
        let name = if self.group_name.trim().is_empty() {
            basename(&self.parent_path)
        } else {
            self.group_name.trim().to_owned()
        };
        let root = create_group(self.transaction, name, self.parent_path.clone(), None)?;
        self.root = Some(root.clone());
        Ok(root)
    }

    fn ensure_scope(&mut self, relative_path: &str) -> Result<ProjectGroup, ProjectCatalogError> {
        if let Some(group) = self.created.get(relative_path) {
            return Ok(group.clone());
        }
        let scope = self
            .scopes
            .get(relative_path)
            .cloned()
            .ok_or(ProjectCatalogError::NotFound)?;
        let parent_id = match scope.parent_relative_path.as_deref() {
            Some(parent) => self.ensure_scope(parent)?.id,
            None => self.ensure_root()?.id,
        };
        let group = create_group(
            self.transaction,
            scope.name,
            scope.folder_path,
            Some(parent_id),
        )?;
        self.created.insert(relative_path.to_owned(), group.clone());
        Ok(group)
    }
}

fn create_group(
    transaction: &Transaction<'_>,
    name: String,
    parent_path: String,
    parent_group_id: Option<String>,
) -> Result<ProjectGroup, ProjectCatalogError> {
    let id = identity::random_uuid()?;
    let now = identity::now_millis()?;
    let name = nonempty_name(&name);
    let tab_order: f64 = transaction
        .query_row(
            "SELECT COALESCE(MAX(tab_order), -1) + 1 FROM project_group",
            [],
            |row| row.get(0),
        )
        .map_err(ProjectCatalogError::storage)?;
    transaction
        .execute(
            "INSERT INTO project_group(
               id, name, parent_path, connection_id, parent_group_id, created_from,
               tab_order, is_collapsed, color, created_at, updated_at
             ) VALUES (?1, ?2, ?3, NULL, ?4, 'folder-scan', ?5, 0, NULL, ?6, ?6)",
            params![id, name, parent_path, parent_group_id, tab_order, now],
        )
        .map_err(ProjectCatalogError::storage)?;
    Ok(ProjectGroup {
        color: None,
        connection_id: None,
        created_at: now,
        created_from: ProjectGroupCreatedFrom::FolderScan,
        id,
        is_collapsed: false,
        name,
        parent_group_id,
        parent_path: Some(parent_path),
        tab_order,
        updated_at: now,
    })
}

fn basename(path: &str) -> String {
    path.trim_end_matches(['/', '\\'])
        .rsplit(['/', '\\'])
        .next()
        .unwrap_or_default()
        .to_owned()
}

fn nonempty_name(name: &str) -> String {
    let name = name.trim();
    if name.is_empty() {
        "Untitled group".to_owned()
    } else {
        name.to_owned()
    }
}
