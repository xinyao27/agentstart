use std::collections::HashSet;

use serde_json::Value;

use crate::hosts::HostFilesystemError;

use super::setup_imports::{RepoFiles, candidate, parse_json_object};

pub(super) async fn inspect(files: &RepoFiles<'_>) -> Result<Option<Value>, HostFilesystemError> {
    let Some(package_json) = parse_json_object(files.read("package.json").await?) else {
        return Ok(None);
    };
    let declared = package_json
        .get("packageManager")
        .and_then(Value::as_str)
        .map(super::ecmascript::trim)
        .map(str::to_ascii_lowercase);
    let setup = declared.as_deref().and_then(|value| {
        [
            ("pnpm@", "pnpm install"),
            ("bun@", "bun install"),
            ("yarn@", "yarn install"),
            ("npm@", "npm install"),
        ]
        .into_iter()
        .find_map(|(prefix, setup)| value.starts_with(prefix).then_some(setup))
    });
    if let Some(setup) = setup {
        return Ok(Some(candidate(
            "package-manager",
            "package manager",
            vec!["package.json"],
            setup.to_owned(),
            None,
            Vec::new(),
        )));
    }
    let mut locks = Vec::new();
    for (path, manager, setup) in [
        ("pnpm-lock.yaml", "pnpm", "pnpm install"),
        ("bun.lock", "bun", "bun install"),
        ("bun.lockb", "bun", "bun install"),
        ("yarn.lock", "yarn", "yarn install"),
        ("package-lock.json", "npm", "npm install"),
        ("npm-shrinkwrap.json", "npm", "npm install"),
    ] {
        if files.exists(path).await? {
            locks.push((path, manager, setup));
        }
    }
    let managers = locks
        .iter()
        .map(|(_, manager, _)| *manager)
        .collect::<HashSet<_>>();
    if managers.len() > 1 {
        return Ok(None);
    }
    let (candidate_files, setup) = locks.first().map_or_else(
        || (vec!["package.json"], "npm install"),
        |(path, _, setup)| (vec![*path], *setup),
    );
    Ok(Some(candidate(
        "package-manager",
        "package manager",
        candidate_files,
        setup.to_owned(),
        None,
        Vec::new(),
    )))
}
