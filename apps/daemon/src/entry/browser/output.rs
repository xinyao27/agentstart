use agentstart_protocol::runtime::v1 as browser;
use agentstart_protocol::runtime::v1::browser_value::Kind;
use agentstart_protocol::runtime::v1::execute_response::Result as BrowserResult;
use base64::Engine;
use base64::engine::general_purpose::STANDARD;
use serde_json::{Map, Value, json};

use super::BrowserCommandError;
use super::input::BrowserArgs;

pub(super) fn write(
    command: &str,
    response: browser::ExecuteResponse,
    args: &BrowserArgs,
) -> Result<(), BrowserCommandError> {
    let result = response
        .result
        .ok_or(BrowserCommandError::InvalidResponse)?;
    let value = result_value(&result)?;
    if args.has("json") {
        match value {
            Some(value) => println!("{}", serde_json::to_string(&value)?),
            None => println!("undefined"),
        }
    } else {
        println!("{}", summary(command, &result, value.as_ref(), args)?);
    }
    Ok(())
}

pub(super) fn write_download(
    path: &str,
    _byte_length: u32,
    args: &BrowserArgs,
) -> Result<(), BrowserCommandError> {
    if args.has("json") {
        println!("{}", serde_json::to_string(&json!({ "path": path }))?);
    } else {
        println!("Downloaded to {path}");
    }
    Ok(())
}

