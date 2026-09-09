use std::collections::HashSet;
use std::path::PathBuf;

use crate::paths::resolve_local_home_path;

pub(super) struct ThemeDirectory {
    pub(super) path: PathBuf,
    pub(super) source_label: String,
}

pub(super) async fn directories() -> Vec<ThemeDirectory> {
    let home = resolve_local_home_path();
    if cfg!(target_os = "macos") {
        let Some(home) = home else {
            return Vec::new();
        };
        return from_root(
            &home,
            &[
                ".warp",
                ".warp-preview",
                ".warp-oss",
                ".warp-dev",
                ".warp-local",
                ".warp-integration",
            ],
            |name| name.starts_with(".warp"),
            |root, name| root.join(name).join("themes"),
        )
        .await;
    }
    if cfg!(target_os = "windows") {
        let Some(base) = std::env::var_os("APPDATA")
            .map(PathBuf::from)
            .filter(|path| path.is_absolute())
            .or(home)
        else {
            return Vec::new();
        };
        let root = base.join("warp");
        return from_root(
            &root,
            &[
                "Warp",
                "WarpPreview",
                "WarpOss",
                "WarpDev",
                "WarpLocal",
                "WarpIntegration",
            ],
            |_| true,
            |root, name| root.join(name).join("data").join("themes"),
        )
        .await;
    }
    if !cfg!(target_os = "linux") {
        return Vec::new();
    }
    let data = std::env::var_os("XDG_DATA_HOME")
        .map(PathBuf::from)
        .filter(|path| path.is_absolute())
        .or_else(|| home.map(|path| path.join(".local").join("share")));
    let Some(data) = data else {
        return Vec::new();
    };
    from_root(
        &data,
        &[
            "warp-terminal",
            "warp-terminal-preview",
            "warp-oss",
            "warp-terminal-dev",
            "warp-terminal-local",
            "warp-terminal-integration",
        ],
        |name| name == "warp-terminal" || name.starts_with("warp-"),
        |root, name| root.join(name).join("themes"),
    )
    .await
}

async fn from_root(
    root: &std::path::Path,
    known: &[&str],
    accepts: impl Fn(&str) -> bool,
    theme_path: impl Fn(&std::path::Path, &str) -> PathBuf,
) -> Vec<ThemeDirectory> {
    let mut names = known
        .iter()
        .map(|name| (*name).to_owned())
        .collect::<Vec<_>>();
    if let Ok(mut entries) = tokio::fs::read_dir(root).await {
        let mut discovered = Vec::new();
        while let Ok(Some(entry)) = entries.next_entry().await {
            let name = entry.file_name().to_string_lossy().into_owned();
            if entry.file_type().await.is_ok_and(|kind| kind.is_dir()) && accepts(&name) {
                discovered.push(name);
            }
        }
        discovered.sort_by_key(|name| name.to_lowercase());
        names.extend(discovered);
    }
    let mut seen = HashSet::new();
    names
        .into_iter()
        .filter_map(|name| {
            let path = theme_path(root, &name);
            seen.insert(path.clone()).then_some(ThemeDirectory {
                path,
                source_label: name,
            })
        })
        .collect()
}
