use std::io;
use std::sync::Arc;
use std::sync::atomic::{AtomicBool, Ordering};

use yiru_protocol::protocol::v1::{Status, StatusCode};
use yiru_protocol::runtime::v1::{
    LocalDownloadServiceAppendFileChunkRequest, LocalDownloadServiceAppendFileChunkResponse,
    LocalDownloadServiceAppendFolderFileChunkRequest,
    LocalDownloadServiceAppendFolderFileChunkResponse, LocalDownloadServiceCancelFileRequest,
    LocalDownloadServiceCancelFileResponse, LocalDownloadServiceCancelFolderRequest,
    LocalDownloadServiceCancelFolderResponse, LocalDownloadServiceCreateFolderDirectoryRequest,
    LocalDownloadServiceCreateFolderDirectoryResponse, LocalDownloadServiceFinishFileRequest,
    LocalDownloadServiceFinishFileResponse, LocalDownloadServiceFinishFolderRequest,
    LocalDownloadServiceFinishFolderResponse, LocalDownloadServiceStartFileRequest,
    LocalDownloadServiceStartFileResponse, LocalDownloadServiceStartFolderRequest,
    LocalDownloadServiceStartFolderResponse, LocalDownloadSession,
};
use yiru_protocol::transport::{decode, encode};

use crate::local_download::{FolderChunk, LocalDownloadAuthority, LocalDownloadError};

use super::protocol_call::{
    ProtocolDeliveryGuard, ProtocolDeliveryOutcome, ProtocolHandlerResponse,
};

#[derive(Clone)]
pub(super) struct LocalDownloadRpc {
    authority: LocalDownloadAuthority,
}

impl LocalDownloadRpc {
    pub(super) fn new(authority: LocalDownloadAuthority) -> Self {
        Self { authority }
    }

    pub(super) fn authority(&self) -> LocalDownloadAuthority {
        self.authority.clone()
    }

    pub(super) fn cancel_start_call(&self, owner_id: &str, call_id: u64) {
        self.authority.cancel_start_call(owner_id, call_id);
    }

    pub(super) fn confirm_start_call(&self, owner_id: &str, call_id: u64) {
        self.authority.confirm_start_call(owner_id, call_id);
    }

    fn start_delivery_guard(&self, owner_id: &str, call_id: u64) -> ProtocolDeliveryGuard {
        let local_downloads = self.clone();
        let owner_id = owner_id.to_owned();
        ProtocolDeliveryGuard::new(move |outcome| match outcome {
            ProtocolDeliveryOutcome::Confirmed => {
                local_downloads.confirm_start_call(&owner_id, call_id);
            }
            ProtocolDeliveryOutcome::RolledBack => {
                local_downloads.cancel_start_call(&owner_id, call_id);
            }
        })
    }

    fn file_mutation_delivery_guard(
        &self,
        owner_id: &str,
        transfer_id: String,
    ) -> ProtocolDeliveryGuard {
        let authority = self.authority.clone();
        let owner_id = owner_id.to_owned();
        ProtocolDeliveryGuard::new(move |outcome| {
            if matches!(outcome, ProtocolDeliveryOutcome::RolledBack) {
                authority.rollback_file_response(&owner_id, &transfer_id);
            }
        })
    }

    fn folder_mutation_delivery_guard(
        &self,
        owner_id: &str,
        transfer_id: String,
    ) -> ProtocolDeliveryGuard {
        let authority = self.authority.clone();
        let owner_id = owner_id.to_owned();
        ProtocolDeliveryGuard::new(move |outcome| {
            if matches!(outcome, ProtocolDeliveryOutcome::RolledBack) {
                authority.rollback_folder_response(&owner_id, &transfer_id);
            }
        })
    }