fn result_value(result: &BrowserResult) -> Result<Option<Value>, BrowserCommandError> {
    Ok(Some(match result {
        BrowserResult::Snapshot(value) => json!({
            "browserPageId": value.browser_page_id,
            "snapshot": value.snapshot,
            "refs": value.refs.iter().map(|item| json!({
                "ref": item.r#ref, "role": item.role, "name": item.name
            })).collect::<Vec<_>>(),
            "url": value.url,
            "title": value.title
        }),
        BrowserResult::Screenshot(value) | BrowserResult::FullScreenshot(value) => json!({
            "data": STANDARD.encode(&value.data), "format": value.format
        }),
        BrowserResult::Goto(value)
        | BrowserResult::Back(value)
        | BrowserResult::Reload(value)
        | BrowserResult::Forward(value) => json!({ "url": value.url, "title": value.title }),
        BrowserResult::Eval(value) => json!({ "result": value.result, "origin": value.origin }),
        BrowserResult::Scroll(value) => json!({ "scrolled": value.scrolled }),
        BrowserResult::Wait(value) => json!({ "waited": value.value }),
        BrowserResult::Pdf(value) => json!({ "data": STANDARD.encode(&value.data) }),
        BrowserResult::Click(value) | BrowserResult::DoubleClick(value) => {
            json!({ "clicked": value.value })
        }
        BrowserResult::Focus(value) => json!({ "focused": value.value }),
        BrowserResult::Clear(value) => json!({ "cleared": value.value }),
        BrowserResult::SelectAll(value) | BrowserResult::Select(value) => {
            json!({ "selected": value.value })
        }
        BrowserResult::Hover(value) => json!({ "hovered": value.value }),
        BrowserResult::Fill(value) => json!({ "filled": value.value }),
        BrowserResult::Type(value) => json!({ "typed": value.value }),
        BrowserResult::Check(value) => json!({ "checked": value.value }),
        BrowserResult::Keypress(value) => json!({ "pressed": value.value }),
        BrowserResult::Drag(value) => json!({ "dragged": { "from": value.from, "to": value.to } }),
        BrowserResult::Upload(value) => json!({ "uploaded": value.value }),
        BrowserResult::ScrollIntoView(value)
        | BrowserResult::Get(value)
        | BrowserResult::Is(value)
        | BrowserResult::InsertText(value)
        | BrowserResult::Find(value)
        | BrowserResult::Highlight(value)
        | BrowserResult::MouseMove(value)
        | BrowserResult::MouseDown(value)
        | BrowserResult::MouseUp(value)
        | BrowserResult::MouseWheel(value)
        | BrowserResult::SetDevice(value)
        | BrowserResult::SetOffline(value)
        | BrowserResult::SetHeaders(value)
        | BrowserResult::SetCredentials(value)
        | BrowserResult::SetMedia(value)
        | BrowserResult::ClipboardRead(value)
        | BrowserResult::ClipboardWrite(value)
        | BrowserResult::DialogAccept(value)
        | BrowserResult::DialogDismiss(value)
        | BrowserResult::StorageLocalGet(value)
        | BrowserResult::StorageLocalSet(value)
        | BrowserResult::StorageLocalClear(value)
        | BrowserResult::StorageSessionGet(value)
        | BrowserResult::StorageSessionSet(value)
        | BrowserResult::StorageSessionClear(value)
        | BrowserResult::GrabCancel(value)
        | BrowserResult::GrabSetMode(value)
        | BrowserResult::GrabAwaitSelection(value)
        | BrowserResult::GrabCaptureSelection(value)
        | BrowserResult::GrabExtractHover(value)
        | BrowserResult::MouseClick(value) => {
            return value.value.as_ref().map(browser_value).transpose();
        }
        BrowserResult::PageControlOpenDevTools(value)
        | BrowserResult::PageControlSetActive(value)
        | BrowserResult::PageControlRegister(value)
        | BrowserResult::PageControlUnregister(value)
        | BrowserResult::PageControlSetViewportOverride(value)
        | BrowserResult::PageControlSetAnnotationViewport(value)
        | BrowserResult::ProfileClearDefaultCookies(value) => json!({ "ok": value.value }),
        BrowserResult::CertificateProceed(value)
        | BrowserResult::ProfileImportFromBrowser(value) => {
            json!({ "ok": value.ok, "reason": value.reason })
        }
        BrowserResult::ProfileDetectBrowsers(value) => json!({
            "browsers": value.browsers.iter().map(|item| json!({
                "browserFamily": item.browser_family, "browserProfile": item.browser_profile
            })).collect::<Vec<_>>()
        }),
        BrowserResult::TabList(value) => json!({
            "tabs": value.tabs.iter().map(tab_value).collect::<Vec<_>>()
        }),
        BrowserResult::TabShow(value) | BrowserResult::TabCurrent(value) => {
            json!({ "tab": tab_value(value.tab.as_ref().ok_or(BrowserCommandError::InvalidResponse)?) })
        }
        BrowserResult::TabSwitch(value) => {
            json!({ "switched": value.switched, "browserPageId": value.browser_page_id })
        }
        BrowserResult::TabCreate(value) => json!({ "browserPageId": value.browser_page_id }),
        BrowserResult::TabClose(value) => json!({ "closed": value.value }),
        BrowserResult::ProfileList(value) => json!({
            "profiles": value.profiles.iter().map(profile_value).collect::<Vec<_>>()
        }),
        BrowserResult::ProfileCreate(value) => json!({
            "profile": profile_value(
                value
                    .profile
                    .as_ref()
                    .ok_or(BrowserCommandError::ProfileCreateRejected)?
            )
        }),
        BrowserResult::ProfileDelete(value) => {
            json!({ "deleted": value.deleted, "profileId": value.profile_id })
        }
        BrowserResult::TabSetProfile(value) => json!({
            "browserPageId": value.browser_page_id,
            "profileId": value.profile_id,
            "profileLabel": value.profile_label
        }),
        BrowserResult::TabProfileShow(value) => json!({
            "browserPageId": value.browser_page_id,
            "worktreeId": value.worktree_id,
            "profileId": value.profile_id,
            "profileLabel": value.profile_label
        }),
        BrowserResult::TabProfileClone(value) => json!({
            "browserPageId": value.browser_page_id,
            "sourceBrowserPageId": value.source_browser_page_id,
            "profileId": value.profile_id,
            "profileLabel": value.profile_label
        }),
        BrowserResult::CookieGet(value) => json!({
            "cookies": value.cookies.iter().map(|cookie| json!({
                "name": cookie.name,
                "value": cookie.value,
                "domain": cookie.domain,
                "path": cookie.path,
                "expires": cookie.expires,
                "httpOnly": cookie.http_only,
                "secure": cookie.secure,
                "sameSite": cookie.same_site
            })).collect::<Vec<_>>()
        }),
        BrowserResult::CookieSet(value) => json!({ "success": value.value }),
        BrowserResult::CookieDelete(value) => json!({ "deleted": value.value }),
        BrowserResult::Viewport(value) => json!({
            "width": value.width,
            "height": value.height,
            "deviceScaleFactor": value.device_scale_factor,
            "mobile": value.mobile
        }),
        BrowserResult::Geolocation(value) => json!({
            "latitude": value.latitude, "longitude": value.longitude, "accuracy": value.accuracy
        }),
        BrowserResult::InterceptEnable(value) => {
            json!({ "enabled": value.enabled, "patterns": value.patterns })
        }
        BrowserResult::InterceptDisable(value) => json!({ "disabled": value.value }),
        BrowserResult::InterceptList(value) => json!({
            "requests": value.requests.iter().map(|request| {
                let headers = request.headers.iter().map(|header| {
                    (header.name.clone(), Value::String(header.value.clone()))
                }).collect::<Map<_, _>>();
                json!({
                    "id": request.id,
                    "url": request.url,
                    "method": request.method,
                    "headers": headers,
                    "resourceType": request.resource_type
                })
            }).collect::<Vec<_>>()
        }),
        BrowserResult::CaptureStart(value) => json!({ "capturing": value.value }),
        BrowserResult::CaptureStop(value) => json!({ "stopped": value.value }),
        BrowserResult::Console(value) => json!({
            "entries": value.entries.iter().map(|entry| optional_fields(json!({
                "level": entry.level,
                "text": entry.text,
                "timestamp": entry.timestamp
            }), [("url", entry.url.clone().map(Value::String)), ("line", entry.line.map(Value::from))])).collect::<Vec<_>>(),
            "truncated": value.truncated
        }),
        BrowserResult::Network(value) => json!({
            "entries": value.entries.iter().map(|entry| json!({
                "url": entry.url,
                "method": entry.method,
                "status": entry.status,
                "mimeType": entry.mime_type,
                "size": entry.size,
                "timestamp": entry.timestamp
            })).collect::<Vec<_>>(),
            "truncated": value.truncated
        }),
    }))
}

