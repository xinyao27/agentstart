use crate::hosts::{HostPaths, HostPlatform};

pub(super) fn contains(
    paths: &HostPaths,
    platform: HostPlatform,
    root: &str,
    target: &str,
) -> bool {
    let root = comparable(paths, platform, root);
    let target = comparable(paths, platform, target);
    if root == target {
        return true;
    }
    if root == "/" {
        return target.starts_with('/');
    }
    let separator = if platform == HostPlatform::Windows {
        '\\'
    } else {
        '/'
    };
    target
        .strip_prefix(&root)
        .is_some_and(|suffix| suffix.starts_with(separator))
}

pub(super) fn equivalent(
    paths: &HostPaths,
    platform: HostPlatform,
    left: &str,
    right: &str,
) -> bool {
    comparable(paths, platform, left) == comparable(paths, platform, right)
}

fn comparable(paths: &HostPaths, platform: HostPlatform, path: &str) -> String {
    let mut value = paths.resolve(".", &[path]);
    while value.len() > 1 && value.ends_with(['/', '\\']) {
        value.pop();
    }
    if platform == HostPlatform::Windows {
        value.make_ascii_lowercase();
    }
    value
}
