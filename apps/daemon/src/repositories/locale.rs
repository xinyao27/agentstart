use std::cmp::Ordering;
use std::sync::OnceLock;

use icu_collator::{Collator, CollatorBorrowed, options::CollatorOptions};
use icu_locale_core::Locale;

static REPOSITORY_COLLATOR: OnceLock<Option<CollatorBorrowed<'static>>> = OnceLock::new();

pub(super) fn compare(left: &str, right: &str) -> Ordering {
    REPOSITORY_COLLATOR
        .get_or_init(default_collator)
        .as_ref()
        .map_or_else(|| left.cmp(right), |collator| collator.compare(left, right))
}

fn default_collator() -> Option<CollatorBorrowed<'static>> {
    let locale = sys_locale::get_locale()
        .and_then(|locale| normalize_system_locale(&locale).parse::<Locale>().ok())
        .or_else(|| "en-US".parse::<Locale>().ok())?;
    Collator::try_new((&locale).into(), CollatorOptions::default()).ok()
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
