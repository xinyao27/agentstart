use super::{ArtifactDownload, ArtifactStore, ArtifactStoreError, ReadyArtifactFile};

impl ArtifactStore {
    pub(crate) async fn consume_download(
        &self,
        id: String,
        ticket: Option<String>,
    ) -> Result<Option<ArtifactDownload>, ArtifactStoreError> {
        if !is_download_id(&id) {
            return Ok(None);
        }
        Ok(self
            .consume_download_ticket(id, ticket)
            .await?
            .map(ArtifactDownload::from))
    }
}

impl From<ReadyArtifactFile> for ArtifactDownload {
    fn from(ready: ReadyArtifactFile) -> Self {
        Self {
            byte_length: ready.artifact.byte_length,
            content_disposition: format!(
                "attachment; filename*=UTF-8''{}",
                encode_uri_component(&ready.artifact.file_name)
            ),
            mime_type: ready.artifact.mime_type,
            path: ready.path,
        }
    }
}

fn is_download_id(id: &str) -> bool {
    id.len() == 36
        && id
            .bytes()
            .all(|byte| byte.is_ascii_hexdigit() || byte == b'-')
}

fn encode_uri_component(value: &str) -> String {
    let mut encoded = String::with_capacity(value.len());
    for byte in value.bytes() {
        if byte.is_ascii_alphanumeric()
            || matches!(
                byte,
                b'-' | b'_' | b'.' | b'!' | b'~' | b'*' | b'\'' | b'(' | b')'
            )
        {
            encoded.push(char::from(byte));
        } else {
            use std::fmt::Write as _;
            write!(&mut encoded, "%{byte:02X}").expect("writing to a String cannot fail");
        }
    }
    encoded
}
