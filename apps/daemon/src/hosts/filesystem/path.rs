use std::path::{Component, Path, PathBuf};

use crate::hosts::{HostKind, HostPlatform};

#[derive(Clone, Copy)]
enum PathStyle {
    Native,
    Posix,
}

#[derive(Clone, Copy)]
pub struct HostPaths {
    style: PathStyle,
}

impl HostPaths {
    pub(super) fn for_host(kind: HostKind, platform: HostPlatform) -> Self {
        Self {
            style: if kind == HostKind::Local && platform == HostPlatform::Windows {
                PathStyle::Native
            } else {
                PathStyle::Posix
            },
        }
    }

    pub fn basename(&self, path: &str) -> String {
        match self.style {
            PathStyle::Native => Path::new(path)
                .file_name()
                .map(|name| name.to_string_lossy().into_owned())
                .unwrap_or_else(|| {
                    if matches!(path, "." | "..") {
                        path.to_owned()
                    } else {
                        String::new()
                    }
                }),
            PathStyle::Posix => posix_basename(path).to_owned(),
        }
    }

    pub fn dirname(&self, path: &str) -> String {
        match self.style {
            PathStyle::Native => Path::new(path)
                .parent()
                .map(|parent| parent.to_string_lossy().into_owned())
                .filter(|parent| !parent.is_empty())
                .unwrap_or_else(|| {
                    if Path::new(path).has_root() {
                        normalize_native(PathBuf::from(path))
                    } else {
                        ".".to_owned()
                    }
                }),
            PathStyle::Posix => posix_dirname(path),
        }
    }

    pub fn is_absolute(&self, path: &str) -> bool {
        match self.style {
            PathStyle::Native => Path::new(path).is_absolute(),
            PathStyle::Posix => path.starts_with('/'),
        }
    }

    pub fn equal(&self, left: &str, right: &str) -> bool {
        match self.style {
            PathStyle::Native => normalize_native(PathBuf::from(left))
                .eq_ignore_ascii_case(&normalize_native(PathBuf::from(right))),
            PathStyle::Posix => normalize_posix(left) == normalize_posix(right),
        }
    }

    pub fn join(&self, parts: &[&str]) -> String {
        match self.style {
            PathStyle::Native => {
                let separator = std::path::MAIN_SEPARATOR.to_string();
                normalize_native(PathBuf::from(parts.join(&separator)))
            }
            PathStyle::Posix => normalize_posix(&parts.join("/")),
        }
    }

    pub fn relative(&self, from: &str, to: &str) -> String {
        match self.style {
            PathStyle::Native => relative_native(from, to),
            PathStyle::Posix => relative_posix(from, to),
        }
    }

    pub fn resolve(&self, base: &str, parts: &[&str]) -> String {
        match self.style {
            PathStyle::Native => {
                let path = parts.iter().fold(PathBuf::from(base), |mut path, part| {
                    if Path::new(part).is_absolute() {
                        path = PathBuf::from(part);
                    } else {
                        path.push(part);
                    }
                    path
                });
                normalize_native(path)
            }
            PathStyle::Posix => {
                let mut path = base.to_owned();
                for part in parts {
                    if part.starts_with('/') {
                        path.clear();
                    } else if !path.ends_with('/') {
                        path.push('/');
                    }
                    path.push_str(part);
                }
                normalize_posix(&path)
            }
        }
    }

    pub(super) fn is_unsafe_removal(&self, path: &str) -> bool {
        match self.style {
            PathStyle::Native => {
                let normalized = PathBuf::from(normalize_native(PathBuf::from(path.trim())));
                normalized.has_root() && normalized.parent().is_none()
                    || normalized.components().all(|component| {
                        matches!(component, Component::CurDir | Component::ParentDir)
                    })
            }
            PathStyle::Posix => {
                let normalized = normalize_posix(path.trim());
                normalized == "/"
                    || normalized
                        .split('/')
                        .all(|component| matches!(component, "." | ".."))
            }
        }
    }
}

fn normalize_native(path: PathBuf) -> String {
    let mut normalized = PathBuf::new();
    for component in path.components() {
        match component {
            Component::CurDir => {}
            Component::ParentDir => {
                let can_pop = normalized
                    .file_name()
                    .is_some_and(|name| name != std::ffi::OsStr::new(".."));
                if can_pop {
                    normalized.pop();
                } else if !normalized.has_root() {
                    normalized.push(component.as_os_str());
                }
            }
            _ => normalized.push(component.as_os_str()),
        }
    }
    if normalized.as_os_str().is_empty() {
        ".".to_owned()
    } else {
        normalized.to_string_lossy().into_owned()
    }
}

fn relative_native(from: &str, to: &str) -> String {
    let from_path = PathBuf::from(normalize_native(PathBuf::from(from)));
    let to_path = PathBuf::from(normalize_native(PathBuf::from(to)));
    let from = from_path.components().collect::<Vec<_>>();
    let to = to_path.components().collect::<Vec<_>>();
    let common = from
        .iter()
        .zip(&to)
        .take_while(|(left, right)| left == right)
        .count();
    if common == 0 && (from_path.is_absolute() || to_path.is_absolute()) {
        return to_path.to_string_lossy().into_owned();
    }
    let mut result = PathBuf::new();
    for _ in common..from.len() {
        result.push("..");
    }
    for component in &to[common..] {
        result.push(component.as_os_str());
    }
    result.to_string_lossy().into_owned()
}

fn normalize_posix(path: &str) -> String {
    let is_absolute = path.starts_with('/');
    let mut components = Vec::new();
    for component in path.split('/') {
        match component {
            "" | "." => {}
            ".." if components.last().is_some_and(|value| *value != "..") => {
                components.pop();
            }
            ".." if !is_absolute => components.push(component),
            ".." => {}
            value => components.push(value),
        }
    }
    let result = components.join("/");
    if is_absolute {
        format!("/{result}")
    } else if result.is_empty() {
        ".".to_owned()
    } else {
        result
    }
}

fn posix_basename(path: &str) -> &str {
    path.trim_end_matches('/').rsplit('/').next().unwrap_or("")
}

fn posix_dirname(path: &str) -> String {
    if path.is_empty() {
        return ".".to_owned();
    }
    let has_root = path.starts_with('/');
    let mut end = None;
    let mut matched_slash = true;
    for (offset, byte) in path.bytes().enumerate().skip(1).rev() {
        if byte == b'/' {
            if !matched_slash {
                end = Some(offset);
                break;
            }
        } else {
            matched_slash = false;
        }
    }
    let Some(end) = end else {
        return if has_root { "/" } else { "." }.to_owned();
    };
    if has_root && end == 1 {
        "//".to_owned()
    } else {
        path[..end].to_owned()
    }
}

fn relative_posix(from: &str, to: &str) -> String {
    let from = normalize_posix(from);
    let to = normalize_posix(to);
    if from.starts_with('/') != to.starts_with('/') {
        return to;
    }
    let from = from
        .trim_start_matches('/')
        .split('/')
        .filter(|value| *value != ".")
        .collect::<Vec<_>>();
    let to = to
        .trim_start_matches('/')
        .split('/')
        .filter(|value| *value != ".")
        .collect::<Vec<_>>();
    let common = from
        .iter()
        .zip(&to)
        .take_while(|(left, right)| left == right)
        .count();
    std::iter::repeat_n("..", from.len() - common)
        .chain(to[common..].iter().copied())
        .collect::<Vec<_>>()
        .join("/")
}