    pub(super) async fn protocol_start_file(
        &self,
        payload: &[u8],
        owner_id: &str,
        call_id: u64,
    ) -> Result<ProtocolHandlerResponse, Status> {
        let request = decode::<LocalDownloadServiceStartFileRequest>(payload)?;
        let mut cancellation = CancellationOnDrop::new();
        let session = self
            .authority
            .start_file(
                owner_id,
                &request.suggested_name,
                cancellation.signal(),
                call_id,
            )
            .await
            .map_err(download_status)?;
        cancellation.disarm();
        let response = encode(&LocalDownloadServiceStartFileResponse {
            session: Some(LocalDownloadSession {
                transfer_id: session.transfer_id,
                destination_path: session.destination_path,
            }),
        });
        Ok(ProtocolHandlerResponse::with_delivery(
            response,
            self.start_delivery_guard(owner_id, call_id),
        ))
    }

    pub(super) async fn protocol_append_file_chunk(
        &self,
        payload: &[u8],
        owner_id: &str,
    ) -> Result<ProtocolHandlerResponse, Status> {
        let request = decode::<LocalDownloadServiceAppendFileChunkRequest>(payload)?;
        let mut cancellation = CancellationOnDrop::new();
        self.authority
            .append_file_chunk(
                owner_id,
                &request.transfer_id,
                &request.content,
                cancellation.signal(),
            )
            .await
            .map_err(download_status)?;
        cancellation.disarm();
        Ok(ProtocolHandlerResponse::with_delivery(
            encode(&LocalDownloadServiceAppendFileChunkResponse {}),
            self.file_mutation_delivery_guard(owner_id, request.transfer_id),
        ))
    }

    pub(super) async fn protocol_finish_file(
        &self,
        payload: &[u8],
        owner_id: &str,
    ) -> Result<ProtocolHandlerResponse, Status> {
        let request = decode::<LocalDownloadServiceFinishFileRequest>(payload)?;
        let mut cancellation = CancellationOnDrop::new();
        let destination_path = self
            .authority
            .finish_file(owner_id, &request.transfer_id, cancellation.signal())
            .await
            .map_err(download_status)?;
        cancellation.disarm();
        Ok(ProtocolHandlerResponse::plain(encode(
            &LocalDownloadServiceFinishFileResponse { destination_path },
        )))
    }

    pub(super) async fn protocol_cancel_file(
        &self,
        payload: &[u8],
        owner_id: &str,
    ) -> Result<ProtocolHandlerResponse, Status> {
        let request = decode::<LocalDownloadServiceCancelFileRequest>(payload)?;
        self.authority
            .cancel_file(owner_id, &request.transfer_id)
            .await
            .map_err(download_status)?;
        Ok(ProtocolHandlerResponse::plain(encode(
            &LocalDownloadServiceCancelFileResponse {},
        )))
    }

    pub(super) async fn protocol_start_folder(
        &self,
        payload: &[u8],
        owner_id: &str,
        call_id: u64,
    ) -> Result<ProtocolHandlerResponse, Status> {
        let request = decode::<LocalDownloadServiceStartFolderRequest>(payload)?;
        let mut cancellation = CancellationOnDrop::new();
        let session = self
            .authority
            .start_folder(
                owner_id,
                &request.suggested_name,
                cancellation.signal(),
                call_id,
            )
            .await
            .map_err(download_status)?;
        cancellation.disarm();
        let response = encode(&LocalDownloadServiceStartFolderResponse {
            session: Some(LocalDownloadSession {
                transfer_id: session.transfer_id,
                destination_path: session.destination_path,
            }),
        });
        Ok(ProtocolHandlerResponse::with_delivery(
            response,
            self.start_delivery_guard(owner_id, call_id),
        ))
    }

    pub(super) async fn protocol_create_folder_directory(
        &self,
        payload: &[u8],
        owner_id: &str,
    ) -> Result<ProtocolHandlerResponse, Status> {
        let request = decode::<LocalDownloadServiceCreateFolderDirectoryRequest>(payload)?;
        let mut cancellation = CancellationOnDrop::new();
        self.authority
            .create_folder_directory(
                owner_id,
                &request.transfer_id,
                &request.path_segments,
                cancellation.signal(),
            )
            .await
            .map_err(download_status)?;
        cancellation.disarm();
        Ok(ProtocolHandlerResponse::with_delivery(
            encode(&LocalDownloadServiceCreateFolderDirectoryResponse {}),
            self.folder_mutation_delivery_guard(owner_id, request.transfer_id),
        ))
    }

