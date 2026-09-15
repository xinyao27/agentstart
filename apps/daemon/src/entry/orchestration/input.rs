use std::ffi::OsString;

use super::OrchestrationCommandError;

pub(super) struct Args {
    values: Vec<String>,
}

impl Args {
    pub(super) fn new(args: &[OsString]) -> Result<Self, OrchestrationCommandError> {
        Ok(Self {
            values: args
                .iter()
                .map(|value| {
                    value
                        .to_str()
                        .map(str::to_owned)
                        .ok_or(OrchestrationCommandError::Unicode)
                })
                .collect::<Result<Vec<_>, _>>()?,
        })
    }

    /// The leading non-flag tokens, joined — `"worker start"`, `"send"`, `"run create"`.
    /// Stops at the first flag so a flag's value can never be mistaken for a command word.
    pub(super) fn command_path(&self) -> String {
        self.values
            .iter()
            .take_while(|value| !value.starts_with('-'))
            .cloned()
            .collect::<Vec<_>>()
            .join(" ")
    }

    pub(super) fn has(&self, name: &str) -> bool {
        let inline = format!("--{name}=");
        let spaced = format!("--{name}");
        self.values
            .iter()
            .any(|value| value == &spaced || value.starts_with(&inline))
    }

    /// Every occurrence of `--name <value>` / `--name=<value>`, in argument order.
    pub(super) fn all(&self, name: &str) -> Vec<String> {
        let inline = format!("--{name}=");
        let spaced = format!("--{name}");
        let mut values = Vec::new();
        let mut index = 0;
        while index < self.values.len() {
            let token = &self.values[index];
            if let Some(value) = token.strip_prefix(&inline) {
                values.push(value.to_owned());
            } else if token == &spaced {
                let next = self
                    .values
                    .get(index + 1)
                    .filter(|value| !value.starts_with("--"));
                if let Some(value) = next {
                    values.push(value.clone());
                    index += 1;
                }
            }
            index += 1;
        }
        values
    }

    pub(super) fn read(&self, name: &str) -> Option<String> {
        self.all(name).into_iter().next()
    }

    pub(super) fn optional(&self, name: &str) -> Option<String> {
        self.read(name).filter(|value| !value.is_empty())
    }

    pub(super) fn required(&self, name: &'static str) -> Result<String, OrchestrationCommandError> {
        self.optional(name)
            .ok_or(OrchestrationCommandError::MissingFlag(name))
    }

    pub(super) fn integer(
        &self,
        name: &'static str,
    ) -> Result<Option<i64>, OrchestrationCommandError> {
        let Some(raw) = self.optional(name) else {
            return Ok(None);
        };
        raw.parse::<i64>()
            .map(Some)
            .map_err(|_| OrchestrationCommandError::InvalidFlag(name))
    }
}
