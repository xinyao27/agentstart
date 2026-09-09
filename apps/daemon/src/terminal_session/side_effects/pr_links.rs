use regex::Regex;
use serde::Serialize;
use std::collections::{HashSet, VecDeque};
use std::sync::LazyLock;

static SGR: LazyLock<Regex> =
    LazyLock::new(|| Regex::new(r"\x1b\[[0-?]*[ -/]*m").expect("constant SGR pattern"));
const PREFIXES: [&str; 2] = ["https://", "http://"];
const MAX_SEEN: usize = 1_024;

#[derive(Clone, Serialize)]
pub(crate) struct PullRequestLink {
    url: String,
    slug: RepoSlug,
    number: u32,
}

#[derive(Clone, Serialize)]
struct RepoSlug {
    owner: String,
    repo: String,
}

#[derive(Default)]
pub(super) struct PullRequestScanner {
    carry: String,
    seen: HashSet<String>,
    order: VecDeque<String>,
}

impl PullRequestScanner {
    pub(super) fn observe(&mut self, text: &str) -> Vec<PullRequestLink> {
        let raw = format!("{}{text}", self.carry);
        self.carry = potential_carry(&raw);
        if !raw.contains("/pull/") {
            return Vec::new();
        }
        let combined = SGR
            .replace_all(&raw, "")
            .replace(['\u{8}', '\u{b}', '\u{c}'], "\u{fffd}");
        let mut links = Vec::new();
        let mut remaining = combined.as_str();
        while let Some(start) = PREFIXES
            .iter()
            .filter_map(|prefix| remaining.find(prefix))
            .min()
        {
            let candidate = &remaining[start..];
            let Some(end) = candidate
                .find(|character: char| character.is_whitespace() || "\"'<>".contains(character))
            else {
                break;
            };
            let raw_url = &candidate[..end];
            remaining = &candidate[end..];
            if raw_url.len() > 2_048 || raw_url.contains(['\u{1b}', '\u{fffd}']) {
                continue;
            }
            let url = raw_url.trim_end_matches([')', ',', '.', ';', ']', '}']);
            let Some(link) = parse_link(url) else {
                continue;
            };
            if !self.seen.insert(url.to_owned()) {
                continue;
            }
            self.order.push_back(url.to_owned());
            if self.order.len() > MAX_SEEN
                && let Some(old) = self.order.pop_front()
            {
                self.seen.remove(&old);
            }
            links.push(link);
        }
        links
    }
}

fn potential_carry(value: &str) -> String {
    if let Some(start) = PREFIXES
        .iter()
        .filter_map(|prefix| value.rfind(prefix))
        .max()
    {
        let tail = &value[start..];
        if tail.len() <= 512 && !tail.chars().any(char::is_whitespace) {
            return tail.to_owned();
        }
        return String::new();
    }
    for prefix in PREFIXES {
        for length in (1..prefix.len()).rev() {
            if value.ends_with(&prefix[..length]) {
                return prefix[..length].to_owned();
            }
        }
    }
    String::new()
}

fn parse_link(value: &str) -> Option<PullRequestLink> {
    let url = url::Url::parse(value).ok()?;
    if !matches!(url.scheme(), "http" | "https") {
        return None;
    }
    let parts: Vec<_> = url.path().trim_end_matches('/').split('/').collect();
    if parts.len() < 5
        || parts[1].is_empty()
        || parts[2].is_empty()
        || !parts[3].eq_ignore_ascii_case("pull")
        || !parts[4].bytes().all(|byte| byte.is_ascii_digit())
    {
        return None;
    }
    let number = parts[4].parse::<u32>().ok().filter(|number| *number > 0)?;
    Some(PullRequestLink {
        url: value.to_owned(),
        slug: RepoSlug {
            owner: parts[1].to_owned(),
            repo: parts[2].to_owned(),
        },
        number,
    })
}