fn summary(
    command: &str,
    result: &BrowserResult,
    value: Option<&Value>,
    args: &BrowserArgs,
) -> Result<String, BrowserCommandError> {
    if command == "exec" {
        return wire_display(value);
    }
    Ok(match result {
        BrowserResult::Snapshot(snapshot) => format!(
            "page: {}\n{} — {}\n{}",
            snapshot.browser_page_id, snapshot.title, snapshot.url, snapshot.snapshot
        ),
        BrowserResult::Screenshot(screenshot) => format!(
            "Screenshot captured ({}, {} bytes)",
            screenshot.format,
            screenshot.data.len()
        ),
        BrowserResult::FullScreenshot(screenshot) => {
            format!("Full-page screenshot captured ({})", screenshot.format)
        }
        BrowserResult::Goto(navigation) => {
            format!("Navigated to {} — {}", navigation.url, navigation.title)
        }
        BrowserResult::Back(navigation) => {
            format!("Back to {} — {}", navigation.url, navigation.title)
        }
        BrowserResult::Reload(navigation) => {
            format!("Reloaded {} — {}", navigation.url, navigation.title)
        }
        BrowserResult::Forward(navigation) => format!("Navigated forward to {}", navigation.url),
        BrowserResult::Eval(value) => value.result.clone(),
        BrowserResult::Scroll(value) => format!("Scrolled {}", value.scrolled),
        BrowserResult::Wait(_) => pretty(value)?,
        BrowserResult::Pdf(value) => format!("PDF exported ({} bytes)", value.data.len()),
        BrowserResult::Click(_) => format!("Clicked {}", args.require("element")?),
        BrowserResult::DoubleClick(_) => format!("Double-clicked {}", args.require("element")?),
        BrowserResult::Focus(_) => format!("Focused {}", args.require("element")?),
        BrowserResult::Clear(_) => format!("Cleared {}", args.require("element")?),
        BrowserResult::SelectAll(_) => format!("Selected all in {}", args.require("element")?),
        BrowserResult::Hover(_) => format!("Hovered {}", args.require("element")?),
        BrowserResult::ScrollIntoView(_) => {
            format!("Scrolled into view {}", args.require("element")?)
        }
        BrowserResult::Fill(value) => format!("Filled {}", value.value),
        BrowserResult::Type(_) => "Typed input".to_owned(),
        BrowserResult::Select(value) => format!("Selected {}", value.value),
        BrowserResult::Check(_) => format!(
            "{} {}",
            if command == "uncheck" {
                "Unchecked"
            } else {
                "Checked"
            },
            args.require("element")?
        ),
        BrowserResult::Keypress(value) => format!("Pressed {}", value.value),
        BrowserResult::Drag(value) => format!("Dragged {} → {}", value.from, value.to),
        BrowserResult::Upload(value) => format!("Uploaded {} file(s)", value.value),
        BrowserResult::Get(_) | BrowserResult::Find(_) => wire_display(value)?,
        BrowserResult::Is(_) => javascript_string(value),
        BrowserResult::InsertText(_) => "Text inserted".to_owned(),
        BrowserResult::Highlight(_) => format!("Highlighted {}", args.require("selector")?),
        BrowserResult::MouseMove(_) => format!(
            "Mouse moved to {},{}",
            number_text(args.require_finite("x")?),
            number_text(args.require_finite("y")?)
        ),
        BrowserResult::MouseDown(_) => {
            format!(
                "Mouse button {} pressed",
                args.read("button").unwrap_or("left")
            )
        }
        BrowserResult::MouseUp(_) => {
            format!(
                "Mouse button {} released",
                args.read("button").unwrap_or("left")
            )
        }
        BrowserResult::MouseWheel(_) => {
            let dy = args.require_finite("dy")?;
            let dx = args.finite("dx")?;
            format!(
                "Mouse wheel scrolled dy={}{}",
                number_text(dy),
                dx.filter(|value| *value != 0.0)
                    .map(|value| format!(" dx={}", number_text(value)))
                    .unwrap_or_default()
            )
        }
        BrowserResult::TabList(value) => tab_list(value, args.has("show-profile")),
        BrowserResult::TabShow(value) | BrowserResult::TabCurrent(value) => tab_display(
            value
                .tab
                .as_ref()
                .ok_or(BrowserCommandError::InvalidResponse)?,
        ),
        BrowserResult::TabSwitch(value) => {
            format!(
                "Switched to tab {} ({})",
                number_text(value.switched),
                value.browser_page_id
            )
        }
        BrowserResult::TabCreate(value) => format!("Created tab {}", value.browser_page_id),
        BrowserResult::TabClose(_) => "Tab closed".to_owned(),
        BrowserResult::ProfileList(value) => profile_list(value),
        BrowserResult::ProfileCreate(value) => {
            let profile = value
                .profile
                .as_ref()
                .ok_or(BrowserCommandError::InvalidResponse)?;
            format!("Created profile {} ({})", profile.id, profile.label)
        }
        BrowserResult::ProfileDelete(value) => {
            if value.deleted {
                format!("Deleted profile {}", value.profile_id)
            } else {
                format!("Profile {} was not deleted", value.profile_id)
            }
        }
        BrowserResult::TabSetProfile(value) => format!(
            "Switched {} to {}",
            value.browser_page_id,
            value
                .profile_label
                .as_deref()
                .or(value.profile_id.as_deref())
                .unwrap_or("Default")
        ),
        BrowserResult::TabProfileShow(value) => format!(
            "page: {}\nworktree: {}\nprofileId: {}\nprofile: {}",
            value.browser_page_id,
            value.worktree_id.as_deref().unwrap_or("unknown"),
            value.profile_id.as_deref().unwrap_or("default"),
            value
                .profile_label
                .as_deref()
                .or(value.profile_id.as_deref())
                .unwrap_or("default")
        ),
        BrowserResult::TabProfileClone(value) => format!(
            "Cloned {} to {} ({})",
            value.source_browser_page_id,
            value.browser_page_id,
            value
                .profile_label
                .as_deref()
                .or(value.profile_id.as_deref())
                .unwrap_or("default")
        ),
        BrowserResult::CookieGet(value) => {
            if value.cookies.is_empty() {
                "No cookies".to_owned()
            } else {
                value
                    .cookies
                    .iter()
                    .map(|cookie| format!("{}={} ({})", cookie.name, cookie.value, cookie.domain))
                    .collect::<Vec<_>>()
                    .join("\n")
            }
        }
        BrowserResult::CookieSet(value) => {
            if value.value {
                format!("Cookie \"{}\" set", args.require("name")?)
            } else {
                format!("Failed to set cookie \"{}\"", args.require("name")?)
            }
        }
        BrowserResult::CookieDelete(_) => format!("Cookie \"{}\" deleted", args.require("name")?),
        BrowserResult::PageControlOpenDevTools(value)
        | BrowserResult::PageControlSetActive(value)
        | BrowserResult::PageControlRegister(value)
        | BrowserResult::PageControlUnregister(value)
        | BrowserResult::PageControlSetViewportOverride(value)
        | BrowserResult::PageControlSetAnnotationViewport(value)
        | BrowserResult::ProfileClearDefaultCookies(value) => {
            if value.value {
                "ok".to_owned()
            } else {
                "failed".to_owned()
            }
        }
        BrowserResult::CertificateProceed(value)
        | BrowserResult::ProfileImportFromBrowser(value) => match &value.reason {
            Some(reason) if !value.ok => format!("failed: {reason}"),
            _ if value.ok => "ok".to_owned(),
            _ => "failed".to_owned(),
        },
        BrowserResult::ProfileDetectBrowsers(value) => value
            .browsers
            .iter()
            .map(|item| match &item.browser_profile {
                Some(profile) => format!("{} ({profile})", item.browser_family),
                None => item.browser_family.clone(),
            })
            .collect::<Vec<_>>()
            .join("\n"),
        BrowserResult::GrabCancel(value)
        | BrowserResult::GrabSetMode(value)
        | BrowserResult::GrabAwaitSelection(value)
        | BrowserResult::GrabCaptureSelection(value)
        | BrowserResult::GrabExtractHover(value)
        | BrowserResult::MouseClick(value) => wire_display(
            value
                .value
                .as_ref()
                .map(browser_value)
                .transpose()?
                .as_ref(),
        )?,
        BrowserResult::Viewport(value) => format!(
            "Viewport set to {}×{}{}",
            number_text(value.width),
            number_text(value.height),
            if value.mobile { " (mobile)" } else { "" }
        ),
        BrowserResult::Geolocation(value) => format!(
            "Geolocation set to {}, {}",
            number_text(value.latitude),
            number_text(value.longitude)
        ),
        BrowserResult::SetDevice(_) => {
            format!("Device emulation set to {}", args.require("name")?)
        }
        BrowserResult::SetOffline(_) => {
            format!("Offline mode {}", args.read("state").unwrap_or("toggled"))
        }
        BrowserResult::SetHeaders(_) => "Extra HTTP headers set".to_owned(),
        BrowserResult::SetCredentials(_) => {
            format!("HTTP auth credentials set for {}", args.require("user")?)
        }
        BrowserResult::SetMedia(_) => "Media preferences set".to_owned(),
        BrowserResult::ClipboardRead(_) => pretty(value)?,
        BrowserResult::ClipboardWrite(_) => "Clipboard updated".to_owned(),
        BrowserResult::DialogAccept(_) => "Dialog accepted".to_owned(),
        BrowserResult::DialogDismiss(_) => "Dialog dismissed".to_owned(),
        BrowserResult::InterceptEnable(value) => format!(
            "Interception enabled for: {}",
            if value.patterns.is_empty() {
                "*".to_owned()
            } else {
                value.patterns.join(", ")
            }
        ),
        BrowserResult::InterceptDisable(_) => "Interception disabled".to_owned(),
        BrowserResult::InterceptList(value) => {
            if value.requests.is_empty() {
                "No paused requests".to_owned()
            } else {
                value
                    .requests
                    .iter()
                    .map(|request| {
                        format!(
                            "[{}] {} {} ({})",
                            request.id, request.method, request.url, request.resource_type
                        )
                    })
                    .collect::<Vec<_>>()
                    .join("\n")
            }
        }
        BrowserResult::CaptureStart(_) => "Capture started (console + network)".to_owned(),
        BrowserResult::CaptureStop(_) => "Capture stopped".to_owned(),
        BrowserResult::Console(value) => {
            if value.entries.is_empty() {
                "No console entries".to_owned()
            } else {
                value
                    .entries
                    .iter()
                    .map(|entry| format!("[{}] {}", entry.level, entry.text))
                    .collect::<Vec<_>>()
                    .join("\n")
            }
        }
        BrowserResult::Network(value) => {
            if value.entries.is_empty() {
                "No network entries".to_owned()
            } else {
                value
                    .entries
                    .iter()
                    .map(|entry| {
                        format!(
                            "{} {} ({}, {}B)",
                            number_text(entry.status),
                            entry.url,
                            entry.mime_type,
                            number_text(entry.size)
                        )
                    })
                    .collect::<Vec<_>>()
                    .join("\n")
            }
        }
        BrowserResult::StorageLocalGet(_) | BrowserResult::StorageSessionGet(_) => pretty(value)?,
        BrowserResult::StorageLocalSet(_) => {
            format!("localStorage[\"{}\"] set", args.require("key")?)
        }
        BrowserResult::StorageSessionSet(_) => {
            format!("sessionStorage[\"{}\"] set", args.require("key")?)
        }
        BrowserResult::StorageLocalClear(_) => "localStorage cleared".to_owned(),
        BrowserResult::StorageSessionClear(_) => "sessionStorage cleared".to_owned(),
    })
}

