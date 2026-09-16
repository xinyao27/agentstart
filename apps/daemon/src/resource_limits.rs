// Why: macOS starts the daemon from launchd, which caps the soft descriptor limit at
// 256. The daemon holds a PTY per terminal plus a pipe pair per host command, so it
// reaches that ceiling under any concurrent git scan and every later open — session
// persistence included — fails with EMFILE.
#[cfg(unix)]
const OPEN_FILE_TARGET: u64 = 65_536;

#[cfg(unix)]
pub fn raise_open_file_limit() {
    use nix::sys::resource::{Resource, getrlimit, setrlimit};

    let Ok((soft, hard)) = getrlimit(Resource::RLIMIT_NOFILE) else {
        eprintln!("[daemon] Failed to read the open file limit");
        return;
    };
    let target = hard.min(OPEN_FILE_TARGET);
    if soft >= target {
        return;
    }
    if let Err(error) = setrlimit(Resource::RLIMIT_NOFILE, target, hard) {
        eprintln!("[daemon] Failed to raise the open file limit to {target}: {error}");
    }
}

// Why: Windows sizes its handle table by the system, so there is no process limit to raise.
#[cfg(not(unix))]
pub fn raise_open_file_limit() {}
