use std::io;
use std::path::Path;
use std::process::{Command, Stdio};

pub(super) fn open(path: &Path, reveal: bool) -> io::Result<()> {
    let mut command = platform_command(path, reveal);
    command
        .stdin(Stdio::null())
        .stdout(Stdio::null())
        .stderr(Stdio::null());
    spawn_detached(command)
}

#[cfg(target_os = "macos")]
fn platform_command(path: &Path, reveal: bool) -> Command {
    let mut command = Command::new("open");
    if reveal {
        command.arg("-R");
    }
    command.arg(path);
    command
}

#[cfg(windows)]
fn platform_command(path: &Path, reveal: bool) -> Command {
    let mut command = Command::new("explorer.exe");
    if reveal {
        let mut argument = std::ffi::OsString::from("/select,");
        argument.push(path);
        command.arg(argument);
    } else {
        command.arg(path);
    }
    command
}

#[cfg(not(any(target_os = "macos", windows)))]
fn platform_command(path: &Path, reveal: bool) -> Command {
    let mut command = Command::new("xdg-open");
    command.arg(if reveal {
        path.parent().unwrap_or(path)
    } else {
        path
    });
    command
}

#[cfg(unix)]
fn spawn_detached(command: Command) -> io::Result<()> {
    use process_wrap::std::{CommandWrap, ProcessSession};

    let mut command = CommandWrap::from(command);
    command.wrap(ProcessSession);
    let _child = command.spawn()?;
    Ok(())
}

#[cfg(windows)]
fn spawn_detached(mut command: Command) -> io::Result<()> {
    use std::os::windows::process::CommandExt;
    use windows_sys::Win32::System::Threading::{CREATE_NEW_PROCESS_GROUP, DETACHED_PROCESS};

    command.creation_flags(DETACHED_PROCESS | CREATE_NEW_PROCESS_GROUP);
    let _child = command.spawn()?;
    Ok(())
}
