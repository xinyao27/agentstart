pub(in crate::rpc) mod protocol;

use crate::clipboard::{ClipboardImageFiles, ClipboardImageUploads};

#[derive(Clone)]
pub(super) struct ClipboardRpc {
    pub(super) image_files: ClipboardImageFiles,
    pub(super) image_uploads: ClipboardImageUploads,
}

impl ClipboardRpc {
    pub(super) fn new(
        image_files: ClipboardImageFiles,
        image_uploads: ClipboardImageUploads,
    ) -> Self {
        Self {
            image_files,
            image_uploads,
        }
    }
}
