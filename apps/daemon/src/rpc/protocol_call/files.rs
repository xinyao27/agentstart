use super::{
    ProtocolCallContext, ProtocolHandlerOutcome, ProtocolHandlerResponse, ProtocolRequest,
    ProtocolRouter, artifact_protocol, clipboard_protocol, external_editor_protocol,
    files_protocol, markdown_protocol, notebook_protocol, shell_files_protocol,
};

pub(super) enum Method {
    FilesServiceBrowseServerDirectory,
    FilesServiceList,
    FilesServiceSearchPaths,
    FilesServiceListAll,
    FilesServiceListMarkdownDocuments,
    FilesServiceOpen,
    FilesServiceOpenDiff,
    FilesServiceRead,
    FilesServiceReadChunk,
    FilesServiceReadDirectory,
    FilesServiceReadPreview,
    FilesServiceStat,
    FilesServiceSearch,
    FilesServiceWrite,
    FilesServiceWriteBase64,
    FilesServiceWriteBase64Chunk,
    FilesServiceCreateFile,
    FilesServiceCreateDirectory,
    FilesServiceCreateDirectoryNoClobber,
    FilesServiceCommitUpload,
    FilesServiceRename,
    FilesServiceCopy,
    FilesServiceDelete,
    FilesServiceReadLogTail,
    FilesServiceResolveTerminalPath,
    FilesServiceReadTerminalArtifact,
    FilesServiceReadTerminalArtifactPreview,
    FilesServiceWriteTerminalArtifact,
    FilesServiceWatch,
    FilesServiceWatchLogTail,
    ShellFilesServiceAuthorizeExternalPath,
    ShellFilesServiceCopy,
    ShellFilesServiceCreateDirectory,
    ShellFilesServiceCreateFile,
    ShellFilesServiceDelete,
    ShellFilesServicePathExists,
    ShellFilesServiceRead,
    ShellFilesServiceReadChunk,
    ShellFilesServiceRename,
    ShellFilesServiceResolveDroppedPathsForAgent,
    ShellFilesServiceStageExternalPathsForRuntimeUpload,
    ShellFilesServiceStat,
    ShellFilesServiceWrite,
    MarkdownServiceReadTab,
    MarkdownServiceSaveTab,
    ArtifactServiceBegin,
    ArtifactServiceAppend,
    ArtifactServiceComplete,
    ArtifactServiceAbort,
    ArtifactServiceDownloadTicket,
    ArtifactServiceRead,
    ClipboardServiceStartImageUpload,
    ClipboardServiceAppendImageUploadChunk,
    ClipboardServiceCommitImageUpload,
    ClipboardServiceAbortImageUpload,
    ClipboardServiceSaveImageAsTempFile,
    NotebookServiceRunPythonCell,
    ExternalEditorServiceOpenRemoteSsh,
}

