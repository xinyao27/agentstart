use super::model::HostCommand;

pub(super) fn build(command: &HostCommand) -> String {
    let environment = command
        .env
        .iter()
        .filter(|(name, _)| is_environment_name(name))
        .map(|(name, value)| format!("{name}={}", quote(value)))
        .collect::<Vec<_>>();
    let invocation = std::iter::once(&command.command)
        .chain(&command.args)
        .map(|value| quote(value))
        .collect::<Vec<_>>()
        .join(" ");
    let invocation = if environment.is_empty() {
        invocation
    } else {
        format!("env {} {invocation}", environment.join(" "))
    };
    command.cwd.as_ref().map_or_else(
        || invocation.clone(),
        |cwd| format!("cd -- {} && {invocation}", quote(cwd)),
    )
}

pub(super) fn quote(value: &str) -> String {
    format!("'{}'", value.replace('\'', "'\"'\"'"))
}

fn is_environment_name(name: &str) -> bool {
    let mut bytes = name.bytes();
    bytes
        .next()
        .is_some_and(|byte| byte == b'_' || byte.is_ascii_alphabetic())
        && bytes.all(|byte| byte == b'_' || byte.is_ascii_alphanumeric())
}

pub(super) fn encoded_host_id(prefix: &str, value: &str) -> String {
    let mut encoded = String::with_capacity(prefix.len() + value.len());
    encoded.push_str(prefix);
    for byte in value.as_bytes() {
        if byte.is_ascii_alphanumeric()
            || matches!(
                byte,
                b'-' | b'_' | b'.' | b'!' | b'~' | b'*' | b'\'' | b'(' | b')'
            )
        {
            encoded.push(char::from(*byte));
        } else {
            use std::fmt::Write as _;
            write!(&mut encoded, "%{byte:02X}").expect("writing to a String cannot fail");
        }
    }
    encoded
}
