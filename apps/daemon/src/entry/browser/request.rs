use std::time::Duration;

use agentstart_protocol::method_metadata::methods::{
    AgentStartRuntimeV1BrowserCliServiceResolveTarget as ResolveTargetMethod,
    AgentStartRuntimeV1BrowserCliServiceResolveUpload as ResolveUploadMethod,
};
use agentstart_protocol::runtime::v1 as browser;
use agentstart_protocol::runtime::v1::execute_request::Command;

use crate::transport::LocalProtocolClient;

use super::BrowserCommandError;
use super::input::BrowserArgs;

const RESOLVE_TIMEOUT: Duration = Duration::from_secs(30);

pub(super) async fn execute(
    peer: &LocalProtocolClient,
    args: &BrowserArgs,
    command: &str,
) -> Result<browser::ExecuteRequest, BrowserCommandError> {
    let command = match command {
        "tab profile list" => Command::ProfileList(browser::EmptyCommand {}),
        "tab profile create" => Command::ProfileCreate(browser::ProfileCreateCommand {
            label: args.require("label")?.to_owned(),
            scope: profile_scope(args.read("scope"))?.to_owned(),
        }),
        "tab profile delete" => Command::ProfileDelete(browser::ProfileDeleteCommand {
            profile_id: args.require("profile")?.to_owned(),
        }),
        "upload" => return upload(peer, args).await,
        command => command_with_target(peer, args, command).await?,
    };
    Ok(browser::ExecuteRequest {
        // Why: the CLI is not a page-control authority; the daemon fills this in
        // for callers that own a browser surface.
        authority_id: None,
        command: Some(command),
    })
}

pub(super) async fn download(
    peer: &LocalProtocolClient,
    args: &BrowserArgs,
) -> Result<browser::DownloadRequest, BrowserCommandError> {
    let path = args.require("path")?.to_owned();
    let selector = args.require("selector")?.to_owned();
    Ok(browser::DownloadRequest {
        target: Some(resolve_target(peer, args, true).await?),
        selector,
        path,
    })
}