    pub(super) async fn protocol_append_folder_file_chunk(
        &self,
        payload: &[u8],
        owner_id: &str,
    ) -> Result<ProtocolHandlerResponse, Status> {
        let request = decode::<LocalDownloadServiceAppendFolderFileChunkRequest>(payload)?;
        let mut cancellation = CancellationOnDrop::new();
        self.authority
            .append_folder_file_chunk(
                owner_id,
                FolderChunk {
                    content: &request.content,
                    first: request.first,
                    last: request.last,
                    path_segments: &request.path_segments,
                    transfer_id: &request.transfer_id,
                },
                cancellation.signal(),
            )
            .await
            .map_err(download_status)?;
        cancellation.disarm();
        Ok(ProtocolHandlerResponse::with_delivery(
            encode(&LocalDownloadServiceAppendFolderFileChunkResponse {}),
            self.folder_mutation_delivery_guard(owner_id, request.transfer_id),
        ))
    }

    pub(super) async fn protocol_finish_folder(
        &self,
        payload: &[u8],
        owner_id: &str,
    ) -> Result<ProtocolHandlerResponse, Status> {
        let request = decode::<LocalDownloadServiceFinishFolderRequest>(payload)?;
        let mut cancellation = CancellationOnDrop::new();
        let destination_path = self
            .authority
            .finish_folder(owner_id, &request.transfer_id, cancellation.signal())
            .await
            .map_err(download_status)?;
        cancellation.disarm();
        Ok(ProtocolHandlerResponse::plain(encode(
            &LocalDownloadServiceFinishFolderResponse { destination_path },
        )))
    }

    pub(super) async fn protocol_cancel_folder(
        &self,
        payload: &[u8],
        owner_id: &str,
    ) -> Result<ProtocolHandlerResponse, Status> {
        let request = decode::<LocalDownloadServiceCancelFolderRequest>(payload)?;
        self.authority
            .cancel_folder(owner_id, &request.transfer_id)
            .await
            .map_err(download_status)?;
        Ok(ProtocolHandlerResponse::plain(encode(
            &LocalDownloadServiceCancelFolderResponse {},
        )))
    }
}

struct CancellationOnDrop {
    armed: bool,
    signal: Arc<AtomicBool>,
}

impl CancellationOnDrop {
    fn new() -> Self {
        Self {
            armed: true,
            signal: Arc::new(AtomicBool::new(false)),
        }
    }

    fn signal(&self) -> Arc<AtomicBool> {
        self.signal.clone()
    }

    fn disarm(&mut self) {
        self.armed = false;
    }
}

impl Drop for CancellationOnDrop {
    fn drop(&mut self) {
        if self.armed {
            self.signal.store(true, Ordering::Release);
        }
    }
}

fn download_status(error: LocalDownloadError) -> Status {
    let code = match &error {
        LocalDownloadError::InvalidInput(_) => StatusCode::InvalidArgument,
        LocalDownloadError::SessionNotFound => StatusCode::NotFound,
        LocalDownloadError::InvalidState => StatusCode::FailedPrecondition,
        LocalDownloadError::Cancelled => StatusCode::Cancelled,
        LocalDownloadError::ResourceExhausted => StatusCode::ResourceExhausted,
        LocalDownloadError::Io(error) if error.kind() == io::ErrorKind::AlreadyExists => {
            StatusCode::AlreadyExists
        }
        LocalDownloadError::Io(error) if error.kind() == io::ErrorKind::Unsupported => {
            StatusCode::FailedPrecondition
        }
        LocalDownloadError::PathEncoding
        | LocalDownloadError::Io(_)
        | LocalDownloadError::Task(_) => StatusCode::Internal,
    };
    Status {
        code: code as i32,
        message: error.to_string(),
        details: Vec::new(),
    }
}
