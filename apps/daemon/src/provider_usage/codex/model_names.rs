const TIERS: [&str; 7] = ["minimal", "low", "medium", "high", "xhigh", "auto", "none"];
pub(super) fn normalize(model: &str) -> Option<String> {
    let lower = model.trim().to_lowercase();
    let mut model = lower.as_str();
    for prefix in ["openai/", "openai:", "openai-codex/", "openai-codex:"] {
        if let Some(value) = model.strip_prefix(prefix) {
            model = value;
            break;
        }
    }
    if model.ends_with(')') {
        let (base, tier) = model.rsplit_once('(')?;
        if !TIERS.contains(&tier.trim_end_matches(')').trim()) {
            return None;
        }
        model = base;
    }
    for _ in 0..4 {
        if let Some((base, tier)) = model.rsplit_once('-')
            && TIERS.contains(&tier)
        {
            model = base;
        } else {
            break;
        }
    }
    if matches!(model, "gpt-5" | "gpt-5-codex") {
        return Some("gpt-5".into());
    }
    if model == "gpt-5.6" || snapshot(model, "gpt-5.6-sol") {
        return Some("gpt-5.6-sol".into());
    }
    if model == "gpt-5.3-codex-spark" || model.starts_with("gpt-5.3-codex-spark-") {
        return Some("gpt-5.3-codex-spark".into());
    }
    [
        "gpt-5-pro",
        "gpt-5-mini",
        "gpt-5-nano",
        "gpt-5.1-codex-max",
        "gpt-5.1-codex",
        "gpt-5.1-codex-mini",
        "gpt-5.1",
        "gpt-5.2-codex",
        "gpt-5.2-pro",
        "gpt-5.2",
        "gpt-5.3-codex",
        "gpt-5.4-mini",
        "gpt-5.4-nano",
        "gpt-5.4-pro",
        "gpt-5.4",
        "gpt-5.5-pro",
        "gpt-5.5",
        "gpt-5.6-terra",
        "gpt-5.6-luna",
    ]
    .into_iter()
    .find(|key| snapshot(model, key))
    .map(str::to_owned)
}
fn snapshot(model: &str, key: &str) -> bool {
    model == key
        || model
            .strip_prefix(key)
            .and_then(|s| s.strip_prefix('-'))
            .is_some_and(|date| {
                date.len() == 10
                    && date.starts_with("20")
                    && date.bytes().enumerate().all(|(i, b)| {
                        if i == 4 || i == 7 {
                            b == b'-'
                        } else {
                            b.is_ascii_digit()
                        }
                    })
            })
}
