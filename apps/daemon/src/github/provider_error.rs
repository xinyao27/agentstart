#[derive(Clone, Copy)]
pub(super) enum ProviderErrorKind {
    Auth,
    Network,
    NotFound,
    Permission,
    RateLimited,
    Validation,
    Unknown,
    GhUnavailable,
}

pub(super) fn classify(message: &str) -> ProviderErrorKind {
    let lower = message.to_ascii_lowercase();
    if (lower.contains("no such file") && lower.contains("gh"))
        || lower.contains("gh executable")
        || lower.contains("gh: command not found")
    {
        ProviderErrorKind::GhUnavailable
    } else if lower.contains("rate limit") {
        ProviderErrorKind::RateLimited
    } else if lower.contains("authentication")
        || lower.contains("not logged")
        || lower.contains("gh auth login")
    {
        ProviderErrorKind::Auth
    } else if lower.contains("timeout")
        || lower.contains("network")
        || lower.contains("no such host")
        || lower.contains("could not resolve host")
    {
        ProviderErrorKind::Network
    } else if lower.contains("http 403") || lower.contains("resource not accessible") {
        ProviderErrorKind::Permission
    } else if lower.contains("http 404") || lower.contains("could not resolve to a repository") {
        ProviderErrorKind::NotFound
    } else if lower.contains("http 422") || lower.contains("validation failed") {
        ProviderErrorKind::Validation
    } else {
        ProviderErrorKind::Unknown
    }
}

pub(super) fn stable_message(message: &str) -> String {
    match classify(message) {
        ProviderErrorKind::RateLimited => {
            "GitHub rate limit hit. Try again after the limit resets.".to_owned()
        }
        ProviderErrorKind::Auth => {
            "GitHub authentication is unavailable. Check your gh login.".to_owned()
        }
        ProviderErrorKind::Network => {
            "Network error while contacting GitHub. Check your connection.".to_owned()
        }
        ProviderErrorKind::Permission => {
            "You do not have permission for this GitHub operation. Check your token scopes."
                .to_owned()
        }
        ProviderErrorKind::NotFound => "GitHub resource not found.".to_owned(),
        ProviderErrorKind::Validation => {
            let detail: String = message.trim().chars().take(1_024).collect();
            format!("GitHub rejected the update: {detail}")
        }
        ProviderErrorKind::Unknown => "GitHub operation failed.".to_owned(),
        ProviderErrorKind::GhUnavailable => "GitHub CLI is unavailable.".to_owned(),
    }
}

pub(super) fn refresh_type(kind: ProviderErrorKind) -> &'static str {
    match kind {
        ProviderErrorKind::RateLimited => "rate_limited",
        ProviderErrorKind::Auth => "auth",
        ProviderErrorKind::Network => "network",
        ProviderErrorKind::Permission => "permission",
        ProviderErrorKind::NotFound => "repo_unavailable",
        ProviderErrorKind::Validation | ProviderErrorKind::Unknown => "unknown",
        ProviderErrorKind::GhUnavailable => "gh_unavailable",
    }
}

pub(super) fn refresh_message(kind: ProviderErrorKind) -> &'static str {
    match kind {
        ProviderErrorKind::RateLimited => {
            "GitHub rate limit is low. Try again after the limit resets."
        }
        ProviderErrorKind::Auth => "GitHub authentication is unavailable. Check your gh login.",
        ProviderErrorKind::Network => {
            "GitHub is unreachable right now. Check your network and try again."
        }
        ProviderErrorKind::Permission => "GitHub did not allow access to this pull request.",
        ProviderErrorKind::NotFound => {
            "The GitHub repository is unavailable or cannot be resolved."
        }
        ProviderErrorKind::Validation | ProviderErrorKind::Unknown => {
            "GitHub pull request refresh failed."
        }
        ProviderErrorKind::GhUnavailable => "GitHub CLI is unavailable.",
    }
}
