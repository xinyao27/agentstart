use super::{claude, codex, pricing_catalog::Catalog};

pub(crate) struct UsageTokens {
    pub input: u64,
    pub output: u64,
    pub cache_read: u64,
    pub cache_write: u64,
    pub total: u64,
}
pub(crate) struct UsagePricing {
    anthropic: Catalog,
    openai: Catalog,
}
impl UsagePricing {
    pub(crate) fn load() -> Self {
        Self {
            anthropic: Catalog::load(),
            openai: Catalog::load_for("openai"),
        }
    }
    pub(crate) fn estimate(
        &self,
        provider: &str,
        model: Option<&str>,
        timestamp: Option<&str>,
        tokens: UsageTokens,
    ) -> (Option<f64>, u64) {
        let category = tokens
            .input
            .saturating_add(tokens.output)
            .saturating_add(tokens.cache_read)
            .saturating_add(tokens.cache_write);
        let residual = tokens.total.saturating_sub(category);
        match provider {
            "anthropic" => {
                let categories = claude::model::Tokens {
                    input_tokens: tokens.input,
                    output_tokens: tokens.output,
                    cache_read_tokens: tokens.cache_read,
                    cache_write_tokens: tokens.cache_write,
                };
                let (cost, unpriced) = claude::pricing::quote(
                    model,
                    timestamp.unwrap_or_default(),
                    &categories,
                    0,
                    false,
                    &self.anthropic,
                );
                (cost, unpriced.saturating_add(residual))
            }
            "openai-codex" => {
                let cost = codex::pricing::price(
                    model,
                    codex::token_delta::Tokens {
                        input_tokens: tokens
                            .input
                            .saturating_add(tokens.cache_read)
                            .saturating_add(tokens.cache_write),
                        cached_input_tokens: tokens.cache_read,
                        cache_write_tokens: tokens.cache_write,
                        output_tokens: tokens.output,
                        reasoning_output_tokens: 0,
                        total_tokens: tokens.total,
                    },
                    false,
                    None,
                    &self.openai,
                );
                (
                    cost,
                    if cost.is_none() {
                        tokens.total
                    } else {
                        residual
                    },
                )
            }
            _ => (None, tokens.total),
        }
    }
}
