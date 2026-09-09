use std::collections::HashMap;
use std::path::PathBuf;
use std::sync::{Arc, Mutex, MutexGuard, Weak};
use std::time::Duration;

use thiserror::Error;
use tokio::task::AbortHandle;

use super::base64::is_valid_base64;
use super::files::{ClipboardImageFileError, ClipboardImageFiles};
use super::identity::{now_millis_or_zero, random_uuid};

const MAX_CONCURRENT_UPLOADS: usize = 8;
const UPLOAD_TTL: Duration = Duration::from_secs(5 * 60);
const UPLOAD_TTL_MS: u128 = 5 * 60 * 1_000;

#[derive(Clone)]
pub(crate) struct ClipboardImageUploads {
    inner: Arc<UploadAuthority>,
}

#[derive(Debug, Error)]
pub(crate) enum ClipboardImageUploadError {
    #[error("Clipboard image upload was not found")]
    NotFound,
    #[error("Too many clipboard image uploads are in progress")]
    TooMany,
    #[error("Clipboard image chunk offset is out of order")]
    OffsetOutOfOrder,
    #[error("Clipboard image upload exceeded expected size")]
    ExpectedSizeExceeded,
    #[error("Clipboard image upload is incomplete")]
    Incomplete,
    #[error("Clipboard image content must be base64")]
    InvalidBase64,
    #[error("clipboard image upload entropy failed: {0}")]
    Random(#[from] getrandom::Error),
    #[error(transparent)]
    ImageFile(#[from] ClipboardImageFileError),
}

struct UploadAuthority {
    state: Mutex<UploadState>,
}

struct UploadState {
    generation: u64,
    uploads: HashMap<String, ImageUpload>,
}

struct ImageUpload {
    content_base64: String,
    expected_base64_length: usize,
    expires_at_ms: u128,
    generation: u64,
    received_base64_length: usize,
    timer: AbortHandle,
}

impl ClipboardImageUploads {
    pub(crate) fn new() -> Self {
        Self {
            inner: Arc::new(UploadAuthority {
                state: Mutex::new(UploadState {
                    generation: 0,
                    uploads: HashMap::new(),
                }),
            }),
        }
    }

    pub(crate) fn start(
        &self,
        expected_base64_length: usize,
    ) -> Result<String, ClipboardImageUploadError> {
        let mut state = lock(&self.inner.state);
        prune_expired(&mut state, now_millis_or_zero());
        if state.uploads.len() >= MAX_CONCURRENT_UPLOADS {
            return Err(ClipboardImageUploadError::TooMany);
        }
        let upload_id = unique_upload_id(&state)?;
        let generation = next_generation(&mut state);
        let timer = schedule_expiry(&self.inner, upload_id.clone(), generation);
        state.uploads.insert(
            upload_id.clone(),
            ImageUpload {
                content_base64: String::new(),
                expected_base64_length,
                expires_at_ms: now_millis_or_zero().saturating_add(UPLOAD_TTL_MS),
                generation,
                received_base64_length: 0,
                timer,
            },
        );
        Ok(upload_id)
    }

    pub(crate) fn append(
        &self,
        upload_id: &str,
        offset: usize,
        content_base64: String,
    ) -> Result<usize, ClipboardImageUploadError> {
        let mut state = lock(&self.inner.state);
        prune_expired(&mut state, now_millis_or_zero());
        let Some(upload) = state.uploads.get(upload_id) else {
            return Err(ClipboardImageUploadError::NotFound);
        };
        if offset != upload.received_base64_length {
            return Err(ClipboardImageUploadError::OffsetOutOfOrder);
        }
        let Some(next_length) = upload
            .received_base64_length
            .checked_add(content_base64.len())
        else {
            return Err(ClipboardImageUploadError::ExpectedSizeExceeded);
        };
        if next_length > upload.expected_base64_length {
            return Err(ClipboardImageUploadError::ExpectedSizeExceeded);
        }
        let generation = next_generation(&mut state);
        let timer = schedule_expiry(&self.inner, upload_id.to_owned(), generation);
        let upload = state
            .uploads
            .get_mut(upload_id)
            .expect("upload remains present while its authority lock is held");
        upload.timer.abort();
        upload.content_base64.push_str(&content_base64);
        upload.received_base64_length = next_length;
        upload.expires_at_ms = now_millis_or_zero().saturating_add(UPLOAD_TTL_MS);
        upload.generation = generation;
        upload.timer = timer;
        Ok(next_length)
    }

    pub(crate) async fn commit(
        &self,
        upload_id: &str,
        image_files: ClipboardImageFiles,
    ) -> Result<PathBuf, ClipboardImageUploadError> {
        let upload = self.take(upload_id)?;
        if upload.received_base64_length != upload.expected_base64_length {
            return Err(ClipboardImageUploadError::Incomplete);
        }
        if !is_valid_base64(&upload.content_base64) {
            return Err(ClipboardImageUploadError::InvalidBase64);
        }
        Ok(image_files.save_base64(upload.content_base64).await?)
    }

    pub(crate) fn abort(&self, upload_id: &str) {
        let mut state = lock(&self.inner.state);
        prune_expired(&mut state, now_millis_or_zero());
        if let Some(upload) = state.uploads.remove(upload_id) {
            upload.timer.abort();
        }
    }

    fn take(&self, upload_id: &str) -> Result<ImageUpload, ClipboardImageUploadError> {
        let mut state = lock(&self.inner.state);
        prune_expired(&mut state, now_millis_or_zero());
        let upload = state
            .uploads
            .remove(upload_id)
            .ok_or(ClipboardImageUploadError::NotFound)?;
        upload.timer.abort();
        Ok(upload)
    }
}

impl UploadAuthority {
    fn expire(&self, upload_id: &str, generation: u64) {
        let mut state = lock(&self.state);
        if state
            .uploads
            .get(upload_id)
            .is_some_and(|upload| upload.generation == generation)
        {
            state.uploads.remove(upload_id);
        }
    }
}

impl Drop for UploadAuthority {
    fn drop(&mut self) {
        let state = self
            .state
            .get_mut()
            .unwrap_or_else(|error| error.into_inner());
        for upload in state.uploads.values() {
            upload.timer.abort();
        }
    }
}

fn unique_upload_id(state: &UploadState) -> Result<String, getrandom::Error> {
    loop {
        let upload_id = random_uuid()?;
        if !state.uploads.contains_key(&upload_id) {
            return Ok(upload_id);
        }
    }
}

fn next_generation(state: &mut UploadState) -> u64 {
    state.generation = state.generation.wrapping_add(1);
    state.generation
}

fn schedule_expiry(
    authority: &Arc<UploadAuthority>,
    upload_id: String,
    generation: u64,
) -> AbortHandle {
    let authority = Arc::downgrade(authority);
    tokio::spawn(async move {
        tokio::time::sleep(UPLOAD_TTL).await;
        if let Some(authority) = Weak::upgrade(&authority) {
            authority.expire(&upload_id, generation);
        }
    })
    .abort_handle()
}

fn prune_expired(state: &mut UploadState, now_ms: u128) {
    let expired = state
        .uploads
        .iter()
        .filter_map(|(upload_id, upload)| {
            (upload.expires_at_ms <= now_ms).then_some(upload_id.clone())
        })
        .collect::<Vec<_>>();
    for upload_id in expired {
        if let Some(upload) = state.uploads.remove(&upload_id) {
            upload.timer.abort();
        }
    }
}

fn lock<T>(mutex: &Mutex<T>) -> MutexGuard<'_, T> {
    mutex.lock().unwrap_or_else(|error| error.into_inner())
}