fn browser_value(value: &browser::BrowserValue) -> Result<Value, BrowserCommandError> {
    Ok(
        match value
            .kind
            .as_ref()
            .ok_or(BrowserCommandError::InvalidResponse)?
        {
            Kind::NullValue(_) => Value::Null,
            Kind::BoolValue(value) => Value::Bool(*value),
            Kind::NumberValue(value) => serde_json::Number::from_f64(*value)
                .map(Value::Number)
                .ok_or(BrowserCommandError::InvalidResponse)?,
            Kind::StringValue(value) => Value::String(value.clone()),
            Kind::ListValue(value) => Value::Array(
                value
                    .values
                    .iter()
                    .map(browser_value)
                    .collect::<Result<Vec<_>, _>>()?,
            ),
            Kind::ObjectValue(value) => Value::Object(
                value
                    .entries
                    .iter()
                    .map(|entry| {
                        Ok((
                            entry.key.clone(),
                            browser_value(
                                entry
                                    .value
                                    .as_ref()
                                    .ok_or(BrowserCommandError::InvalidResponse)?,
                            )?,
                        ))
                    })
                    .collect::<Result<Map<_, _>, BrowserCommandError>>()?,
            ),
        },
    )
}

fn tab_value(tab: &browser::BrowserTab) -> Value {
    optional_fields(
        json!({
            "browserPageId": tab.browser_page_id,
            "index": tab.index,
            "url": tab.url,
            "title": tab.title,
            "active": tab.active,
            "worktreeId": tab.worktree_id
        }),
        [
            (
                "loadError",
                tab.load_error.as_ref().map(|error| {
                    json!({
                        "code": error.code,
                        "description": error.description,
                        "validatedUrl": error.validated_url
                    })
                }),
            ),
            (
                "certificateFailure",
                tab.certificate_failure.as_ref().map(|failure| {
                    json!({
                        "challengeId": failure.challenge_id,
                        "browserPageId": failure.browser_page_id,
                        "errorCode": failure.error_code,
                        "error": failure.error,
                        "origin": failure.origin,
                        "displayHost": failure.display_host,
                        "canProceed": failure.can_proceed,
                        "observedAt": failure.observed_at
                    })
                }),
            ),
            ("profileId", tab.profile_id.clone().map(Value::String)),
            ("profileLabel", tab.profile_label.clone().map(Value::String)),
        ],
    )
}

