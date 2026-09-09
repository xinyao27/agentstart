use std::collections::HashSet;
use std::ffi::OsString;

use super::BrowserCommandError;

const MAX_SAFE_INTEGER: f64 = 9_007_199_254_740_991.0;
const BOOLEAN_FLAGS: &[&str] = &[
    "focus",
    "help",
    "httpOnly",
    "json",
    "mobile",
    "secure",
    "show-profile",
];

pub(super) struct BrowserArgs {
    values: Vec<String>,
}

impl BrowserArgs {
    pub(super) fn new(args: &[OsString]) -> Result<Self, BrowserCommandError> {
        Ok(Self {
            values: args
                .iter()
                .map(|value| {
                    value
                        .to_str()
                        .map(str::to_owned)
                        .ok_or(BrowserCommandError::Unicode)
                })
                .collect::<Result<Vec<_>, _>>()?,
        })
    }

    pub(super) fn command_path(&self) -> String {
        let mut positionals = self.values.first().into_iter().cloned().collect::<Vec<_>>();
        let boolean = BOOLEAN_FLAGS.iter().copied().collect::<HashSet<_>>();
        let mut index = 1;
        while index < self.values.len() {
            let token = &self.values[index];
            if token == "-h" {
                index += 1;
                continue;
            }
            let Some(flag) = token.strip_prefix("--") else {
                positionals.push(token.clone());
                index += 1;
                continue;
            };
            if flag.contains('=') || boolean.contains(flag) {
                index += 1;
                continue;
            }
            if self
                .values
                .get(index + 1)
                .is_some_and(|value| !value.starts_with("--"))
            {
                index += 2;
            } else {
                index += 1;
            }
        }
        positionals.join(" ")
    }

    pub(super) fn read(&self, name: &str) -> Option<&str> {
        let prefix = format!("--{name}=");
        if let Some(value) = self
            .values
            .iter()
            .find_map(|argument| argument.strip_prefix(&prefix))
        {
            return Some(value);
        }
        let index = self
            .values
            .iter()
            .position(|value| value == &format!("--{name}"))?;
        self.values
            .get(index + 1)
            .filter(|value| !value.starts_with("--"))
            .map(String::as_str)
    }

    pub(super) fn require(&self, name: &str) -> Result<&str, BrowserCommandError> {
        self.read(name)
            .ok_or_else(|| BrowserCommandError::MissingFlag(format!("--{name}")))
    }

    pub(super) fn has(&self, name: &str) -> bool {
        self.values
            .iter()
            .any(|value| value == &format!("--{name}"))
    }

    pub(super) fn has_short_help(&self) -> bool {
        self.values.iter().any(|value| value == "-h")
    }

    pub(super) fn finite(&self, name: &str) -> Result<Option<f64>, BrowserCommandError> {
        let Some(raw) = self.read(name) else {
            return Ok(None);
        };
        let value = javascript_number(raw).ok_or_else(|| invalid_flag(name))?;
        value
            .is_finite()
            .then_some(Some(value))
            .ok_or_else(|| invalid_flag(name))
    }

    pub(super) fn require_finite(&self, name: &str) -> Result<f64, BrowserCommandError> {
        self.finite(name)?
            .ok_or_else(|| BrowserCommandError::MissingFlag(format!("--{name}")))
    }

    pub(super) fn positive(&self, name: &str) -> Result<Option<f64>, BrowserCommandError> {
        let value = self.finite(name)?;
        if value.is_some_and(|value| value <= 0.0) {
            return Err(invalid_flag(name));
        }
        Ok(value)
    }

    pub(super) fn require_positive(&self, name: &str) -> Result<f64, BrowserCommandError> {
        self.positive(name)?
            .ok_or_else(|| BrowserCommandError::MissingFlag(format!("--{name}")))
    }

    pub(super) fn nonnegative_integer(
        &self,
        name: &str,
    ) -> Result<Option<f64>, BrowserCommandError> {
        let value = self.finite(name)?;
        if value
            .is_some_and(|value| value < 0.0 || value.fract() != 0.0 || value > MAX_SAFE_INTEGER)
        {
            return Err(invalid_flag(name));
        }
        Ok(value)
    }
}

fn javascript_number(value: &str) -> Option<f64> {
    let value = value.trim();
    if value.is_empty() {
        return Some(0.0);
    }
    match value {
        "Infinity" | "+Infinity" => Some(f64::INFINITY),
        "-Infinity" => Some(f64::NEG_INFINITY),
        _ => radix_number(value).or_else(|| value.parse().ok()),
    }
}

fn radix_number(value: &str) -> Option<f64> {
    let (digits, radix) = if let Some(digits) = value
        .strip_prefix("0x")
        .or_else(|| value.strip_prefix("0X"))
    {
        (digits, 16)
    } else if let Some(digits) = value
        .strip_prefix("0b")
        .or_else(|| value.strip_prefix("0B"))
    {
        (digits, 2)
    } else if let Some(digits) = value
        .strip_prefix("0o")
        .or_else(|| value.strip_prefix("0O"))
    {
        (digits, 8)
    } else {
        return None;
    };
    (!digits.is_empty())
        .then(|| {
            u64::from_str_radix(digits, radix)
                .ok()
                .map(|number| number as f64)
        })
        .flatten()
}

fn invalid_flag(name: &str) -> BrowserCommandError {
    BrowserCommandError::InvalidFlag(format!("--{name}"))
}
