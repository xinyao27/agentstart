use yiru_protocol::runtime::v1::execute_request::Command as RequestCommand;
use yiru_protocol::runtime::v1::execute_response::Result as ResponseResult;
use yiru_protocol::runtime::v1::{ExecuteRequest, ExecuteResponse};

pub(super) fn response_matches(request: &ExecuteRequest, response: &ExecuteResponse) -> bool {
    matches!(
        (request.command.as_ref(), response.result.as_ref()),
        (
            Some(RequestCommand::Snapshot(_)),
            Some(ResponseResult::Snapshot(_))
        ) | (
            Some(RequestCommand::Screenshot(_)),
            Some(ResponseResult::Screenshot(_))
        ) | (
            Some(RequestCommand::FullScreenshot(_)),
            Some(ResponseResult::FullScreenshot(_))
        ) | (Some(RequestCommand::Goto(_)), Some(ResponseResult::Goto(_)))
            | (Some(RequestCommand::Back(_)), Some(ResponseResult::Back(_)))
            | (
                Some(RequestCommand::Reload(_)),
                Some(ResponseResult::Reload(_))
            )
            | (
                Some(RequestCommand::Forward(_)),
                Some(ResponseResult::Forward(_))
            )
            | (Some(RequestCommand::Eval(_)), Some(ResponseResult::Eval(_)))
            | (
                Some(RequestCommand::Scroll(_)),
                Some(ResponseResult::Scroll(_))
            )
            | (Some(RequestCommand::Wait(_)), Some(ResponseResult::Wait(_)))
            | (Some(RequestCommand::Pdf(_)), Some(ResponseResult::Pdf(_)))
            | (
                Some(RequestCommand::Click(_)),
                Some(ResponseResult::Click(_))
            )
            | (
                Some(RequestCommand::DoubleClick(_)),
                Some(ResponseResult::DoubleClick(_))
            )
            | (
                Some(RequestCommand::Focus(_)),
                Some(ResponseResult::Focus(_))
            )
            | (
                Some(RequestCommand::Clear(_)),
                Some(ResponseResult::Clear(_))
            )
            | (
                Some(RequestCommand::SelectAll(_)),
                Some(ResponseResult::SelectAll(_))
            )
            | (
                Some(RequestCommand::Hover(_)),
                Some(ResponseResult::Hover(_))
            )
            | (
                Some(RequestCommand::ScrollIntoView(_)),
                Some(ResponseResult::ScrollIntoView(_))
            )
            | (Some(RequestCommand::Fill(_)), Some(ResponseResult::Fill(_)))
            | (Some(RequestCommand::Type(_)), Some(ResponseResult::Type(_)))
            | (
                Some(RequestCommand::Select(_)),
                Some(ResponseResult::Select(_))
            )
            | (
                Some(RequestCommand::Check(_)),
                Some(ResponseResult::Check(_))
            )
            | (
                Some(RequestCommand::Keypress(_)),
                Some(ResponseResult::Keypress(_))
            )
            | (Some(RequestCommand::Drag(_)), Some(ResponseResult::Drag(_)))
            | (
                Some(RequestCommand::Upload(_)),
                Some(ResponseResult::Upload(_))
            )
            | (Some(RequestCommand::Get(_)), Some(ResponseResult::Get(_)))
            | (Some(RequestCommand::Is(_)), Some(ResponseResult::Is(_)))
            | (
                Some(RequestCommand::InsertText(_)),
                Some(ResponseResult::InsertText(_))
            )
            | (Some(RequestCommand::Find(_)), Some(ResponseResult::Find(_)))
            | (
                Some(RequestCommand::Highlight(_)),
                Some(ResponseResult::Highlight(_))
            )
            | (
                Some(RequestCommand::MouseMove(_)),
                Some(ResponseResult::MouseMove(_))
            )
            | (
                Some(RequestCommand::MouseDown(_)),
                Some(ResponseResult::MouseDown(_))
            )
            | (
                Some(RequestCommand::MouseUp(_)),
                Some(ResponseResult::MouseUp(_))
            )
            | (
                Some(RequestCommand::MouseWheel(_)),
                Some(ResponseResult::MouseWheel(_))
            )
            | (
                Some(RequestCommand::TabList(_)),
                Some(ResponseResult::TabList(_))
            )
            | (
                Some(RequestCommand::TabShow(_)),
                Some(ResponseResult::TabShow(_))
            )
            | (
                Some(RequestCommand::TabCurrent(_)),
                Some(ResponseResult::TabCurrent(_))
            )
            | (
                Some(RequestCommand::TabSwitch(_)),
                Some(ResponseResult::TabSwitch(_))
            )
            | (
                Some(RequestCommand::TabCreate(_)),
                Some(ResponseResult::TabCreate(_))
            )
            | (
                Some(RequestCommand::TabClose(_)),
                Some(ResponseResult::TabClose(_))
            )
            | (
                Some(RequestCommand::ProfileList(_)),
                Some(ResponseResult::ProfileList(_))
            )
            | (
                Some(RequestCommand::ProfileCreate(_)),
                Some(ResponseResult::ProfileCreate(_))
            )
            | (
                Some(RequestCommand::ProfileDelete(_)),
                Some(ResponseResult::ProfileDelete(_))
            )
            | (
                Some(RequestCommand::TabSetProfile(_)),
                Some(ResponseResult::TabSetProfile(_))
            )
            | (
                Some(RequestCommand::TabProfileShow(_)),
                Some(ResponseResult::TabProfileShow(_))
            )
            | (
                Some(RequestCommand::TabProfileClone(_)),
                Some(ResponseResult::TabProfileClone(_))
            )
            | (
                Some(RequestCommand::CookieGet(_)),
                Some(ResponseResult::CookieGet(_))
            )
            | (
                Some(RequestCommand::CookieSet(_)),
                Some(ResponseResult::CookieSet(_))
            )
            | (
                Some(RequestCommand::CookieDelete(_)),
                Some(ResponseResult::CookieDelete(_))
            )
            | (
                Some(RequestCommand::Viewport(_)),
                Some(ResponseResult::Viewport(_))
            )
            | (
                Some(RequestCommand::Geolocation(_)),
                Some(ResponseResult::Geolocation(_))
            )
            | (
                Some(RequestCommand::SetDevice(_)),
                Some(ResponseResult::SetDevice(_))
            )
            | (
                Some(RequestCommand::SetOffline(_)),
                Some(ResponseResult::SetOffline(_))
            )
            | (
                Some(RequestCommand::SetHeaders(_)),
                Some(ResponseResult::SetHeaders(_))
            )
            | (
                Some(RequestCommand::SetCredentials(_)),
                Some(ResponseResult::SetCredentials(_))
            )
            | (
                Some(RequestCommand::SetMedia(_)),
                Some(ResponseResult::SetMedia(_))
            )
            | (
                Some(RequestCommand::ClipboardRead(_)),
                Some(ResponseResult::ClipboardRead(_))
            )
            | (
                Some(RequestCommand::ClipboardWrite(_)),
                Some(ResponseResult::ClipboardWrite(_))
            )
            | (
                Some(RequestCommand::DialogAccept(_)),
                Some(ResponseResult::DialogAccept(_))
            )
            | (
                Some(RequestCommand::DialogDismiss(_)),
                Some(ResponseResult::DialogDismiss(_))
            )
            | (
                Some(RequestCommand::InterceptEnable(_)),
                Some(ResponseResult::InterceptEnable(_))
            )
            | (
                Some(RequestCommand::InterceptDisable(_)),
                Some(ResponseResult::InterceptDisable(_))
            )
            | (
                Some(RequestCommand::InterceptList(_)),
                Some(ResponseResult::InterceptList(_))
            )
            | (
                Some(RequestCommand::CaptureStart(_)),
                Some(ResponseResult::CaptureStart(_))
            )
            | (
                Some(RequestCommand::CaptureStop(_)),
                Some(ResponseResult::CaptureStop(_))
            )
            | (
                Some(RequestCommand::Console(_)),
                Some(ResponseResult::Console(_))
            )
            | (
                Some(RequestCommand::Network(_)),
                Some(ResponseResult::Network(_))
            )
            | (
                Some(RequestCommand::StorageLocalGet(_)),
                Some(ResponseResult::StorageLocalGet(_))
            )
            | (
                Some(RequestCommand::StorageLocalSet(_)),
                Some(ResponseResult::StorageLocalSet(_))
            )
            | (
                Some(RequestCommand::StorageLocalClear(_)),
                Some(ResponseResult::StorageLocalClear(_))
            )
            | (
                Some(RequestCommand::StorageSessionGet(_)),
                Some(ResponseResult::StorageSessionGet(_))
            )
            | (
                Some(RequestCommand::StorageSessionSet(_)),
                Some(ResponseResult::StorageSessionSet(_))
            )
            | (
                Some(RequestCommand::StorageSessionClear(_)),
                Some(ResponseResult::StorageSessionClear(_))
            )
            | (
                Some(RequestCommand::CertificateProceed(_)),
                Some(ResponseResult::CertificateProceed(_))
            )
            | (
                Some(RequestCommand::GrabCancel(_)),
                Some(ResponseResult::GrabCancel(_))
            )
            | (
                Some(RequestCommand::PageControlOpenDevTools(_)),
                Some(ResponseResult::PageControlOpenDevTools(_))
            )
            | (
                Some(RequestCommand::PageControlSetActive(_)),
                Some(ResponseResult::PageControlSetActive(_))
            )
            | (
                Some(RequestCommand::GrabSetMode(_)),
                Some(ResponseResult::GrabSetMode(_))
            )
            | (
                Some(RequestCommand::GrabAwaitSelection(_)),
                Some(ResponseResult::GrabAwaitSelection(_))
            )
            | (
                Some(RequestCommand::GrabCaptureSelection(_)),
                Some(ResponseResult::GrabCaptureSelection(_))
            )
            | (
                Some(RequestCommand::GrabExtractHover(_)),
                Some(ResponseResult::GrabExtractHover(_))
            )
            | (
                Some(RequestCommand::PageControlRegister(_)),
                Some(ResponseResult::PageControlRegister(_))
            )
            | (
                Some(RequestCommand::PageControlUnregister(_)),
                Some(ResponseResult::PageControlUnregister(_))
            )
            | (
                Some(RequestCommand::PageControlSetViewportOverride(_)),
                Some(ResponseResult::PageControlSetViewportOverride(_))
            )
            | (
                Some(RequestCommand::PageControlSetAnnotationViewport(_)),
                Some(ResponseResult::PageControlSetAnnotationViewport(_))
            )
            | (
                Some(RequestCommand::MouseClick(_)),
                Some(ResponseResult::MouseClick(_))
            )
            | (
                Some(RequestCommand::ProfileClearDefaultCookies(_)),
                Some(ResponseResult::ProfileClearDefaultCookies(_))
            )
            | (
                Some(RequestCommand::ProfileDetectBrowsers(_)),
                Some(ResponseResult::ProfileDetectBrowsers(_))
            )
            | (
                Some(RequestCommand::ProfileImportFromBrowser(_)),
                Some(ResponseResult::ProfileImportFromBrowser(_))
            )
    )
}
