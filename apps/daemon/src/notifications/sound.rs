use std::fs::{self, OpenOptions};
use std::io::{self, Read};
use std::path::Path;

use sha2::{Digest, Sha256};

use crate::settings::SettingsAuthority;

pub(crate) const MAX_NOTIFICATION_SOUND_BYTES: usize = 10 * 1024 * 1024;

#[derive(Clone)]
pub(crate) struct NotificationSoundAuthority {
    settings: SettingsAuthority,
}

pub(crate) struct NotificationSoundData {
    pub(crate) asset_id: String,
    pub(crate) bytes: Vec<u8>,
    pub(crate) mime_type: &'static str,
}

pub(crate) enum NotificationSoundLoad {
    Loaded(NotificationSoundData),
    NotModified,
}

#[derive(Clone, Copy)]
pub(crate) enum NotificationSoundUnavailable {
    InvalidPath,
    MissingPath,
    ReadFailed,
    TooLarge,
    UnsupportedType,
}

impl NotificationSoundAuthority {
    pub(crate) fn new(settings: SettingsAuthority) -> Self {
        Self { settings }
    }

    pub(crate) async fn load(
        &self,
        cached_asset_id: Option<&str>,
    ) -> Result<NotificationSoundLoad, NotificationSoundUnavailable> {
        let settings = self.settings.notification_settings();
        let path = settings
            .custom_sound_path
            .ok_or(NotificationSoundUnavailable::MissingPath)?;
        let loaded = tokio::task::spawn_blocking(move || load_file(Path::new(&path)))
            .await
            .map_err(|_| NotificationSoundUnavailable::ReadFailed)??;
        if cached_asset_id == Some(loaded.asset_id.as_str()) {
            return Ok(NotificationSoundLoad::NotModified);
        }
        Ok(NotificationSoundLoad::Loaded(loaded))
    }
}

fn load_file(path: &Path) -> Result<NotificationSoundData, NotificationSoundUnavailable> {
    if !path.is_absolute() {
        return Err(NotificationSoundUnavailable::InvalidPath);
    }
    let before_identity =
        crate::file_identity::FileIdentity::from_path(path).map_err(classify_open_error)?;
    let before = fs::symlink_metadata(path).map_err(classify_path_error)?;
    if metadata_is_link_like(&before) || !before.is_file() {
        return Err(NotificationSoundUnavailable::InvalidPath);
    }
    if before.len() > MAX_NOTIFICATION_SOUND_BYTES as u64 {
        return Err(NotificationSoundUnavailable::TooLarge);
    }

    let mut options = OpenOptions::new();
    options.read(true);
    configure_no_follow(&mut options);
    let mut file = options.open(path).map_err(classify_open_error)?;
    let opened = file
        .metadata()
        .map_err(|_| NotificationSoundUnavailable::ReadFailed)?;
    let opened_identity = crate::file_identity::FileIdentity::from_file(&file)
        .map_err(|_| NotificationSoundUnavailable::ReadFailed)?;
    if metadata_is_link_like(&opened)
        || !opened.is_file()
        || before_identity != opened_identity
        || file_metadata_changed(&before, &opened)
    {
        return Err(NotificationSoundUnavailable::InvalidPath);
    }
    if opened.len() > MAX_NOTIFICATION_SOUND_BYTES as u64 {
        return Err(NotificationSoundUnavailable::TooLarge);
    }

    // Why: the file can grow after metadata is read; Take keeps the actual allocation bounded.
    let mut bytes = Vec::with_capacity(opened.len() as usize);
    file.by_ref()
        .take((MAX_NOTIFICATION_SOUND_BYTES + 1) as u64)
        .read_to_end(&mut bytes)
        .map_err(|_| NotificationSoundUnavailable::ReadFailed)?;
    if bytes.len() > MAX_NOTIFICATION_SOUND_BYTES {
        return Err(NotificationSoundUnavailable::TooLarge);
    }
    let after = file
        .metadata()
        .map_err(|_| NotificationSoundUnavailable::ReadFailed)?;
    if file_metadata_changed(&opened, &after) || after.len() != bytes.len() as u64 {
        return Err(NotificationSoundUnavailable::ReadFailed);
    }
    let mime_type =
        verified_mime_type(path, &bytes).ok_or(NotificationSoundUnavailable::UnsupportedType)?;
    Ok(NotificationSoundData {
        asset_id: sound_asset_id(&bytes),
        bytes,
        mime_type,
    })
}

