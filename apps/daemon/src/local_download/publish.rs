use std::io;
use std::path::{Path, PathBuf};

pub(super) async fn rename_exclusive(source: PathBuf, destination: PathBuf) -> io::Result<()> {
    tokio::task::spawn_blocking(move || rename_exclusive_blocking(&source, &destination))
        .await
        .map_err(io::Error::other)?
}

#[cfg(unix)]
fn rename_exclusive_blocking(source: &Path, destination: &Path) -> io::Result<()> {
    use rustix::fs::{CWD, RenameFlags, renameat_with};

    renameat_with(CWD, source, CWD, destination, RenameFlags::NOREPLACE).map_err(io::Error::from)
}

#[cfg(windows)]
fn rename_exclusive_blocking(source: &Path, destination: &Path) -> io::Result<()> {
    // Why: MoveFileEx without replace semantics is the Windows implementation
    // behind std::fs::rename, so an existing destination remains untouched.
    std::fs::rename(source, destination)
}

#[cfg(not(any(unix, windows)))]
fn rename_exclusive_blocking(_source: &Path, _destination: &Path) -> io::Result<()> {
    Err(io::Error::new(
        io::ErrorKind::Unsupported,
        "atomic no-replace rename is unsupported",
    ))
}
