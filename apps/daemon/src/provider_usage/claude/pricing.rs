use super::super::pricing_catalog::Catalog;
use super::model::{Tokens, Turn};
use super::model_pricing::resolve;

pub(in crate::provider_usage) fn price(turn: &Turn, catalog: &Catalog) -> (Option<f64>, u64) {
    quote(
        turn.model.as_deref(),
        &turn.timestamp,
        &turn.tokens,
        turn.cache_write_1h_tokens,
        turn.is_vertex,
        catalog,
    )
}

pub(in crate::provider_usage) fn quote(
    model: Option<&str>,
    timestamp: &str,
    tokens: &Tokens,
    cache_write_1h_tokens: u64,
    is_vertex: bool,
    catalog: &Catalog,
) -> (Option<f64>, u64) {
    let total = tokens.total();
    if is_vertex {
        return (None, total);
    }
    let Some(resolution) = resolve(model, timestamp, catalog) else {
        return (None, total);
    };
    let request_input = tokens
        .input_tokens
        .saturating_add(tokens.cache_read_tokens)
        .saturating_add(tokens.cache_write_tokens);
    if request_input > 200_000 && resolution.long_context.is_none() && !resolution.all_context {
        return (None, total);
    }
    let rates = resolution
        .long_context
        .filter(|(threshold, _)| request_input as f64 > *threshold)
        .map_or(resolution.rates, |(_, rates)| rates);
    let one_hour = cache_write_1h_tokens.min(tokens.cache_write_tokens);
    let cost = (tokens.input_tokens as f64 * rates.input
        + tokens.output_tokens as f64 * rates.output
        + tokens.cache_read_tokens as f64 * rates.cache_read
        + (tokens.cache_write_tokens - one_hour) as f64 * rates.cache_write_5m
        + one_hour as f64 * rates.cache_write_1h)
        / 1_000_000.0;
    if cost.is_finite() {
        (Some(cost), 0)
    } else {
        (None, total)
    }
}