async fn command_with_target(
    peer: &LocalProtocolClient,
    args: &BrowserArgs,
    command: &str,
) -> Result<Command, BrowserCommandError> {
    if matches!(command, "tab show" | "tab profile show") {
        let _ = args.require("page")?;
    }
    let target = Some(resolve_target(peer, args, false).await?);
    Ok(match command {
        "snapshot" => Command::Snapshot(browser::TargetCommand { target }),
        "screenshot" => Command::Screenshot(browser::ScreenshotCommand {
            target,
            format: if args.read("format") == Some("jpeg") {
                "jpeg"
            } else {
                ""
            }
            .to_owned(),
        }),
        "full-screenshot" => Command::FullScreenshot(browser::ScreenshotCommand {
            target,
            format: if args.read("format") == Some("jpeg") {
                "jpeg"
            } else {
                "png"
            }
            .to_owned(),
        }),
        "goto" => Command::Goto(browser::UrlCommand {
            target,
            url: args.require("url")?.to_owned(),
        }),
        "back" => Command::Back(browser::TargetCommand { target }),
        "reload" => Command::Reload(browser::TargetCommand { target }),
        "forward" => Command::Forward(browser::TargetCommand { target }),
        "eval" => Command::Eval(browser::EvalCommand {
            target,
            expression: args.require("expression")?.to_owned(),
        }),
        "scroll" => Command::Scroll(browser::ScrollCommand {
            target,
            direction: direction(args.require("direction")?)?.to_owned(),
            amount: args.positive("amount")?,
        }),
        "wait" => Command::Wait(browser::WaitCommand {
            target,
            selector: owned(args.read("selector")),
            timeout: args.positive("timeout")?,
            text: owned(args.read("text")),
            url: owned(args.read("url")),
            load: owned(args.read("load")),
            function: owned(args.read("fn")),
            state: owned(args.read("state")),
        }),
        "pdf" => Command::Pdf(browser::TargetCommand { target }),
        "click" => element(Command::Click, target, args)?,
        "dblclick" => element(Command::DoubleClick, target, args)?,
        "focus" => element(Command::Focus, target, args)?,
        "clear" => element(Command::Clear, target, args)?,
        "select-all" => element(Command::SelectAll, target, args)?,
        "hover" => element(Command::Hover, target, args)?,
        "scrollintoview" => element(Command::ScrollIntoView, target, args)?,
        "fill" => Command::Fill(browser::ElementValueCommand {
            target,
            element: args.require("element")?.to_owned(),
            value: args.require("value")?.to_owned(),
        }),
        "type" => Command::Type(browser::TextInputCommand {
            target,
            input: args.require("input")?.to_owned(),
        }),
        "select" => Command::Select(browser::ElementValueCommand {
            target,
            element: args.require("element")?.to_owned(),
            value: args.require("value")?.to_owned(),
        }),
        "check" | "uncheck" => Command::Check(browser::CheckCommand {
            target,
            element: args.require("element")?.to_owned(),
            checked: command == "check",
        }),
        "keypress" => Command::Keypress(browser::KeyCommand {
            target,
            key: args.require("key")?.to_owned(),
        }),
        "drag" => Command::Drag(browser::DragCommand {
            target,
            from: args.require("from")?.to_owned(),
            to: args.require("to")?.to_owned(),
        }),
        "get" => Command::Get(browser::GetCommand {
            target,
            what: args.require("what")?.to_owned(),
            selector: owned(args.read("element")),
        }),
        "is" => Command::Is(browser::IsCommand {
            target,
            what: args.require("what")?.to_owned(),
            selector: args.require("element")?.to_owned(),
        }),
        "inserttext" => Command::InsertText(browser::TextCommand {
            target,
            text: args.require("text")?.to_owned(),
        }),
        "find" => Command::Find(browser::FindCommand {
            target,
            locator: args.require("locator")?.to_owned(),
            value: args.require("value")?.to_owned(),
            action: args.require("action")?.to_owned(),
            text: owned(args.read("text")),
        }),
        "highlight" => Command::Highlight(browser::SelectorCommand {
            target,
            selector: args.require("selector")?.to_owned(),
        }),
        "exec" => super::exec::parse(args.require("command")?, target)?,
        "mouse move" => Command::MouseMove(browser::MouseMoveCommand {
            target,
            x: args.require_finite("x")?,
            y: args.require_finite("y")?,
        }),
        "mouse down" => Command::MouseDown(browser::MouseButtonCommand {
            target,
            button: owned(args.read("button")),
        }),
        "mouse up" => Command::MouseUp(browser::MouseButtonCommand {
            target,
            button: owned(args.read("button")),
        }),
        "mouse wheel" => Command::MouseWheel(browser::MouseWheelCommand {
            target,
            dy: args.require_finite("dy")?,
            dx: args.finite("dx")?,
        }),
        "tab list" => Command::TabList(browser::TargetCommand { target }),
        "tab show" => Command::TabShow(browser::TargetCommand { target }),
        "tab current" => Command::TabCurrent(browser::TargetCommand { target }),
        "tab switch" => {
            let index = args.nonnegative_integer("index")?;
            if index.is_none() && args.read("page").is_none_or(str::is_empty) {
                return Err(BrowserCommandError::MissingFlag(
                    "--index-or-page".to_owned(),
                ));
            }
            Command::TabSwitch(browser::TabSwitchCommand {
                target,
                index,
                focus: args.has("focus"),
            })
        }
        "tab create" => Command::TabCreate(browser::TabCreateCommand {
            target,
            url: owned(args.read("url")),
            profile_id: owned(args.read("profile")),
        }),
        "tab close" => Command::TabClose(browser::TabCloseCommand {
            target,
            index: args.nonnegative_integer("index")?,
        }),
        "tab profile set" | "tab profile use-default" => {
            Command::TabSetProfile(browser::TabProfileCommand {
                target,
                profile_id: if command == "tab profile use-default" {
                    "default".to_owned()
                } else {
                    args.require("profile")?.to_owned()
                },
            })
        }
        "tab profile show" => Command::TabProfileShow(browser::TargetCommand { target }),
        "tab profile clone" => Command::TabProfileClone(browser::TabProfileCommand {
            target,
            profile_id: args.require("profile")?.to_owned(),
        }),
        "cookie get" => Command::CookieGet(browser::CookieGetCommand {
            target,
            url: owned(args.read("url")),
        }),
        "cookie set" => cookie_set(target, args)?,
        "cookie delete" => Command::CookieDelete(browser::CookieDeleteCommand {
            target,
            name: args.require("name")?.to_owned(),
            domain: owned(args.read("domain")),
            url: owned(args.read("url")),
        }),
        "viewport" => Command::Viewport(browser::ViewportCommand {
            target,
            width: args.require_positive("width")?,
            height: args.require_positive("height")?,
            device_scale_factor: args.positive("scale")?,
            mobile: args.has("mobile").then_some(true),
        }),
        "geolocation" => Command::Geolocation(browser::GeolocationCommand {
            target,
            latitude: args.require_finite("latitude")?,
            longitude: args.require_finite("longitude")?,
            accuracy: args.positive("accuracy")?,
        }),
        "set device" => Command::SetDevice(browser::NameCommand {
            target,
            name: args.require("name")?.to_owned(),
        }),
        "set offline" => Command::SetOffline(browser::StateCommand {
            target,
            state: owned(args.read("state")),
        }),
        "set headers" => Command::SetHeaders(browser::HeadersCommand {
            target,
            headers: args.require("headers")?.to_owned(),
        }),
        "set credentials" => Command::SetCredentials(browser::CredentialsCommand {
            target,
            user: args.require("user")?.to_owned(),
            pass: args.require("pass")?.to_owned(),
        }),
        "set media" => Command::SetMedia(browser::MediaCommand {
            target,
            color_scheme: owned(args.read("color-scheme")),
            reduced_motion: owned(args.read("reduced-motion")),
        }),
        "clipboard read" => Command::ClipboardRead(browser::TargetCommand { target }),
        "clipboard write" => Command::ClipboardWrite(browser::TextCommand {
            target,
            text: args.require("text")?.to_owned(),
        }),
        "dialog accept" => Command::DialogAccept(browser::OptionalTextCommand {
            target,
            text: owned(args.read("text")),
        }),
        "dialog dismiss" => Command::DialogDismiss(browser::TargetCommand { target }),
        "intercept enable" => Command::InterceptEnable(browser::PatternsCommand {
            target,
            patterns: comma_values(args.read("patterns")),
        }),
        "intercept disable" => Command::InterceptDisable(browser::TargetCommand { target }),
        "intercept list" => Command::InterceptList(browser::TargetCommand { target }),
        "capture start" => Command::CaptureStart(browser::TargetCommand { target }),
        "capture stop" => Command::CaptureStop(browser::TargetCommand { target }),
        "console" => Command::Console(browser::LimitCommand {
            target,
            limit: args.positive("limit")?,
        }),
        "network" => Command::Network(browser::LimitCommand {
            target,
            limit: args.positive("limit")?,
        }),
        "storage local get" => storage_get(Command::StorageLocalGet, target, args)?,
        "storage local set" => storage_set(Command::StorageLocalSet, target, args)?,
        "storage local clear" => Command::StorageLocalClear(browser::TargetCommand { target }),
        "storage session get" => storage_get(Command::StorageSessionGet, target, args)?,
        "storage session set" => storage_set(Command::StorageSessionSet, target, args)?,
        "storage session clear" => Command::StorageSessionClear(browser::TargetCommand { target }),
        _ => return Err(BrowserCommandError::CommandUnsupported(command.to_owned())),
    })
}

