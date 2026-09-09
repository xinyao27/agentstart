use chrono::DateTime;

use super::super::pricing_catalog::{Catalog, Pricing};

#[derive(Clone, Copy)]
pub(super) struct Rates {
    pub input: f64,
    pub output: f64,
    pub cache_read: f64,
    pub cache_write_5m: f64,
    pub cache_write_1h: f64,
}

pub(super) struct Resolution {
    pub rates: Rates,
    pub long_context: Option<(f64, Rates)>,
    pub all_context: bool,
}

pub(super) fn resolve(
    model: Option<&str>,
    timestamp: &str,
    catalog: &Catalog,
) -> Option<Resolution> {
    let model = model?;
    let normalized = normalize(model);
    if normalized.as_deref() == Some("claude-sonnet-5") {
        let day = timestamp.get(..10)?;
        chrono::NaiveDate::parse_from_str(day, "%Y-%m-%d").ok()?;
        return Some(base(if day < "2026-09-01" { 2.0 } else { 3.0 }, true));
    }
    let historic = DateTime::parse_from_rfc3339(timestamp)
        .ok()
        .is_some_and(|date| date.timestamp_millis() < 1_773_360_000_000);
    if historic
        && matches!(
            normalized.as_deref(),
            Some("claude-opus-4-6" | "claude-sonnet-4-6")
        )
    {
        return Some(long(if normalized.as_deref() == Some("claude-opus-4-6") {
            5.0
        } else {
            3.0
        }));
    }
    if let Some(pricing) = catalog.find(model) {
        return Some(from_catalog(pricing));
    }
    match normalized.as_deref()? {
        "claude-fable-5" | "claude-mythos-5" => Some(base(10.0, true)),
        "claude-opus-4-8" | "claude-opus-4-7" | "claude-opus-4-6" => Some(base(5.0, true)),
        "claude-opus-4-5" => Some(base(5.0, false)),
        "claude-opus-4-1" | "claude-opus-4" => Some(base(15.0, false)),
        "claude-sonnet-4-6" => Some(base(3.0, true)),
        "claude-sonnet-4-5" | "claude-sonnet-4-20250514" => Some(long(3.0)),
        "claude-sonnet-4" | "claude-sonnet-3-7" | "claude-sonnet-3-5" => Some(base(3.0, false)),
        "claude-haiku-4-5" => Some(base(1.0, false)),
        "claude-haiku-3-5" => Some(base(0.8, false)),
        _ => None,
    }
}

fn base(input: f64, all_context: bool) -> Resolution {
    Resolution {
        rates: Rates {
            input,
            output: input * 5.0,
            cache_read: input / 10.0,
            cache_write_5m: input * 1.25,
            cache_write_1h: input * 2.0,
        },
        long_context: None,
        all_context,
    }
}
fn long(input: f64) -> Resolution {
    let mut value = base(input, true);
    value.long_context = Some((
        200_000.0,
        Rates {
            input: input * 2.0,
            output: input * 7.5,
            cache_read: input / 5.0,
            cache_write_5m: input * 2.5,
            cache_write_1h: input * 4.0,
        },
    ));
    value
}
fn from_catalog(value: &Pricing) -> Resolution {
    let input = value.input;
    let cache_read = nonnegative(value.cache_read).unwrap_or(input);
    let cache_write_5m = nonnegative(value.cache_write).unwrap_or(input);
    Resolution {
        rates: Rates {
            input,
            output: value.output,
            cache_read,
            cache_write_5m,
            cache_write_1h: input * 2.0,
        },
        all_context: true,
        long_context: nonnegative(value.threshold_tokens)
            .filter(|value| *value > 0.0)
            .map(|threshold| {
                (
                    threshold,
                    Rates {
                        input: nonnegative(value.input_above_threshold).unwrap_or(input),
                        output: nonnegative(value.output_above_threshold).unwrap_or(value.output),
                        cache_read: nonnegative(value.cache_read_above_threshold)
                            .unwrap_or(cache_read),
                        cache_write_5m: nonnegative(value.cache_write_above_threshold)
                            .unwrap_or(cache_write_5m),
                        cache_write_1h: nonnegative(value.input_above_threshold).unwrap_or(input)
                            * 2.0,
                    },
                )
            }),
    }
}
fn nonnegative(value: Option<f64>) -> Option<f64> {
    value.filter(|value| value.is_finite() && *value >= 0.0)
}

fn normalize(model: &str) -> Option<String> {
    let model = model.trim().to_lowercase();
    let model = model
        .strip_prefix("anthropic/")
        .or_else(|| model.strip_prefix("anthropic:"))
        .unwrap_or(&model);
    if model == "claude-sonnet-4-20250514" {
        return Some(model.to_owned());
    }
    let model = model.replace('.', "-");
    for (family, versions) in [
        ("fable", &["5"][..]),
        ("mythos", &["5"][..]),
        ("opus", &["4-8", "4-7", "4-6", "4-5", "4-1", "4"][..]),
        ("sonnet", &["5", "4-6", "4-5", "4"][..]),
    ] {
        for version in versions {
            let needle = format!("{family}-{version}");
            if model
                .rfind(&needle)
                .is_some_and(|position| valid_suffix(&model[position + needle.len()..]))
            {
                return Some(format!("claude-{needle}"));
            }
        }
    }
    for (needles, canonical) in [
        (&["sonnet-3-7"][..], "claude-sonnet-3-7"),
        (&["sonnet-3-5", "3-5-sonnet"][..], "claude-sonnet-3-5"),
        (&["haiku-4-5"][..], "claude-haiku-4-5"),
        (&["haiku-3-5", "3-5-haiku"][..], "claude-haiku-3-5"),
    ] {
        if needles.iter().any(|needle| model.contains(needle)) {
            return Some(canonical.to_owned());
        }
    }
    None
}
fn valid_suffix(suffix: &str) -> bool {
    if suffix.is_empty() || suffix == "-thinking" {
        return true;
    }
    let suffix = suffix.strip_suffix("-thinking").unwrap_or(suffix);
    let Some(date) = suffix
        .strip_prefix('-')
        .or_else(|| suffix.strip_prefix('@'))
    else {
        return false;
    };
    date.len() == 8 && date.starts_with("20") && date.bytes().all(|byte| byte.is_ascii_digit())
}
