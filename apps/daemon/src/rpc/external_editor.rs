pub(in crate::rpc) mod protocol;

// Why: both wire surfaces answer openRemoteSsh from this one request shape so
// the non-empty path/connection-id rule and the structured refusal cannot
// drift between the surfaces.
pub(super) struct OpenRemoteSshRequest {
    pub(super) connection_id: String,
    pub(super) path: String,
}

pub(super) enum OpenRemoteSshOutcome {
    RemoteRuntimeUnsupported,
}

#[derive(Clone, Copy)]
pub(super) struct ExternalEditorRpc;

impl ExternalEditorRpc {
    pub(super) const fn new() -> Self {
        Self
    }
}

pub(super) fn open_remote_ssh(request: OpenRemoteSshRequest) -> Result<OpenRemoteSshOutcome, ()> {
    if request.path.is_empty() || request.connection_id.is_empty() {
        return Err(());
    }
    Ok(OpenRemoteSshOutcome::RemoteRuntimeUnsupported)
}
