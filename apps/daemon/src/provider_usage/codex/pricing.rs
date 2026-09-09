use super::super::pricing_catalog::{Catalog, Pricing};
use super::{model_names::normalize, token_delta::Tokens};

#[derive(Clone, Copy)]
struct Rate {
    input: f64,
    cached: f64,
    output: f64,
    write: f64,
}
#[derive(Clone, Copy)]
struct Model {
    base: Rate,
    long: Option<(f64, Rate)>,
}
fn rate(input: f64, cached: f64, output: f64) -> Rate {
    Rate {
        input,
        cached,
        output,
        write: input,
    }
}
fn bundled(model: &str) -> Option<Model> {
    let mut long = None;
    let base = match model {
        "gpt-5" | "gpt-5.1" | "gpt-5.1-codex" | "gpt-5.1-codex-max" => rate(1.25, 0.125, 10.0),
        "gpt-5-mini" | "gpt-5.1-codex-mini" => rate(0.25, 0.025, 2.0),
        "gpt-5-nano" => rate(0.05, 0.005, 0.4),
        "gpt-5-pro" => rate(15.0, 15.0, 120.0),
        "gpt-5.2" | "gpt-5.2-codex" | "gpt-5.3-codex" => rate(1.75, 0.175, 14.0),
        "gpt-5.2-pro" => rate(21.0, 21.0, 168.0),
        "gpt-5.3-codex-spark" => rate(0.0, 0.0, 0.0),
        "gpt-5.4-mini" => rate(0.75, 0.075, 4.5),
        "gpt-5.4-nano" => rate(0.2, 0.02, 1.25),
        "gpt-5.4-pro" | "gpt-5.5-pro" => rate(30.0, 30.0, 180.0),
        "gpt-5.4" => {
            long = Some((272000.0, rate(5.0, 0.5, 22.5)));
            rate(2.5, 0.25, 15.0)
        }
        "gpt-5.5" => {
            long = Some((272000.0, rate(10.0, 1.0, 45.0)));
            rate(5.0, 0.5, 30.0)
        }
        "gpt-5.6-sol" => {
            long = Some((
                272000.0,
                Rate {
                    write: 12.5,
                    ..rate(10.0, 1.0, 45.0)
                },
            ));
            Rate {
                write: 6.25,
                ..rate(5.0, 0.5, 30.0)
            }
        }
        "gpt-5.6-terra" => {
            long = Some((
                272000.0,
                Rate {
                    write: 5.0,
                    ..rate(4.0, 0.4, 18.0)
                },
            ));
            Rate {
                write: 2.5,
                ..rate(2.0, 0.2, 12.0)
            }
        }
        "gpt-5.6-luna" => {
            long = Some((
                200000.0,
                Rate {
                    write: 7.5,
                    ..rate(6.0, 0.6, 22.5)
                },
            ));
            Rate {
                write: 3.75,
                ..rate(0.2, 0.3, 1.2)
            }
        }
        _ => return None,
    };
    Some(Model { base, long })
}
fn catalog_model(p: &Pricing, b: Option<Model>) -> Model {
    let base = Rate {
        input: p.input,
        output: p.output,
        cached: p.cache_read.or(b.map(|b| b.base.cached)).unwrap_or(p.input),
        write: p.cache_write.or(b.map(|b| b.base.write)).unwrap_or(p.input),
    };
    let bundled_long = if p.threshold_tokens.is_none() {
        b.and_then(|b| b.long)
    } else {
        None
    };
    let long = p
        .threshold_tokens
        .or(b.and_then(|b| b.long.map(|v| v.0)))
        .map(|threshold| {
            let input = p
                .input_above_threshold
                .or(bundled_long.map(|v| v.1.input))
                .unwrap_or(base.input);
            let output = p
                .output_above_threshold
                .or(bundled_long.map(|v| v.1.output))
                .unwrap_or(base.output);
            let cached = p.cache_read_above_threshold.unwrap_or_else(|| {
                if p.threshold_tokens.is_some() {
                    p.cache_read
                        .or(p.input_above_threshold)
                        .unwrap_or(base.input)
                } else {
                    bundled_long.map(|v| v.1.cached).unwrap_or(base.cached)
                }
            });
            let write = p.cache_write_above_threshold.unwrap_or_else(|| {
                if p.threshold_tokens.is_some() {
                    p.cache_write
                        .or(p.input_above_threshold)
                        .unwrap_or(base.input)
                } else {
                    bundled_long.map(|v| v.1.write).unwrap_or(base.write)
                }
            });
            (
                threshold,
                Rate {
                    input,
                    cached,
                    output,
                    write,
                },
            )
        });
    Model { base, long }
}
pub(in crate::provider_usage) fn price(
    model: Option<&str>,
    tokens: Tokens,
    priority: bool,
    priority_model: Option<&str>,
    catalog: &Catalog,
) -> Option<f64> {
    let model = model?;
    let normalized = normalize(model);
    let bundled = normalized.as_deref().and_then(bundled);
    let pricing = catalog
        .find(model)
        .map(|p| catalog_model(p, bundled))
        .or(bundled)?;
    let rate = pricing
        .long
        .filter(|(threshold, _)| tokens.input_tokens as f64 > *threshold)
        .map(|(_, rate)| rate)
        .unwrap_or(pricing.base);
    let cached = tokens.cached_input_tokens.min(tokens.input_tokens);
    let write = tokens.cache_write_tokens.min(tokens.input_tokens - cached);
    let mut cost = ((tokens.input_tokens - cached - write) as f64 * rate.input
        + cached as f64 * rate.cached
        + write as f64 * rate.write
        + tokens.output_tokens as f64 * rate.output)
        / 1_000_000.0;
    if priority && tokens.input_tokens <= 272000 {
        cost *= match priority_model
            .or(Some(model))
            .and_then(normalize)
            .as_deref()
        {
            Some("gpt-5.4" | "gpt-5.4-mini" | "gpt-5.6-sol" | "gpt-5.6-terra" | "gpt-5.6-luna") => {
                2.0
            }
            Some("gpt-5.5") => 2.5,
            _ => 1.0,
        };
    }
    cost.is_finite().then_some(cost)
}
