use std::collections::HashSet;
use std::sync::{Arc, OnceLock};

use base64::Engine as _;
use base64::engine::general_purpose::STANDARD;
use regex::Regex;
use serde_json::{Value, json};

use crate::hosts::{ExecutionHost, HostFileKind, HostFilesystem};
use crate::projects::{GitRemoteIdentity, ProjectKind};

use super::detection::{GitHubSlug, github_slug};

const ICON_FILES: &[&str] = &[
    "favicon.png",
    "public/favicon.png",
    "app/favicon.png",
    "app/icon.png",
    "src/favicon.png",
    "src/app/icon.png",
    "assets/favicon.png",
    "assets/icon.png",
    "static/favicon.png",
    "logo.png",
    "public/logo.png",
];
const ICON_SOURCES: &[&str] = &[
    "index.html",
    "public/index.html",
    "app/routes/__root.tsx",
    "src/routes/__root.tsx",
    "app/root.tsx",
    "src/root.tsx",
    "src/index.html",
];
const MAX_ICON_BYTES: usize = 256 * 1024;
const MAX_PACKAGE_BYTES: usize = 128 * 1024;

pub(super) async fn detect(
    host: Arc<dyn ExecutionHost>,
    path: &str,
    kind: ProjectKind,
    upstream: Option<&GitHubSlug>,
    remotes: &[GitRemoteIdentity],
) -> Option<Value> {
    let filesystem = HostFilesystem::new(host);
    if let Some(icon) = local_png(&filesystem, path).await {
        return Some(icon);
    }
    if let Some(icon) = package_homepage(&filesystem, path).await {
        return Some(icon);
    }
    if kind != ProjectKind::Git {
        return None;
    }
    let slug = upstream.cloned().or_else(|| {
        remotes
            .iter()
            .find(|remote| remote.remote_name == "origin")
            .and_then(github_slug)
    })?;
    Some(json!({
        "type":"image",
        "src":format!("https://github.com/{}.png?size=64", encode_component(&slug.owner)),
        "source":"github",
        "label":format!("{}/{}", slug.owner, slug.repo),
    }))
}

async fn local_png(filesystem: &HostFilesystem, root: &str) -> Option<Value> {
    for relative in ICON_FILES {
        if let Some(icon) = read_png(filesystem, root, relative).await {
            return Some(icon);
        }
    }
    for source in ICON_SOURCES {
        let path = filesystem.paths().join(&[root, source]);
        let Ok(Some(content)) = filesystem.read_text(&path, MAX_ICON_BYTES).await else {
            continue;
        };
        let Some(href) = icon_href(&content) else {
            continue;
        };
        for relative in href_candidates(href, source) {
            if let Some(icon) = read_png(filesystem, root, &relative).await {
                return Some(icon);
            }
        }
    }
    None
}

async fn read_png(filesystem: &HostFilesystem, root: &str, relative: &str) -> Option<Value> {
    let path = filesystem.paths().join(&[root, relative]);
    let stat = filesystem.stat(&path).await.ok()??;
    if stat.kind != HostFileKind::File || usize::try_from(stat.size_bytes).ok()? > MAX_ICON_BYTES {
        return None;
    }
    let content = filesystem.read(&path, MAX_ICON_BYTES).await.ok()??;
    if !content.starts_with(&[0x89, b'P', b'N', b'G', 0x0d, 0x0a, 0x1a, 0x0a]) {
        return None;
    }
    Some(json!({
        "type":"image",
        "src":format!("data:image/png;base64,{}", STANDARD.encode(content)),
        "source":"file",
        "label":relative,
    }))
}

