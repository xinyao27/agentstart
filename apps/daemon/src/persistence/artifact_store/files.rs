use std::fs::{self, File, OpenOptions};
use std::io::{self, Read, Seek, SeekFrom, Write};
use std::path::Path;

pub(super) fn create_directory(path: &Path) -> io::Result<()> {
    create_directories(path)
}

pub(super) fn clear_parts(directory: &Path) -> io::Result<()> {
    for entry in fs::read_dir(directory)? {
        let entry = entry?;
        if entry.file_name().to_string_lossy().ends_with(".part") {
            fs::remove_file(entry.path())?;
        }
    }
    Ok(())
}

pub(super) fn create_part(path: &Path) -> io::Result<()> {
    let mut options = OpenOptions::new();
    options.write(true).create(true).truncate(true);
    configure_secure_create(&mut options);
    drop(options.open(path)?);
    Ok(())
}

pub(super) fn remove_if_present(path: &Path) -> io::Result<()> {
    if path.exists() {
        fs::remove_file(path)
    } else {
        Ok(())
    }
}

pub(super) fn append(path: &Path, bytes: &[u8]) -> io::Result<()> {
    let mut options = OpenOptions::new();
    options.append(true).create(true);
    configure_secure_create(&mut options);
    let mut file = options.open(path)?;
    file.write_all(bytes)
}

pub(super) fn length(path: &Path) -> io::Result<u64> {
    fs::metadata(path).map(|metadata| metadata.len())
}

pub(super) fn complete(part: &Path, ready: &Path) -> io::Result<()> {
    fs::rename(part, ready)?;
    harden_file(ready)
}

pub(super) fn exists(path: &Path) -> bool {
    path.exists()
}

pub(super) fn read(path: &Path, offset: u64, limit: usize) -> io::Result<Vec<u8>> {
    let mut file = File::open(path)?;
    file.seek(SeekFrom::Start(offset))?;
    let mut bytes = vec![0_u8; limit];
    let read_length = file.read(&mut bytes)?;
    bytes.truncate(read_length);
    Ok(bytes)
}

#[cfg(unix)]
fn create_directories(path: &Path) -> io::Result<()> {
    use std::os::unix::fs::DirBuilderExt;

    let mut builder = fs::DirBuilder::new();
    builder.recursive(true).mode(0o700).create(path)
}

#[cfg(not(unix))]
fn create_directories(path: &Path) -> io::Result<()> {
    fs::create_dir_all(path)
}

#[cfg(unix)]
fn configure_secure_create(options: &mut OpenOptions) {
    use std::os::unix::fs::OpenOptionsExt;

    options.mode(0o600);
}

#[cfg(not(unix))]
fn configure_secure_create(_options: &mut OpenOptions) {}

#[cfg(unix)]
fn harden_file(path: &Path) -> io::Result<()> {
    use std::os::unix::fs::PermissionsExt;

    fs::set_permissions(path, fs::Permissions::from_mode(0o600))
}

#[cfg(not(unix))]
fn harden_file(_path: &Path) -> io::Result<()> {
    Ok(())
}
