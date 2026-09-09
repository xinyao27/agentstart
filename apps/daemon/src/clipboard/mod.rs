mod base64;
mod files;
mod identity;
mod uploads;

// Why: both wire surfaces (legacy JSON parser and protobuf handler) must admit
// exactly the same payload sizes or one transport would reject images the other
// accepted, so the limits live here beside the upload authority they bound.
pub(crate) const MAX_UPLOAD_BASE64_CHARS: usize = 24 * 1_024 * 1_024;
pub(crate) const MAX_CHUNK_BASE64_CHARS: usize = 512 * 1_024;

pub(crate) use base64::is_valid_base64;
pub(crate) use files::ClipboardImageFiles;
pub(crate) use uploads::{ClipboardImageUploadError, ClipboardImageUploads};
