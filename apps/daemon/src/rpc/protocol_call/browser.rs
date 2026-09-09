use super::{
    ProtocolCallContext, ProtocolHandlerOutcome, ProtocolHandlerResponse, ProtocolRequest,
    ProtocolRouter, browser_command_protocol, browser_protocol, browser_replay_protocol,
    browser_writeback_protocol, visual_regression_protocol,
};

pub(super) enum Method {
    BrowserCliServiceResolveTarget,
    BrowserCliServiceResolveUpload,
    BrowserRuntimeServiceCreateTab,
    BrowserHostServiceExecute,
    BrowserHostServiceDownload,
    LocalDownloadServiceAppendFileChunk,
    LocalDownloadServiceAppendFolderFileChunk,
    LocalDownloadServiceCancelFile,
    LocalDownloadServiceCancelFolder,
    LocalDownloadServiceCreateFolderDirectory,
    LocalDownloadServiceFinishFile,
    LocalDownloadServiceFinishFolder,
    LocalDownloadServiceStartFile,
    LocalDownloadServiceStartFolder,
    BrowserHostServiceExecuteMobile,
    BrowserScreencastServiceSubscribe,
    BrowserCommandServiceOpen,
    BrowserReplayServiceList,
    BrowserReplayServiceRecordResult,
    BrowserReplayServiceSave,
    BrowserWritebackServiceApplyColor,
    BrowserWritebackServiceApplyCss,
    BrowserWritebackServiceLocateElement,
    BrowserWritebackServiceRecordVerification,
    VisualRegressionServiceLatest,
    VisualRegressionServiceSave,
}

impl ProtocolRouter {
    pub(super) async fn handle_browser(
        &self,
        method: Method,
        request: ProtocolRequest<'_>,
        context: &ProtocolCallContext,
    ) -> ProtocolHandlerOutcome {
        let result = match method {
            Method::BrowserCliServiceResolveTarget => {
                browser_protocol::resolve_target(&self.browser, request.payload)
                    .await
                    .map(ProtocolHandlerResponse::plain)
            }
            Method::BrowserCliServiceResolveUpload => {
                browser_protocol::resolve_upload(&self.browser, request.payload)
                    .await
                    .map(ProtocolHandlerResponse::plain)
            }
            Method::BrowserRuntimeServiceCreateTab => {
                browser_protocol::create_tab(&self.browser, request.payload, context)
                    .await
                    .map(ProtocolHandlerResponse::plain)
            }
            Method::BrowserHostServiceExecute => {
                browser_protocol::execute(&self.browser, request.payload, context)
                    .await
                    .map(ProtocolHandlerResponse::plain)
            }
            Method::BrowserHostServiceDownload => {
                return match browser_protocol::download(&self.browser, request.payload, context)
                    .await
                {
                    Ok(()) => ProtocolHandlerOutcome::StreamComplete,
                    Err(error) => ProtocolHandlerOutcome::Failed(error),
                };
            }
            Method::LocalDownloadServiceAppendFileChunk => {
                self.local_downloads
                    .protocol_append_file_chunk(request.payload, &self.connection_id)
                    .await
            }
            Method::LocalDownloadServiceAppendFolderFileChunk => {
                self.local_downloads
                    .protocol_append_folder_file_chunk(request.payload, &self.connection_id)
                    .await
            }
            Method::LocalDownloadServiceCancelFile => {
                self.local_downloads
                    .protocol_cancel_file(request.payload, &self.connection_id)
                    .await
            }
            Method::LocalDownloadServiceCancelFolder => {
                self.local_downloads
                    .protocol_cancel_folder(request.payload, &self.connection_id)
                    .await
            }
            Method::LocalDownloadServiceCreateFolderDirectory => {
                self.local_downloads
                    .protocol_create_folder_directory(request.payload, &self.connection_id)
                    .await
            }
            Method::LocalDownloadServiceFinishFile => {
                self.local_downloads
                    .protocol_finish_file(request.payload, &self.connection_id)
                    .await
            }
            Method::LocalDownloadServiceFinishFolder => {
                self.local_downloads
                    .protocol_finish_folder(request.payload, &self.connection_id)
                    .await
            }
            Method::LocalDownloadServiceStartFile => {
                self.local_downloads
                    .protocol_start_file(request.payload, &self.connection_id, context.call_id())
                    .await
            }
            Method::LocalDownloadServiceStartFolder => {
                self.local_downloads
                    .protocol_start_folder(request.payload, &self.connection_id, context.call_id())
                    .await
            }
            Method::BrowserHostServiceExecuteMobile => {
                browser_protocol::execute_mobile(&self.browser, request.payload, context)
                    .await
                    .map(ProtocolHandlerResponse::plain)
            }
            Method::BrowserScreencastServiceSubscribe => {
                return match browser_protocol::screencast(&self.browser, request.payload, context)
                    .await
                {
                    Ok(()) => ProtocolHandlerOutcome::StreamComplete,
                    Err(error) => ProtocolHandlerOutcome::Failed(error),
                };
            }
            Method::BrowserCommandServiceOpen => {
                browser_command_protocol::open(&self.browser_command, request.payload)
                    .await
                    .map(ProtocolHandlerResponse::plain)
            }
            Method::BrowserReplayServiceList => {
                browser_replay_protocol::list(&self.browser_replay, request.payload)
                    .await
                    .map(ProtocolHandlerResponse::plain)
            }
            Method::BrowserReplayServiceRecordResult => {
                browser_replay_protocol::record_result(&self.browser_replay, request.payload)
                    .await
                    .map(ProtocolHandlerResponse::plain)
            }
            Method::BrowserReplayServiceSave => {
                browser_replay_protocol::save(&self.browser_replay, request.payload)
                    .await
                    .map(ProtocolHandlerResponse::plain)
            }
            Method::BrowserWritebackServiceApplyColor => {
                browser_writeback_protocol::apply_color(&self.browser_writeback, request.payload)
                    .await
                    .map(ProtocolHandlerResponse::plain)
            }
            Method::BrowserWritebackServiceApplyCss => {
                browser_writeback_protocol::apply_css(&self.browser_writeback, request.payload)
                    .await
                    .map(ProtocolHandlerResponse::plain)
            }
            Method::BrowserWritebackServiceLocateElement => {
                browser_writeback_protocol::locate_element(&self.browser_writeback, request.payload)
                    .await
                    .map(ProtocolHandlerResponse::plain)
            }
            Method::BrowserWritebackServiceRecordVerification => {
                browser_writeback_protocol::record_verification(
                    &self.browser_writeback,
                    request.payload,
                )
                .await
                .map(ProtocolHandlerResponse::plain)
            }
            Method::VisualRegressionServiceLatest => {
                visual_regression_protocol::latest(&self.visual_regression, request.payload)
                    .await
                    .map(ProtocolHandlerResponse::plain)
            }
            Method::VisualRegressionServiceSave => {
                visual_regression_protocol::save(&self.visual_regression, request.payload)
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
