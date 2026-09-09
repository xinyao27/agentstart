use std::io;
use std::path::Path;

#[cfg(windows)]
use std::time::Duration;

#[cfg(windows)]
const WINDOWS_ATTEMPTS: u32 = 6;
#[cfg(windows)]
const WINDOWS_RETRY_STEP: Duration = Duration::from_millis(50);

pub(crate) fn replace(source: &Path, destination: &Path) -> io::Result<()> {
    #[cfg(windows)]
    {
        for attempt in 1..=WINDOWS_ATTEMPTS {
            match atomicwrites::replace_atomic(source, destination) {
                Ok(()) => return Ok(()),
                Err(error) if attempt == WINDOWS_ATTEMPTS => return Err(error),
                Err(_) => std::thread::sleep(WINDOWS_RETRY_STEP * attempt),
            }
        }
        unreachable!("the bounded replacement loop always returns")
    }
    #[cfg(not(windows))]
    {
        std::fs::rename(source, destination)
    }
}

pub(crate) async fn replace_async(source: &Path, destination: &Path) -> io::Result<()> {
    #[cfg(windows)]
    {
        let source = source.to_owned();
        let destination = destination.to_owned();
        tokio::task::spawn_blocking(move || replace(&source, &destination))
            .await
            .map_err(io::Error::other)?
    }
    #[cfg(not(windows))]
    {
        tokio::fs::rename(source, destination).await
    }
}
