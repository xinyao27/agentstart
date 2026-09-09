use std::collections::{HashMap, HashSet};

#[derive(Clone, Debug)]
pub(super) struct FolderScope {
    pub(super) folder_path: String,
    pub(super) name: String,
    pub(super) parent_relative_path: Option<String>,
    pub(super) relative_path: String,
}

pub(super) fn build(parent_path: &str, repo_paths: &[String]) -> Vec<FolderScope> {
    let mut stats: HashMap<String, FolderStats> = HashMap::new();
    for repo_path in repo_paths {
        let Some(folder) = folder_relative_path(parent_path, repo_path) else {
            continue;
        };
        note(&mut stats, &folder, true);
        let segments = segments(&folder);
        for length in 1..=segments.len() {
            note(&mut stats, &segments[..length].join("/"), false);
        }
    }
    let mut meaningful = stats
        .into_iter()
        .filter(|(path, stats)| {
            !path.is_empty()
                && (stats.direct >= 2 || stats.direct > 0 && stats.total > stats.direct)
        })
        .map(|(path, _)| path)
        .collect::<Vec<_>>();
    meaningful.sort_unstable_by(|left, right| {
        segments(left)
            .len()
            .cmp(&segments(right).len())
            .then_with(|| left.cmp(right))
    });
    let meaningful_set = meaningful.iter().cloned().collect::<HashSet<_>>();
    meaningful
        .into_iter()
        .map(|relative_path| {
            let parent = segments(&relative_path);
            let parent_relative_path = nearest(
                &parent[..parent.len().saturating_sub(1)].join("/"),
                &meaningful_set,
            );
            FolderScope {
                folder_path: resolve(parent_path, &relative_path),
                name: relative_path.clone(),
                parent_relative_path,
                relative_path,
            }
        })
        .collect()
}

pub(super) fn nearest_for_repo(
    parent_path: &str,
    repo_path: &str,
    scopes: &HashSet<String>,
) -> Option<String> {
    folder_relative_path(parent_path, repo_path).and_then(|path| nearest(&path, scopes))
}

fn folder_relative_path(parent_path: &str, repo_path: &str) -> Option<String> {
    let parent = normalize(parent_path);
    let repo = normalize(repo_path);
    let comparison_parent = comparison(&parent);
    let comparison_repo = comparison(&repo);
    let relative = if comparison_repo == comparison_parent {
        ""
    } else {
        let prefix = format!("{comparison_parent}/");
        let offset = comparison_repo.strip_prefix(&prefix)?.len();
        &repo[repo.len().saturating_sub(offset)..]
    };
    let mut segments = segments(relative);
    segments.pop();
    (!segments.is_empty()).then(|| segments.join("/"))
}

fn nearest(relative_path: &str, scopes: &HashSet<String>) -> Option<String> {
    let segments = segments(relative_path);
    (1..=segments.len()).rev().find_map(|length| {
        let candidate = segments[..length].join("/");
        scopes.contains(&candidate).then_some(candidate)
    })
}

fn resolve(parent_path: &str, relative_path: &str) -> String {
    let separator = if parent_path.contains('\\') && !parent_path.contains('/') {
        '\\'
    } else {
        '/'
    };
    let mut parent = parent_path.trim_end_matches(['/', '\\']).to_owned();
    if parent.is_empty() || !parent.ends_with(separator) {
        parent.push(separator);
    }
    parent.push_str(&relative_path.replace('/', &separator.to_string()));
    parent
}

fn normalize(path: &str) -> String {
    let replaced = path.replace('\\', "/");
    if replaced == "/" || is_drive_root(&replaced) {
        replaced
    } else {
        replaced.trim_end_matches('/').to_owned()
    }
}

fn comparison(path: &str) -> String {
    if cfg!(windows) {
        path.to_lowercase()
    } else {
        path.to_owned()
    }
}

fn segments(path: &str) -> Vec<&str> {
    path.trim_matches('/')
        .split('/')
        .filter(|part| !part.is_empty())
        .collect()
}

fn is_drive_root(path: &str) -> bool {
    let bytes = path.as_bytes();
    bytes.len() == 3 && bytes[0].is_ascii_alphabetic() && bytes[1] == b':' && bytes[2] == b'/'
}

#[derive(Default)]
struct FolderStats {
    direct: usize,
    total: usize,
}

fn note(stats: &mut HashMap<String, FolderStats>, path: &str, direct: bool) {
    let entry = stats.entry(path.to_owned()).or_default();
    if direct {
        entry.direct += 1;
    } else {
        entry.total += 1;
    }
}