fn profile_value(profile: &browser::BrowserProfile) -> Value {
    json!({
        "id": profile.id,
        "scope": profile.scope,
        "partition": profile.partition,
        "label": profile.label,
        "source": profile.source.as_ref().map(|source| optional_fields(
            json!({ "browserFamily": source.browser_family, "importedAt": source.imported_at }),
            [("profileName", source.profile_name.clone().map(Value::String))]
        ))
    })
}

fn optional_fields<const N: usize>(value: Value, fields: [(&str, Option<Value>); N]) -> Value {
    let mut object = value.as_object().cloned().unwrap_or_default();
    for (name, field) in fields {
        if let Some(field) = field {
            object.insert(name.to_owned(), field);
        }
    }
    Value::Object(object)
}

fn tab_list(result: &browser::TabListResult, show_profile: bool) -> String {
    if result.tabs.is_empty() {
        return "No browser tabs open.".to_owned();
    }
    result
        .tabs
        .iter()
        .map(|tab| {
            let profile = if show_profile {
                format!(
                    "  [{}]",
                    tab.profile_label
                        .as_deref()
                        .or(tab.profile_id.as_deref())
                        .unwrap_or("Unknown")
                )
            } else {
                String::new()
            };
            format!(
                "{}[{}] {}  {} — {}{}",
                if tab.active { "* " } else { "  " },
                number_text(tab.index),
                tab.browser_page_id,
                tab.title,
                tab.url,
                profile
            )
        })
        .collect::<Vec<_>>()
        .join("\n")
}