async fn upload(
    peer: &LocalProtocolClient,
    args: &BrowserArgs,
) -> Result<browser::ExecuteRequest, BrowserCommandError> {
    let files = comma_values(Some(args.require("files")?));
    if files.is_empty() {
        return Err(BrowserCommandError::InvalidFlag("--files".to_owned()));
    }
    let element = args.require("element")?.to_owned();
    let response = peer
        .unary::<ResolveUploadMethod>(
            &browser::ResolveUploadRequest {
                files,
                page: owned(args.read("page")),
                worktree: owned(args.read("worktree")),
                current_directory: current_directory()?,
            },
            RESOLVE_TIMEOUT,
        )
        .await?;
    Ok(browser::ExecuteRequest {
        authority_id: None,
        command: Some(Command::Upload(browser::UploadCommand {
            target: response.target,
            element,
            files: response.files,
        })),
    })
}

async fn resolve_target(
    peer: &LocalProtocolClient,
    args: &BrowserArgs,
    require_worktree: bool,
) -> Result<browser::BrowserTarget, BrowserCommandError> {
    peer.unary::<ResolveTargetMethod>(
        &browser::ResolveTargetRequest {
            page: owned(args.read("page")),
            worktree: owned(args.read("worktree")),
            current_directory: current_directory()?,
            require_worktree,
        },
        RESOLVE_TIMEOUT,
    )
    .await?
    .target
    .ok_or(BrowserCommandError::InvalidResponse)
}

