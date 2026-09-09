use super::super::{ModelUsage, SupplementalDailyUsage, SupplementalUsage};
use crate::ai_vault::model::{AiVaultAgent, AiVaultSession};
use crate::provider_usage::pricing::{UsagePricing, UsageTokens};
use chrono::{DateTime, Local};
use std::{
    collections::BTreeMap,
    path::{Component, Path, PathBuf},
};

#[derive(Default)]
struct Total {
    tokens: u64,
    known: f64,
    has_known: bool,
    unpriced: u64,
}
impl Total {
    fn add(&mut self, tokens: u64, cost: Option<f64>, unpriced: u64) {
        self.tokens = self.tokens.saturating_add(tokens);
        self.unpriced = self.unpriced.saturating_add(unpriced);
        if let Some(cost) = cost {
            self.known += cost;
            self.has_known = true;
        }
    }
    fn value(&self) -> Option<f64> {
        (self.has_known && self.unpriced == 0 && self.known.is_finite()).then_some(self.known)
    }
}
pub(super) fn build(
    sessions: &[AiVaultSession],
    scopes: &[String],
    prices: &UsagePricing,
) -> SupplementalUsage {
    let mut daily = BTreeMap::<String, Total>::new();
    let mut models = BTreeMap::<String, (String, Total)>::new();
    for session in sessions {
        if matches!(
            session.agent,
            AiVaultAgent::Claude
                | AiVaultAgent::Codex
                | AiVaultAgent::Cursor
                | AiVaultAgent::Opencode
        ) || !session
            .cwd
            .as_deref()
            .is_some_and(|cwd| scopes.iter().any(|scope| inside(scope, cwd)))
        {
            continue;
        }
        let usages = session.token_usage.as_deref().unwrap_or_default();
        let days = usages
            .iter()
            .map(|u| u.timestamp.as_deref().and_then(day))
            .collect::<Option<Vec<_>>>();
        if !usages.is_empty()
            && let Some(days) = days
            && usages.iter().any(|u| u.total_tokens > 0)
        {
            for (usage, day) in usages.iter().zip(days) {
                let (cost, unpriced) =
                    if matches!(session.agent, AiVaultAgent::Pi | AiVaultAgent::Omp) {
                        prices.estimate(
                            &usage
                                .provider
                                .as_deref()
                                .unwrap_or_default()
                                .trim()
                                .to_lowercase(),
                            usage.model.as_deref(),
                            usage.timestamp.as_deref(),
                            UsageTokens {
                                input: usage.input_tokens,
                                output: usage.output_tokens,
                                cache_read: usage.cache_read_tokens,
                                cache_write: usage.cache_write_tokens,
                                total: usage.total_tokens,
                            },
                        )
                    } else {
                        (None, usage.total_tokens)
                    };
                daily
                    .entry(day)
                    .or_default()
                    .add(usage.total_tokens, cost, unpriced);
                add_model(
                    &mut models,
                    session.agent,
                    usage.provider.as_deref(),
                    usage.model.as_deref(),
                    usage.total_tokens,
                    cost,
                    unpriced,
                );
            }
        } else {
            let mut total = 0u64;
            for entry in session
                .tokens_by_day
                .as_deref()
                .unwrap_or_default()
                .iter()
                .filter(|e| e.tokens > 0)
            {
                daily
                    .entry(entry.day.clone())
                    .or_default()
                    .add(entry.tokens, None, entry.tokens);
                total = total.saturating_add(entry.tokens);
            }
            if total > 0 {
                add_model(
                    &mut models,
                    session.agent,
                    None,
                    session.model.as_deref(),
                    total,
                    None,
                    total,
                );
            }
        }
    }
    let daily_tokens = daily
        .into_iter()
        .map(|(day, t)| SupplementalDailyUsage {
            day,
            tokens: t.tokens,
            value_usd: t.value(),
            unpriced_tokens: t.unpriced,
        })
        .collect();
    let mut model_usage = models
        .into_iter()
        .map(|(key, (label, t))| ModelUsage {
            key,
            label,
            tokens: t.tokens,
            value_usd: t.value(),
        })
        .collect::<Vec<_>>();
    model_usage.sort_by(|a, b| b.tokens.cmp(&a.tokens).then_with(|| a.key.cmp(&b.key)));
    SupplementalUsage {
        daily_tokens,
        model_usage,
    }
}
fn add_model(
    models: &mut BTreeMap<String, (String, Total)>,
    agent: AiVaultAgent,
    provider: Option<&str>,
    model: Option<&str>,
    tokens: u64,
    cost: Option<f64>,
    unpriced: u64,
) {
    let provider = provider.map(str::trim).filter(|s| !s.is_empty());
    let model = model.map(str::trim).filter(|s| !s.is_empty());
    let key = format!(
        "ai-vault:{}:{}:{}",
        agent.as_str(),
        provider.unwrap_or("unknown").to_lowercase(),
        model.unwrap_or("unknown").to_lowercase()
    );
    let label = [Some(agent.label()), provider, model]
        .into_iter()
        .flatten()
        .collect::<Vec<_>>()
        .join(" · ");
    models
        .entry(key)
        .or_insert_with(|| (label, Total::default()))
        .1
        .add(tokens, cost, unpriced);
}
fn day(timestamp: &str) -> Option<String> {
    DateTime::parse_from_rfc3339(timestamp)
        .ok()
        .map(|d| d.with_timezone(&Local).format("%Y-%m-%d").to_string())
}
fn inside(scope: &str, cwd: &str) -> bool {
    if !cfg!(windows) && (cwd.as_bytes().get(1) == Some(&b':') || cwd.starts_with("\\\\")) {
        return false;
    }
    let normalize = |value: &str| {
        let input = Path::new(value);
        let path = if input.is_absolute() {
            input.to_path_buf()
        } else {
            std::env::current_dir().unwrap_or_default().join(input)
        };
        let mut clean = PathBuf::new();
        for part in path.components() {
            match part {
                Component::CurDir => {}
                Component::ParentDir => {
                    clean.pop();
                }
                other => clean.push(other.as_os_str()),
            }
        }
        if cfg!(windows) {
            PathBuf::from(clean.to_string_lossy().to_lowercase())
        } else {
            clean
        }
    };
    normalize(cwd).starts_with(normalize(scope))
}