async fn package_homepage(filesystem: &HostFilesystem, root: &str) -> Option<Value> {
    let path = filesystem.paths().join(&[root, "package.json"]);
    let content = filesystem
        .read_text(&path, MAX_PACKAGE_BYTES)
        .await
        .ok()??;
    let package = serde_json::from_str::<Value>(&content).ok()?;
    let homepage = package.get("homepage")?.as_str()?;
    let raw = if homepage.contains("://") {
        homepage.to_owned()
    } else {
        format!("https://{homepage}")
    };
    let url = url::Url::parse(&raw).ok()?;
    if !matches!(url.scheme(), "http" | "https") {
        return None;
    }
    let hostname = url.host_str()?.to_ascii_lowercase();
    if matches!(
        hostname.as_str(),
        "github.com"
            | "www.github.com"
            | "gitlab.com"
            | "www.gitlab.com"
            | "bitbucket.org"
            | "www.bitbucket.org"
    ) {
        return None;
    }
    let mut favicon = url::Url::parse("https://www.google.com/s2/favicons").ok()?;
    favicon
        .query_pairs_mut()
        .append_pair("domain", &hostname)
        .append_pair("sz", "64");
    Some(json!({
        "type":"image", "src":favicon.as_str(), "source":"favicon",
        "label":"Website favicon",
    }))
}

fn icon_href(source: &str) -> Option<&str> {
    let tags = tag_pattern()?.find_iter(source).map(|found| found.as_str());
    for tag in tags {
        if !rel_pattern()?.is_match(tag) {
            continue;
        }
        if let Some(captures) = href_pattern()?.captures(tag)
            && let Some(href) = captures.get(1)
        {
            return Some(href.as_str());
        }
    }
    None
}

fn href_candidates(href: &str, source: &str) -> Vec<String> {
    let href = super::ecmascript::trim(href);
    if href.is_empty()
        || href.starts_with("//")
        || scheme_pattern().is_some_and(|pattern| pattern.is_match(href))
    {
        return Vec::new();
    }
    let root_relative = href.starts_with('/');
    let path = href
        .split(['?', '#'])
        .next()
        .unwrap_or_default()
        .trim_start_matches('/')
        .replace('\\', "/");
    let parts = path
        .split('/')
        .filter(|part| !part.is_empty() && *part != ".")
        .collect::<Vec<_>>();
    if parts.is_empty() || parts.contains(&"..") {
        return Vec::new();
    }
    let path = parts.join("/");
    let mut candidates = Vec::new();
    if !root_relative && let Some((directory, _)) = source.rsplit_once('/') {
        candidates.push(format!("{directory}/{path}"));
    }
    candidates.push(format!("public/{path}"));
    candidates.push(path);
    let mut seen = HashSet::new();
    candidates
        .into_iter()
        .filter(|candidate| seen.insert(candidate.clone()))
        .collect()
}

fn encode_component(value: &str) -> String {
    url::form_urlencoded::byte_serialize(value.as_bytes()).collect()
}

fn tag_pattern() -> Option<&'static Regex> {
    static PATTERN: OnceLock<Option<Regex>> = OnceLock::new();
    PATTERN
        .get_or_init(|| Regex::new(r"(?is)<link\b[^>]*>|\{[^}]*\}").ok())
        .as_ref()
}

fn rel_pattern() -> Option<&'static Regex> {
    static PATTERN: OnceLock<Option<Regex>> = OnceLock::new();
    PATTERN
        .get_or_init(|| Regex::new(r#"(?i)\brel\s*(?:=|:)\s*["'](?:icon|shortcut icon)["']"#).ok())
        .as_ref()
}

fn href_pattern() -> Option<&'static Regex> {
    static PATTERN: OnceLock<Option<Regex>> = OnceLock::new();
    PATTERN
        .get_or_init(|| Regex::new(r#"(?i)\bhref\s*(?:=|:)\s*["']([^"'?]+)["']"#).ok())
        .as_ref()
}

fn scheme_pattern() -> Option<&'static Regex> {
    static PATTERN: OnceLock<Option<Regex>> = OnceLock::new();
    PATTERN
        .get_or_init(|| Regex::new(r"^[A-Za-z][A-Za-z0-9+.-]*:").ok())
        .as_ref()
}