fn element(
    constructor: fn(browser::ElementCommand) -> Command,
    target: Option<browser::BrowserTarget>,
    args: &BrowserArgs,
) -> Result<Command, BrowserCommandError> {
    Ok(constructor(browser::ElementCommand {
        target,
        element: args.require("element")?.to_owned(),
    }))
}

fn cookie_set(
    target: Option<browser::BrowserTarget>,
    args: &BrowserArgs,
) -> Result<Command, BrowserCommandError> {
    let expires = args.finite("expires")?;
    if expires.is_some_and(|value| value < 0.0) {
        return Err(BrowserCommandError::InvalidFlag("--expires".to_owned()));
    }
    Ok(Command::CookieSet(browser::CookieSetCommand {
        target,
        name: args.require("name")?.to_owned(),
        value: args.require("value")?.to_owned(),
        domain: owned(args.read("domain")),
        path: owned(args.read("path")),
        secure: args.has("secure").then_some(true),
        http_only: args.has("httpOnly").then_some(true),
        same_site: owned(args.read("sameSite")),
        expires,
    }))
}

fn storage_get(
    constructor: fn(browser::StorageKeyCommand) -> Command,
    target: Option<browser::BrowserTarget>,
    args: &BrowserArgs,
) -> Result<Command, BrowserCommandError> {
    Ok(constructor(browser::StorageKeyCommand {
        target,
        key: args.require("key")?.to_owned(),
    }))
}

fn storage_set(
    constructor: fn(browser::StorageSetCommand) -> Command,
    target: Option<browser::BrowserTarget>,
    args: &BrowserArgs,
) -> Result<Command, BrowserCommandError> {
    Ok(constructor(browser::StorageSetCommand {
        target,
        key: args.require("key")?.to_owned(),
        value: args.require("value")?.to_owned(),
    }))
}

fn direction(value: &str) -> Result<&str, BrowserCommandError> {
    match value {
        "up" | "down" => Ok(value),
        _ => Err(BrowserCommandError::InvalidFlag("--direction".to_owned())),
    }
}

fn profile_scope(value: Option<&str>) -> Result<&str, BrowserCommandError> {
    match value {
        None | Some("isolated") => Ok("isolated"),
        Some("imported") => Ok("imported"),
        Some(_) => Err(BrowserCommandError::InvalidFlag("--scope".to_owned())),
    }
}

fn owned(value: Option<&str>) -> Option<String> {
    value.map(str::to_owned)
}

fn comma_values(value: Option<&str>) -> Vec<String> {
    value
        .into_iter()
        .flat_map(|value| value.split(','))
        .map(str::trim)
        .filter(|value| !value.is_empty())
        .map(str::to_owned)
        .collect()
}

fn current_directory() -> Result<String, BrowserCommandError> {
    Ok(std::env::current_dir()?.to_string_lossy().into_owned())
}