fn verified_mime_type(path: &Path, bytes: &[u8]) -> Option<&'static str> {
    let extension = path.extension()?.to_str()?.to_ascii_lowercase();
    match extension.as_str() {
        "aac" if is_aac(bytes) => Some("audio/aac"),
        "flac" if bytes.starts_with(b"fLaC") => Some("audio/flac"),
        "m4a" if is_iso_media(bytes) => Some("audio/mp4"),
        "mp3" if is_mp3(bytes) => Some("audio/mpeg"),
        "ogg" if bytes.starts_with(b"OggS") => Some("audio/ogg"),
        "wav" if is_wave(bytes) => Some("audio/wav"),
        _ => None,
    }
}

fn is_aac(bytes: &[u8]) -> bool {
    bytes.len() >= 2 && bytes[0] == 0xff && bytes[1] & 0xf6 == 0xf0
}

fn is_iso_media(bytes: &[u8]) -> bool {
    bytes.len() >= 12 && &bytes[4..8] == b"ftyp"
}

fn is_mp3(bytes: &[u8]) -> bool {
    bytes.starts_with(b"ID3") || bytes.len() >= 2 && bytes[0] == 0xff && bytes[1] & 0xe6 == 0xe2
}

fn is_wave(bytes: &[u8]) -> bool {
    bytes.len() >= 12 && bytes.starts_with(b"RIFF") && &bytes[8..12] == b"WAVE"
}

fn classify_path_error(error: io::Error) -> NotificationSoundUnavailable {
    match error.kind() {
        io::ErrorKind::NotFound => NotificationSoundUnavailable::MissingPath,
        _ => NotificationSoundUnavailable::ReadFailed,
    }
}

fn classify_open_error(error: io::Error) -> NotificationSoundUnavailable {
    if is_symlink_error(&error) {
        return NotificationSoundUnavailable::InvalidPath;
    }
    classify_path_error(error)
}

#[cfg(unix)]
fn configure_no_follow(options: &mut OpenOptions) {
    use std::os::unix::fs::OpenOptionsExt as _;

    options.custom_flags(nix::libc::O_NOFOLLOW | nix::libc::O_NONBLOCK);
}

#[cfg(windows)]
fn configure_no_follow(options: &mut OpenOptions) {
    use std::os::windows::fs::OpenOptionsExt as _;

    const FILE_FLAG_OPEN_REPARSE_POINT: u32 = 0x0020_0000;
    options.custom_flags(FILE_FLAG_OPEN_REPARSE_POINT);
}

#[cfg(not(any(unix, windows)))]
fn configure_no_follow(_options: &mut OpenOptions) {}

#[cfg(windows)]
fn metadata_is_link_like(metadata: &fs::Metadata) -> bool {
    use std::os::windows::fs::MetadataExt as _;

    const FILE_ATTRIBUTE_REPARSE_POINT: u32 = 0x0000_0400;
    metadata.file_type().is_symlink()
        || metadata.file_attributes() & FILE_ATTRIBUTE_REPARSE_POINT != 0
}

#[cfg(not(windows))]
fn metadata_is_link_like(metadata: &fs::Metadata) -> bool {
    metadata.file_type().is_symlink()
}

#[cfg(unix)]
fn file_metadata_changed(before: &fs::Metadata, opened: &fs::Metadata) -> bool {
    use std::os::unix::fs::MetadataExt as _;

    before.len() != opened.len()
        || before.ino() != 0 && opened.ino() != 0 && before.ino() != opened.ino()
        || before.dev() != 0 && opened.dev() != 0 && before.dev() != opened.dev()
        || metadata_modified(before) != metadata_modified(opened)
}

#[cfg(windows)]
fn file_metadata_changed(before: &fs::Metadata, opened: &fs::Metadata) -> bool {
    use std::os::windows::fs::MetadataExt as _;

    before.len() != opened.len()
        || before.creation_time() != opened.creation_time()
        || before.last_write_time() != opened.last_write_time()
}

#[cfg(not(any(unix, windows)))]
fn file_metadata_changed(before: &fs::Metadata, opened: &fs::Metadata) -> bool {
    before.len() != opened.len() || metadata_modified(before) != metadata_modified(opened)
}

#[cfg(not(windows))]
fn metadata_modified(metadata: &fs::Metadata) -> Option<std::time::SystemTime> {
    metadata.modified().ok()
}

#[cfg(unix)]
fn is_symlink_error(error: &io::Error) -> bool {
    error.raw_os_error() == Some(nix::libc::ELOOP)
}

#[cfg(not(unix))]
fn is_symlink_error(_error: &io::Error) -> bool {
    false
}

fn sound_asset_id(bytes: &[u8]) -> String {
    const HEX: &[u8; 16] = b"0123456789abcdef";

    let digest = Sha256::digest(bytes);
    let mut id = String::with_capacity(7 + digest.len() * 2);
    id.push_str("sha256:");
    for byte in digest {
        id.push(char::from(HEX[usize::from(byte >> 4)]));
        id.push(char::from(HEX[usize::from(byte & 0x0f)]));
    }
    id
}
