use std::collections::BTreeSet;

use serde_json::{Value, json};

use crate::hosts::{HostFileKind, HostFilesystem};

use super::super::{MAX_DIRECTORY_FILES, MAX_MARKDOWN_BYTES, SKILL_FILE, stable_id};
use super::merge::{content_digest, placement_topology, same_path, summarize};
use super::roots::SourceRoot;

pub(crate) async fn scan_root(
    filesystem: &HostFilesystem,
    root: &SourceRoot,
    canonical_agents_root: Option<&str>,
) -> Vec<Value> {
    let mut stack = vec![(root.path.clone(), 0usize)];
    let mut visited = BTreeSet::new();
    let mut out = Vec::new();
    let root_is_linked = filesystem
        .canonical_directory(&root.path)
        .await
        .ok()
        .is_some_and(|resolved| !same_path(filesystem, &resolved, &root.path));
    let max_depth = if root.kind == "plugin" { 9 } else { 4 };
    while let Some((current, depth)) = stack.pop() {
        let Ok(resolved_current) = filesystem.canonical_directory(&current).await else {
            continue;
        };
        if !visited.insert(resolved_current) {
            continue;
        }
        let Ok(entries) = filesystem.read_dir_raw(&current).await else {
            continue;
        };
        for entry in entries {
            let path = filesystem.paths().join(&[&current, &entry.name]);
            match entry.kind {
                HostFileKind::Directory if depth < max_depth => stack.push((path, depth + 1)),
                HostFileKind::Symlink
                    if depth < max_depth
                        && entry.name != SKILL_FILE
                        && filesystem.canonical_directory(&path).await.is_ok() =>
                {
                    stack.push((path, depth + 1));
                }
                HostFileKind::File | HostFileKind::Symlink if entry.name == SKILL_FILE => {
                    let Some(bytes) = filesystem
                        .read_prefix(&path, MAX_MARKDOWN_BYTES)
                        .await
                        .ok()
                        .flatten()
                    else {
                        continue;
                    };
                    let (name, description) = summarize(&bytes);
                    let directory = filesystem.paths().dirname(&path);
                    let file_count = count_files(filesystem, &directory).await;
                    let updated_at = filesystem
                        .stat(&path)
                        .await
                        .ok()
                        .flatten()
                        .and_then(|stat| stat.modified_at_ms);
                    let source_kind = if root.kind == "home"
                        && filesystem
                            .paths()
                            .relative(&root.path, &path)
                            .split(['/', '\\'])
                            .next()
                            == Some(".system")
                    {
                        "bundled"
                    } else {
                        root.kind
                    };
                    let resolved_directory = filesystem.canonical_directory(&directory).await.ok();
                    let directory_is_linked = filesystem
                        .stat(&directory)
                        .await
                        .ok()
                        .flatten()
                        .is_some_and(|stat| stat.kind == HostFileKind::Symlink);
                    let topology = placement_topology(
                        filesystem,
                        root,
                        resolved_directory.as_deref(),
                        canonical_agents_root,
                        directory_is_linked,
                        root_is_linked,
                    );
                    let source_label = if source_kind == "bundled" {
                        format!("{} bundled", root.label)
                    } else {
                        root.label.clone()
                    };
                    let folder_name = filesystem.paths().basename(&directory);
                    out.push(json!({
                        "id": stable_id(&directory),
                        "name": name.unwrap_or_else(|| folder_name.clone()),
                        "folderName": folder_name,
                        "description": description,
                        "providers": root.providers,
                        "sourceKind": source_kind,
                        "sourceLabel": source_label,
                        "rootPath": root.path,
                        "directoryPath": directory,
                        "skillFilePath": path,
                        "installed": true,
                        "installSource": Value::Null,
                        "fileCount": file_count,
                        "updatedAt": updated_at,
                        "placements": [{
                            "id": stable_id(&directory),
                            "rootId": root.id,
                            "rootPath": root.path,
                            "rootLabel": root.label,
                            "owner": root.owner,
                            "providers": root.providers,
                            "sourceKind": source_kind,
                            "sourceLabel": source_label,
                            "directoryPath": directory,
                            "skillFilePath": path,
                            "linkTargetPath": resolved_directory
                                .filter(|resolved| !same_path(filesystem, resolved, &directory)),
                            "topology": topology,
                            "fileCount": file_count,
                            "updatedAt": updated_at
                        }],
                        "scope": root.scope,
                        "contentDigest": content_digest(&bytes)
                    }));
                }
                _ => {}
            }
        }
    }
    out
}

async fn count_files(filesystem: &HostFilesystem, root: &str) -> usize {
    let mut stack = vec![root.to_owned()];
    let mut visited = BTreeSet::new();
    let mut count = 0;
    while let Some(current) = stack.pop() {
        let Ok(resolved) = filesystem.canonical_directory(&current).await else {
            continue;
        };
        if !visited.insert(resolved) {
            continue;
        }
        let Ok(entries) = filesystem.read_dir_raw(&current).await else {
            continue;
        };
        for entry in entries {
            if count >= MAX_DIRECTORY_FILES {
                return count;
            }
            let path = filesystem.paths().join(&[&current, &entry.name]);
            match entry.kind {
                HostFileKind::Directory => stack.push(path),
                HostFileKind::File => count += 1,
                HostFileKind::Symlink => match filesystem.stat(&path).await.ok().flatten() {
                    Some(stat) if stat.kind == HostFileKind::File => count += 1,
                    Some(stat) if stat.kind == HostFileKind::Directory => stack.push(path),
                    _ => {
                        if filesystem.canonical_directory(&path).await.is_ok() {
                            stack.push(path);
                        } else if filesystem
                            .read_prefix(&path, 1)
                            .await
                            .ok()
                            .flatten()
                            .is_some()
                        {
                            count += 1;
                        }
                    }
                },
                HostFileKind::Other => {}
            }
        }
    }
    count
}