fn tab_display(tab: &browser::BrowserTab) -> String {
    format!(
        "page: {}\ntitle: {}\nurl: {}\nactive: {}\nworktree: {}\nprofile: {}",
        tab.browser_page_id,
        tab.title,
        tab.url,
        tab.active,
        tab.worktree_id.as_deref().unwrap_or("unknown"),
        tab.profile_label
            .as_deref()
            .or(tab.profile_id.as_deref())
            .unwrap_or("unknown")
    )
}

fn profile_list(result: &browser::ProfileListResult) -> String {
    if result.profiles.is_empty() {
        return "No browser profiles found.".to_owned();
    }
    result
        .profiles
        .iter()
        .map(|profile| {
            format!(
                "{}{}  {}  {}  source:{}",
                if profile.scope == "default" {
                    "* "
                } else {
                    "  "
                },
                profile.id,
                profile.label,
                profile.scope,
                profile
                    .source
                    .as_ref()
                    .map(|source| source.browser_family.as_str())
                    .unwrap_or("none")
            )
        })
        .collect::<Vec<_>>()
        .join("\n")
}

fn pretty(value: Option<&Value>) -> Result<String, BrowserCommandError> {
    value
        .map(serde_json::to_string_pretty)
        .transpose()?
        .ok_or(BrowserCommandError::InvalidResponse)
}

fn wire_display(value: Option<&Value>) -> Result<String, BrowserCommandError> {
    match value {
        Some(Value::String(value)) => Ok(value.clone()),
        Some(value) => Ok(serde_json::to_string_pretty(value)?),
        None => Ok("undefined".to_owned()),
    }
}

fn javascript_string(value: Option<&Value>) -> String {
    match value {
        None => "undefined".to_owned(),
        Some(Value::Null) => "null".to_owned(),
        Some(Value::Bool(value)) => value.to_string(),
        Some(Value::Number(value)) => value.to_string(),
        Some(Value::String(value)) => value.clone(),
        Some(Value::Array(values)) => values
            .iter()
            .map(|value| javascript_string(Some(value)))
            .collect::<Vec<_>>()
            .join(","),
        Some(Value::Object(_)) => "[object Object]".to_owned(),
    }
}

fn number_text(value: f64) -> String {
    if value == 0.0 {
        return "0".to_owned();
    }
    value.to_string()
}
