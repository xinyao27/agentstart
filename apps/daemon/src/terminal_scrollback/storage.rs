use std::fs::{self, File};
use std::io::{Read, Seek, SeekFrom};
use std::path::{Path, PathBuf};

use sha2::{Digest, Sha256};

use crate::transport::secure_file;

pub(super) const REPLAY_BYTE_LIMIT: usize = 512 * 1024;
pub(super) const STORE_BYTE_LIMIT: usize = 5 * 1024 * 1024;
const REF_PREFIX: &str = "v1-";
const REF_HASH_LENGTH: usize = 32;

pub(super) fn snapshot_ref(tab_id: &str, leaf_id: &str) -> String {
    let mut digest = Sha256::new();
    digest.update(tab_id.as_bytes());
    digest.update([0]);
    digest.update(leaf_id.as_bytes());
    let hash = digest.finalize();
    let prefix = hash
        .iter()
        .take(REF_HASH_LENGTH / 2)
        .map(|byte| format!("{byte:02x}"))
        .collect::<String>();
    format!("{REF_PREFIX}{prefix}")
}

pub(super) fn write(root: &Path, reference: &str, buffer: &str) -> std::io::Result<()> {
    let path = snapshot_path(root, reference).ok_or_else(invalid_reference)?;
    secure_file::write_bytes(&path, trailing_utf8(buffer, STORE_BYTE_LIMIT))
        .map_err(std::io::Error::other)
}

pub(super) fn read(root: &Path, reference: &str) -> std::io::Result<String> {
    let path = snapshot_path(root, reference).ok_or_else(invalid_reference)?;
    read_trailing_utf8(&path, REPLAY_BYTE_LIMIT)
}

pub(super) fn delete(root: &Path, reference: &str) {
    let Some(path) = snapshot_path(root, reference) else {
        return;
    };
    match fs::remove_file(path) {
        Ok(()) => {}
        Err(error) if error.kind() == std::io::ErrorKind::NotFound => {}
        Err(_) => {}
    }
}

fn snapshot_path(root: &Path, reference: &str) -> Option<PathBuf> {
    is_valid_reference(reference).then(|| root.join(format!("{reference}.bin")))
}

fn is_valid_reference(reference: &str) -> bool {
    reference.len() == REF_PREFIX.len() + REF_HASH_LENGTH
        && reference.starts_with(REF_PREFIX)
        && reference[REF_PREFIX.len()..]
            .bytes()
            .all(|byte| byte.is_ascii_digit() || (b'a'..=b'f').contains(&byte))
}

fn trailing_utf8(value: &str, maximum: usize) -> &[u8] {
    if value.len() <= maximum {
        return value.as_bytes();
    }
    let mut start = value.len() - maximum;
    while !value.is_char_boundary(start) {
        start += 1;
    }
    &value.as_bytes()[start..]
}

fn read_trailing_utf8(path: &Path, maximum: usize) -> std::io::Result<String> {
    let mut file = File::open(path)?;
    let size = file.metadata()?.len();
    let length = size.min(maximum as u64) as usize;
    if length == 0 {
        return Ok(String::new());
    }
    file.seek(SeekFrom::Start(size - length as u64))?;
    let mut bytes = vec![0; length];
    file.read_exact(&mut bytes)?;
    let start = bytes
        .iter()
        .position(|byte| byte & 0xc0 != 0x80)
        .unwrap_or(bytes.len());
    Ok(String::from_utf8_lossy(&bytes[start..]).into_owned())
}

fn invalid_reference() -> std::io::Error {
    std::io::Error::new(
        std::io::ErrorKind::InvalidInput,
        "invalid terminal scrollback snapshot reference",
    )
}
