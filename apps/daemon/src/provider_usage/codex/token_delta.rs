use serde::{Deserialize, Serialize};
use serde_json::Value;

#[derive(Clone, Copy, Default, PartialEq, Eq, Deserialize, Serialize)]
#[serde(rename_all = "camelCase")]
pub(in crate::provider_usage) struct Tokens {
    pub input_tokens: u64,
    pub cached_input_tokens: u64,
    pub cache_write_tokens: u64,
    pub output_tokens: u64,
    pub reasoning_output_tokens: u64,
    pub total_tokens: u64,
}

impl Tokens {
    pub fn read(value: &Value) -> Option<Self> {
        value.as_object()?;
        let number = |key: &str| {
            value
                .get(key)
                .and_then(Value::as_f64)
                .filter(|number| number.is_finite())
                .unwrap_or(0.0)
                .max(0.0) as u64
        };
        let input = number("input_tokens");
        let output = number("output_tokens");
        Some(Self {
            input_tokens: input,
            output_tokens: output,
            cached_input_tokens: if value.get("cached_input_tokens").is_some() {
                number("cached_input_tokens")
            } else {
                number("cache_read_input_tokens")
            },
            cache_write_tokens: if value.get("cache_write_input_tokens").is_some() {
                number("cache_write_input_tokens")
            } else {
                number("cache_write_tokens")
            },
            reasoning_output_tokens: number("reasoning_output_tokens").min(output),
            // Why: cached input and reasoning output are already subsets.
            total_tokens: input.saturating_add(output),
        })
    }
    fn fields(self) -> [u64; 6] {
        [
            self.input_tokens,
            self.cached_input_tokens,
            self.cache_write_tokens,
            self.output_tokens,
            self.reasoning_output_tokens,
            self.total_tokens,
        ]
    }
    fn from_fields(v: [u64; 6]) -> Self {
        Self {
            input_tokens: v[0],
            cached_input_tokens: v[1],
            cache_write_tokens: v[2],
            output_tokens: v[3],
            reasoning_output_tokens: v[4],
            total_tokens: v[5],
        }
    }
    fn zip(self, other: Self, operation: impl Fn(u64, u64) -> u64) -> Self {
        let a = self.fields();
        let b = other.fields();
        Self::from_fields(std::array::from_fn(|i| operation(a[i], b[i])))
    }
    fn monotonic(self, previous: Self) -> bool {
        self.fields()
            .iter()
            .zip(previous.fields())
            .take(5)
            .all(|(a, b)| *a >= b)
    }
    fn magnitude(self) -> u128 {
        self.fields()[..5].iter().map(|v| u128::from(*v)).sum()
    }
    pub fn tuple(self) -> String {
        // Why: retain Bun v5 ownership hashes, which excluded cache writes.
        format!(
            "{},{},{},{},{}",
            self.input_tokens,
            self.cached_input_tokens,
            self.output_tokens,
            self.reasoning_output_tokens,
            self.total_tokens
        )
    }
}

pub(super) enum Delta {
    Event {
        tokens: Tokens,
        next: Option<Tokens>,
    },
    Baseline(Tokens),
}

pub(super) fn resolve(
    total: Option<Tokens>,
    last: Option<Tokens>,
    previous: Option<Tokens>,
) -> Option<Delta> {
    match (total, last, previous) {
        (Some(total), Some(last), Some(previous)) => {
            if total == previous {
                return None;
            }
            let (p, c, l) = (previous.magnitude(), total.magnitude(), last.magnitude());
            if !total.monotonic(previous)
                && p > 0
                && c > 0
                && l > 0
                && (c * 100 >= p * 98 || c + l * 2 >= p)
            {
                return None;
            }
            Some(Delta::Event {
                tokens: last,
                next: Some(total),
            })
        }
        (Some(total), Some(last), None) => Some(Delta::Event {
            tokens: last,
            next: Some(total),
        }),
        (Some(total), None, Some(previous)) => {
            if total == previous {
                None
            } else if !total.monotonic(previous) {
                Some(Delta::Baseline(total))
            } else {
                Some(Delta::Event {
                    tokens: total.zip(previous, u64::saturating_sub),
                    next: Some(total),
                })
            }
        }
        (Some(total), None, None) => Some(Delta::Event {
            tokens: total,
            next: Some(total),
        }),
        (None, Some(last), previous) => Some(Delta::Event {
            tokens: last,
            next: previous.map(|previous| previous.zip(last, u64::saturating_add)),
        }),
        (None, None, _) => None,
    }
}
