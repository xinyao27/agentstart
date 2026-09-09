use std::cmp::Ordering;
use std::sync::OnceLock;

use icu_collator::{Collator, CollatorBorrowed, options::CollatorOptions};
use icu_locale_core::Locale;

use crate::hosts::{HostFilesystem, HostPlatform};

pub(super) const MOBILE_BINARY_EXTENSIONS: &[&str] = &[
    "avif", "bmp", "gif", "heic", "ico", "jpeg", "jpg", "mov", "mp3", "mp4", "pdf", "png", "webp",
    "zip",
];
pub(super) const MOBILE_PREVIEWABLE_IMAGE_EXTENSIONS: &[&str] =
    &["png", "jpg", "jpeg", "gif", "webp", "bmp", "ico"];

static FILE_NAME_COLLATOR: OnceLock<Option<CollatorBorrowed<'static>>> = OnceLock::new();

pub(super) fn locale_compare(left: &str, right: &str) -> Ordering {
    FILE_NAME_COLLATOR
        .get_or_init(default_file_name_collator)
        .as_ref()
        .map_or_else(|| left.cmp(right), |collator| collator.compare(left, right))
}

fn default_file_name_collator() -> Option<CollatorBorrowed<'static>> {
    let locale = sys_locale::get_locale()
        .and_then(|locale| normalize_system_locale(&locale).parse::<Locale>().ok())
        .or_else(|| "en-US".parse::<Locale>().ok())?;
    let preferences = (&locale).into();
    Collator::try_new(preferences, CollatorOptions::default()).ok()
}

fn normalize_system_locale(locale: &str) -> String {
    let normalized = locale
        .split(['.', '@'])
        .next()
        .unwrap_or(locale)
        .replace('_', "-");
    if matches!(normalized.as_str(), "C" | "POSIX") {
        "en-US".to_owned()
    } else {
        normalized
    }
}

pub(super) fn normalize_relative(path: &str, allow_empty: bool) -> Result<String, &'static str> {
    let normalized = path.replace('\\', "/").trim_end_matches('/').to_owned();
    if normalized.is_empty() {
        return allow_empty.then(String::new).ok_or("invalid_relative_path");
    }
    if normalized.starts_with('/')
        || is_windows_absolute(&normalized)
        || normalized
            .split('/')
            .any(|part| matches!(part, "" | "." | ".."))
    {
        return Err("invalid_relative_path");
    }
    Ok(normalized)
}

pub(super) fn resolve_relative(
    filesystem: &HostFilesystem,
    root: &str,
    relative: &str,
    allow_empty: bool,
) -> Result<(String, String), &'static str> {
    let relative = normalize_relative(relative, allow_empty)?;
    let path = if relative.is_empty() {
        root.to_owned()
    } else {
        filesystem.paths().resolve(root, &[&relative])
    };
    Ok((relative, path))
}

pub(super) fn relative_inside(
    filesystem: &HostFilesystem,
    platform: HostPlatform,
    root: &str,
    target: &str,
) -> Option<String> {
    let relative = filesystem.paths().relative(root, target).replace('\\', "/");
    if relative.is_empty() {
        return Some(String::new());
    }
    if relative.starts_with('/')
        || is_windows_absolute(&relative)
        || relative
            .split('/')
            .any(|part| matches!(part, "" | "." | ".."))
    {
        return None;
    }
    if platform == HostPlatform::Windows && target.len() >= 2 && root.len() >= 2 {
        let target_drive = target.as_bytes()[..2].to_ascii_lowercase();
        let root_drive = root.as_bytes()[..2].to_ascii_lowercase();
        if target_drive != root_drive {
            return None;
        }
    }
    Some(relative)
}

pub(super) fn basename(path: &str) -> String {
    path.replace('\\', "/")
        .rsplit('/')
        .next()
        .unwrap_or("")
        .to_owned()
}

pub(super) fn extension(path: &str) -> Option<String> {
    let name = basename(path);
    let (stem, extension) = name.rsplit_once('.')?;
    (!stem.is_empty() && !extension.is_empty()).then(|| extension.to_ascii_lowercase())
}

pub(super) fn is_mobile_binary(path: &str) -> bool {
    extension(path).is_some_and(|value| MOBILE_BINARY_EXTENSIONS.contains(&value.as_str()))
}

pub(super) fn is_mobile_image(path: &str) -> bool {
    extension(path)
        .is_some_and(|value| MOBILE_PREVIEWABLE_IMAGE_EXTENSIONS.contains(&value.as_str()))
}

pub(super) fn is_markdown(path: &str) -> bool {
    extension(path).is_some_and(|value| matches!(value.as_str(), "md" | "mdx" | "markdown"))
}

pub(super) fn preview_mime(path: &str) -> Option<&'static str> {
    match extension(path).as_deref() {
        Some("png") => Some("image/png"),
        Some("jpg" | "jpeg") => Some("image/jpeg"),
        Some("gif") => Some("image/gif"),
        Some("svg") => Some("image/svg+xml"),
        Some("webp") => Some("image/webp"),
        Some("bmp") => Some("image/bmp"),
        Some("ico") => Some("image/x-icon"),
        Some("pdf") => Some("application/pdf"),
        _ => None,
    }
}

pub(super) fn is_binary(bytes: &[u8]) -> bool {
    bytes.iter().take(8_192).any(|byte| *byte == 0)
}

pub(super) fn is_windows_absolute(path: &str) -> bool {
    path.as_bytes().get(0..3).is_some_and(|value| {
        value[0].is_ascii_alphabetic() && value[1] == b':' && matches!(value[2], b'/' | b'\\')
    }) || path.starts_with("\\\\")
        || path.starts_with("//")
}