impl ProtocolRouter {
    pub(super) async fn handle_files(
        &self,
        method: Method,
        request: ProtocolRequest<'_>,
        context: &ProtocolCallContext,
    ) -> ProtocolHandlerOutcome {
        let result = match method {
            Method::FilesServiceBrowseServerDirectory => {
                files_protocol::browse_server_directory(&self.files, request.payload)
                    .await
                    .map(ProtocolHandlerResponse::plain)
            }
            Method::FilesServiceList => files_protocol::list(&self.files, request.payload)
                .await
                .map(ProtocolHandlerResponse::plain),
            Method::FilesServiceSearchPaths => {
                files_protocol::search_paths(&self.files, request.payload)
                    .await
                    .map(ProtocolHandlerResponse::plain)
            }
            Method::FilesServiceListAll => files_protocol::list_all(&self.files, request.payload)
                .await
                .map(ProtocolHandlerResponse::plain),
            Method::FilesServiceListMarkdownDocuments => {
                files_protocol::list_markdown_documents(&self.files, request.payload)
                    .await
                    .map(ProtocolHandlerResponse::plain)
            }
            Method::FilesServiceOpen => files_protocol::open(&self.files, request.payload)
                .await
                .map(ProtocolHandlerResponse::plain),
            Method::FilesServiceOpenDiff => files_protocol::open_diff(&self.files, request.payload)
                .await
                .map(ProtocolHandlerResponse::plain),
            Method::FilesServiceRead => files_protocol::read(&self.files, request.payload)
                .await
                .map(ProtocolHandlerResponse::plain),
            Method::FilesServiceReadChunk => {
                files_protocol::read_chunk(&self.files, request.payload)
                    .await
                    .map(ProtocolHandlerResponse::plain)
            }
            Method::FilesServiceReadDirectory => {
                files_protocol::read_directory(&self.files, request.payload)
                    .await
                    .map(ProtocolHandlerResponse::plain)
            }
            Method::FilesServiceReadPreview => {
                files_protocol::read_preview(&self.files, request.payload)
                    .await
                    .map(ProtocolHandlerResponse::plain)
            }
            Method::FilesServiceStat => files_protocol::stat(&self.files, request.payload)
                .await
                .map(ProtocolHandlerResponse::plain),
            Method::FilesServiceSearch => files_protocol::search(&self.files, request.payload)
                .await
                .map(ProtocolHandlerResponse::plain),
            Method::FilesServiceWrite => files_protocol::write(&self.files, request.payload)
                .await
                .map(ProtocolHandlerResponse::plain),
            Method::FilesServiceWriteBase64 => {
                files_protocol::write_base64(&self.files, request.payload)
                    .await
                    .map(ProtocolHandlerResponse::plain)
            }
            Method::FilesServiceWriteBase64Chunk => {
                files_protocol::write_base64_chunk(&self.files, request.payload)
                    .await
                    .map(ProtocolHandlerResponse::plain)
            }
            Method::FilesServiceCreateFile => {
                files_protocol::create_file(&self.files, request.payload)
                    .await
                    .map(ProtocolHandlerResponse::plain)
            }
            Method::FilesServiceCreateDirectory => {
                files_protocol::create_directory(&self.files, request.payload)
                    .await
                    .map(ProtocolHandlerResponse::plain)
            }
            Method::FilesServiceCreateDirectoryNoClobber => {
                files_protocol::create_directory_no_clobber(&self.files, request.payload)
                    .await
                    .map(ProtocolHandlerResponse::plain)
            }
            Method::FilesServiceCommitUpload => {
                files_protocol::commit_upload(&self.files, request.payload)
                    .await
                    .map(ProtocolHandlerResponse::plain)
            }
            Method::FilesServiceRename => files_protocol::rename(&self.files, request.payload)
                .await
                .map(ProtocolHandlerResponse::plain),
            Method::FilesServiceCopy => files_protocol::copy(&self.files, request.payload)
                .await
                .map(ProtocolHandlerResponse::plain),
            Method::FilesServiceDelete => files_protocol::delete(&self.files, request.payload)
                .await
                .map(ProtocolHandlerResponse::plain),
            Method::FilesServiceReadLogTail => {
                files_protocol::read_log_tail(&self.files, request.payload)
                    .await
                    .map(ProtocolHandlerResponse::plain)
            }
            Method::FilesServiceResolveTerminalPath => files_protocol::resolve_terminal_path(
                &self.files,
                request.payload,
                context.access().principal_id(),
            )
            .await
            .map(ProtocolHandlerResponse::plain),
            Method::FilesServiceReadTerminalArtifact => files_protocol::read_terminal_artifact(
                &self.files,
                request.payload,
                context.access().principal_id(),
            )
            .await
            .map(ProtocolHandlerResponse::plain),
            Method::FilesServiceReadTerminalArtifactPreview => {
                files_protocol::read_terminal_artifact_preview(
                    &self.files,
                    request.payload,
                    context.access().principal_id(),
                )
                .await
                .map(ProtocolHandlerResponse::plain)
            }
            Method::FilesServiceWriteTerminalArtifact => files_protocol::write_terminal_artifact(
                &self.files,
                request.payload,
                context.access().principal_id(),
            )
            .await
            .map(ProtocolHandlerResponse::plain),
            Method::FilesServiceWatch => {
                return match files_protocol::watch(
                    &self.files,
                    request.payload,
                    &self.connection_id,
                    context,
                )
                .await
                {
                    Ok(()) => ProtocolHandlerOutcome::StreamComplete,
                    Err(error) => ProtocolHandlerOutcome::Failed(error),
                };
            }
            Method::FilesServiceWatchLogTail => {
                return match files_protocol::watch_log_tail(
                    &self.files,
                    request.payload,
                    &self.connection_id,
                    context,
                )
                .await
                {
                    Ok(()) => ProtocolHandlerOutcome::StreamComplete,
                    Err(error) => ProtocolHandlerOutcome::Failed(error),
                };
            }
            Method::ShellFilesServiceAuthorizeExternalPath => {
                shell_files_protocol::authorize_external_path(&self.shell_files, request.payload)
                    .await
                    .map(ProtocolHandlerResponse::plain)
            }
            Method::ShellFilesServiceCopy => {
                shell_files_protocol::copy(&self.shell_files, request.payload)
                    .await
                    .map(ProtocolHandlerResponse::plain)
            }
            Method::ShellFilesServiceCreateDirectory => {
                shell_files_protocol::create_directory(&self.shell_files, request.payload)
                    .await
                    .map(ProtocolHandlerResponse::plain)
            }
            Method::ShellFilesServiceCreateFile => {
                shell_files_protocol::create_file(&self.shell_files, request.payload)
                    .await
                    .map(ProtocolHandlerResponse::plain)
            }
            Method::ShellFilesServiceDelete => {
                shell_files_protocol::delete(&self.shell_files, request.payload)
                    .await
                    .map(ProtocolHandlerResponse::plain)
            }
            Method::ShellFilesServicePathExists => {
                shell_files_protocol::path_exists(&self.shell_files, request.payload)
                    .await
                    .map(ProtocolHandlerResponse::plain)
            }
            Method::ShellFilesServiceRead => {
                shell_files_protocol::read(&self.shell_files, request.payload)
                    .await
                    .map(ProtocolHandlerResponse::plain)
            }
            Method::ShellFilesServiceReadChunk => {
                shell_files_protocol::read_chunk(&self.shell_files, request.payload)
                    .await
                    .map(ProtocolHandlerResponse::plain)
            }
            Method::ShellFilesServiceRename => {
                shell_files_protocol::rename(&self.shell_files, request.payload)
                    .await
                    .map(ProtocolHandlerResponse::plain)
            }
            Method::ShellFilesServiceResolveDroppedPathsForAgent => {
                shell_files_protocol::resolve_dropped_paths_for_agent(
                    &self.shell_files,
                    request.payload,
                )
                .await
                .map(ProtocolHandlerResponse::plain)
            }
            Method::ShellFilesServiceStageExternalPathsForRuntimeUpload => {
                shell_files_protocol::stage_external_paths_for_runtime_upload(
                    &self.shell_files,
                    request.payload,
                )
                .await
                .map(ProtocolHandlerResponse::plain)
            }
            Method::ShellFilesServiceStat => {
                shell_files_protocol::stat(&self.shell_files, request.payload)
                    .await
                    .map(ProtocolHandlerResponse::plain)
            }
            Method::ShellFilesServiceWrite => {
                shell_files_protocol::write(&self.shell_files, request.payload)
                    .await
                    .map(ProtocolHandlerResponse::plain)
            }
            Method::MarkdownServiceReadTab => {
                markdown_protocol::read_tab(&self.markdown, request.payload)
                    .await
                    .map(ProtocolHandlerResponse::plain)
            }
            Method::MarkdownServiceSaveTab => {
                markdown_protocol::save_tab(&self.markdown, request.payload)
                    .await
                    .map(ProtocolHandlerResponse::plain)
            }
            Method::ArtifactServiceBegin => {
                artifact_protocol::begin(&self.artifact, request.payload)
                    .await
                    .map(ProtocolHandlerResponse::plain)
            }
            Method::ArtifactServiceAppend => {
                artifact_protocol::append(&self.artifact, request.payload)
                    .await
                    .map(ProtocolHandlerResponse::plain)
            }
            Method::ArtifactServiceComplete => {
                artifact_protocol::complete(&self.artifact, request.payload)
                    .await
                    .map(ProtocolHandlerResponse::plain)
            }
            Method::ArtifactServiceAbort => {
                artifact_protocol::abort(&self.artifact, request.payload)
                    .await
                    .map(ProtocolHandlerResponse::plain)
            }
            Method::ArtifactServiceDownloadTicket => {
                artifact_protocol::download_ticket(&self.artifact, request.payload)
                    .await
                    .map(ProtocolHandlerResponse::plain)
            }
            Method::ArtifactServiceRead => artifact_protocol::read(&self.artifact, request.payload)
                .await
                .map(ProtocolHandlerResponse::plain),
            Method::ClipboardServiceStartImageUpload => {
                clipboard_protocol::start_image_upload(&self.clipboard, request.payload)
                    .await
                    .map(ProtocolHandlerResponse::plain)
            }
            Method::ClipboardServiceAppendImageUploadChunk => {
                clipboard_protocol::append_image_upload_chunk(&self.clipboard, request.payload)
                    .await
                    .map(ProtocolHandlerResponse::plain)
            }
            Method::ClipboardServiceCommitImageUpload => {
                clipboard_protocol::commit_image_upload(&self.clipboard, request.payload)
                    .await
                    .map(ProtocolHandlerResponse::plain)
            }
            Method::ClipboardServiceAbortImageUpload => {
                clipboard_protocol::abort_image_upload(&self.clipboard, request.payload)
                    .await
                    .map(ProtocolHandlerResponse::plain)
            }
            Method::ClipboardServiceSaveImageAsTempFile => {
                clipboard_protocol::save_image_as_temp_file(&self.clipboard, request.payload)
                    .await
                    .map(ProtocolHandlerResponse::plain)
            }
            Method::NotebookServiceRunPythonCell => {
                notebook_protocol::run_python_cell(&self.notebook, request.payload)
                    .await
                    .map(ProtocolHandlerResponse::plain)
            }
            Method::ExternalEditorServiceOpenRemoteSsh => {
                external_editor_protocol::open_remote_ssh(&self.external_editor, request.payload)
                    .await
                    .map(ProtocolHandlerResponse::plain)
            }
        };
        match result {
            Ok(response) => ProtocolHandlerOutcome::Complete(response),
            Err(error) => ProtocolHandlerOutcome::Failed(error),
        }
    }
}
