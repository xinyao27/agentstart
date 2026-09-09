use std::ffi::{OsStr, OsString};

pub(super) fn read_flag<'a>(args: &'a [OsString], name: &str) -> Option<&'a OsStr> {
    let index = args.iter().position(|argument| argument == name)?;
    let value = args.get(index + 1)?;
    (!value.to_string_lossy().starts_with("--")).then_some(value)
}

pub(super) fn has_flag(args: &[OsString], name: &str) -> bool {
    args.iter().any(|argument| argument == name)
}
