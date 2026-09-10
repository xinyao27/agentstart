use agentstart_protocol::runtime::v1 as browser;
use agentstart_protocol::runtime::v1::execute_request::Command;
use serde_json::Number;

use super::BrowserCommandError;

pub(super) fn parse(
    input: &str,
    target: Option<browser::BrowserTarget>,
) -> Result<Command, BrowserCommandError> {
    let mut args = strip_transport_args(parse_shell_args(input.trim())?);
    if args.is_empty() {
        return Err(error("browser_exec_command_missing"));
    }
    let verb = args.remove(0);
    command(&verb, &args, target)
}

fn command(
    verb: &str,
    args: &[String],
    target: Option<browser::BrowserTarget>,
) -> Result<Command, BrowserCommandError> {
    Ok(match verb {
        "snapshot" | "read" => Command::Snapshot(browser::TargetCommand { target }),
        "open" | "goto" => Command::Goto(browser::UrlCommand {
            target,
            url: arg(args, 0, false)?.to_owned(),
        }),
        "back" => Command::Back(browser::TargetCommand { target }),
        "forward" => Command::Forward(browser::TargetCommand { target }),
        "reload" => Command::Reload(browser::TargetCommand { target }),
        "click" => element(Command::Click, target, arg(args, 0, false)?),
        "dblclick" => element(Command::DoubleClick, target, arg(args, 0, false)?),
        "focus" => element(Command::Focus, target, arg(args, 0, false)?),
        "hover" => element(Command::Hover, target, arg(args, 0, false)?),
        "scrollintoview" => element(Command::ScrollIntoView, target, arg(args, 0, false)?),
        "highlight" => Command::Highlight(browser::SelectorCommand {
            target,
            selector: arg(args, 0, false)?.to_owned(),
        }),
        "fill" => Command::Fill(browser::ElementValueCommand {
            target,
            element: arg(args, 0, false)?.to_owned(),
            value: arg(args, 1, true)?.to_owned(),
        }),
        "select" => Command::Select(browser::ElementValueCommand {
            target,
            element: arg(args, 0, false)?.to_owned(),
            value: arg(args, 1, true)?.to_owned(),
        }),
        "type" => Command::Type(browser::TextInputCommand {
            target,
            input: arg(args, 0, false)?.to_owned(),
        }),
        "press" => Command::Keypress(browser::KeyCommand {
            target,
            key: arg(args, 0, false)?.to_owned(),
        }),
        "check" | "uncheck" => Command::Check(browser::CheckCommand {
            target,
            element: arg(args, 0, false)?.to_owned(),
            checked: verb == "check",
        }),
        "drag" => Command::Drag(browser::DragCommand {
            target,
            from: arg(args, 0, false)?.to_owned(),
            to: arg(args, 1, false)?.to_owned(),
        }),
        "eval" => Command::Eval(browser::EvalCommand {
            target,
            expression: arg(args, 0, false)?.to_owned(),
        }),
        "scroll" => scroll(args, target)?,
        "wait" => wait(args, target),
        "get" => Command::Get(browser::GetCommand {
            target,
            what: arg(args, 0, false)?.to_owned(),
            selector: args.get(1).cloned(),
        }),
        "is" => Command::Is(browser::IsCommand {
            target,
            what: arg(args, 0, false)?.to_owned(),
            selector: arg(args, 1, false)?.to_owned(),
        }),
        "find" => find(args, target)?,
        "console" | "errors" => Command::Console(browser::LimitCommand {
            target,
            limit: number(flag(args, "--limit")).map(number_value),
        }),
        "keyboard" => keyboard(args, target)?,
        "mouse" => mouse(args, target)?,
        "tab" => tab(args, target)?,
        "storage" => storage(args, target)?,
        "pushstate" => Command::Eval(browser::EvalCommand {
            target,
            expression: format!(
                "history.pushState({{}}, '', {}); location.href",
                serde_json::to_string(arg(args, 0, false)?)?
            ),
        }),
        "vitals" => Command::Eval(browser::EvalCommand {
            target,
            expression: "JSON.stringify(performance.getEntriesByType('navigation').map(({domContentLoadedEventEnd,loadEventEnd,responseStart})=>({domContentLoadedEventEnd,loadEventEnd,responseStart})))".to_owned(),
        }),
        _ => return Err(error(&format!("browser_exec_command_unsupported:{verb}"))),
    })
}

fn scroll(
    args: &[String],
    target: Option<browser::BrowserTarget>,
) -> Result<Command, BrowserCommandError> {
    let direction = match args.first().map(String::as_str) {
        Some(value @ ("up" | "down")) => value,
        _ => return Err(error("browser_exec_scroll_direction_invalid")),
    };
    Ok(Command::Scroll(browser::ScrollCommand {
        target,
        direction: direction.to_owned(),
        amount: number(args.get(1).map(String::as_str)).map(number_value),
    }))
}

fn wait(args: &[String], target: Option<browser::BrowserTarget>) -> Command {
    let first = args
        .first()
        .filter(|value| !value.starts_with("--"))
        .map(String::as_str);
    let first_number = number(first).map(number_value);
    Command::Wait(browser::WaitCommand {
        target,
        selector: first_number
            .is_none()
            .then(|| first.map(str::to_owned))
            .flatten(),
        timeout: number(flag(args, "--timeout"))
            .map(number_value)
            .or(first_number),
        text: owned_flag(args, "--text"),
        url: owned_flag(args, "--url"),
        load: owned_flag(args, "--load"),
        function: owned_flag(args, "--fn"),
        state: owned_flag(args, "--state"),
    })
}

fn find(
    args: &[String],
    target: Option<browser::BrowserTarget>,
) -> Result<Command, BrowserCommandError> {
    Ok(Command::Find(browser::FindCommand {
        target,
        action: flag(args, "--action")
            .unwrap_or(arg(args, 2, false)?)
            .to_owned(),
        locator: flag(args, "--locator")
            .unwrap_or(arg(args, 0, false)?)
            .to_owned(),
        text: owned_flag(args, "--text"),
        value: flag(args, "--value")
            .unwrap_or(arg(args, 1, false)?)
            .to_owned(),
    }))
}

fn keyboard(
    args: &[String],
    target: Option<browser::BrowserTarget>,
) -> Result<Command, BrowserCommandError> {
    if args.first().map(String::as_str) != Some("inserttext") {
        return Err(error("browser_exec_keyboard_command_unsupported"));
    }
    Ok(Command::InsertText(browser::TextCommand {
        target,
        text: arg(args, 1, false)?.to_owned(),
    }))
}

fn mouse(
    args: &[String],
    target: Option<browser::BrowserTarget>,
) -> Result<Command, BrowserCommandError> {
    match args.first().map(String::as_str) {
        Some("move") => Ok(Command::MouseMove(browser::MouseMoveCommand {
            target,
            x: required_number(args.get(1).map(String::as_str))?,
            y: required_number(args.get(2).map(String::as_str))?,
        })),
        Some("down") => Ok(Command::MouseDown(browser::MouseButtonCommand {
            target,
            button: args.get(1).cloned(),
        })),
        Some("up") => Ok(Command::MouseUp(browser::MouseButtonCommand {
            target,
            button: args.get(1).cloned(),
        })),
        Some("wheel") => Ok(Command::MouseWheel(browser::MouseWheelCommand {
            target,
            dx: number(flag(args, "--dx")).map(number_value),
            dy: number(flag(args, "--dy"))
                .or_else(|| number(args.get(1).map(String::as_str)))
                .map(number_value)
                .ok_or_else(|| error("browser_exec_number_invalid"))?,
        })),
        _ => Err(error("browser_exec_mouse_command_unsupported")),
    }
}

fn tab(
    args: &[String],
    mut target: Option<browser::BrowserTarget>,
) -> Result<Command, BrowserCommandError> {
    match args.first().map(String::as_str) {
        Some("list") => {
            remove_page(&mut target);
            Ok(Command::TabList(browser::TargetCommand { target }))
        }
        Some("current") => {
            remove_page(&mut target);
            Ok(Command::TabCurrent(browser::TargetCommand { target }))
        }
        Some("new" | "create") => {
            remove_page(&mut target);
            Ok(Command::TabCreate(browser::TabCreateCommand {
                target,
                url: args.get(1).cloned(),
                profile_id: None,
            }))
        }
        Some("switch") => {
            remove_page(&mut target);
            if let Some(page) = flag(args, "--page") {
                target.get_or_insert_default().page = Some(page.to_owned());
            }
            Ok(Command::TabSwitch(browser::TabSwitchCommand {
                target,
                index: number(args.get(1).map(String::as_str)).map(number_value),
                focus: false,
            }))
        }
        Some("close") => Ok(Command::TabClose(browser::TabCloseCommand {
            target,
            index: number(args.get(1).map(String::as_str)).map(number_value),
        })),
        _ => Err(error("browser_exec_tab_command_unsupported")),
    }
}

fn storage(
    args: &[String],
    target: Option<browser::BrowserTarget>,
) -> Result<Command, BrowserCommandError> {
    match (
        args.first().map(String::as_str),
        args.get(1).map(String::as_str),
    ) {
        (Some("local"), Some("get")) => Ok(Command::StorageLocalGet(storage_key(args, target)?)),
        (Some("local"), Some("set")) => Ok(Command::StorageLocalSet(storage_set(args, target)?)),
        (Some("local"), Some("clear")) => Ok(Command::StorageLocalClear(browser::TargetCommand {
            target,
        })),
        (Some("session"), Some("get")) => {
            Ok(Command::StorageSessionGet(storage_key(args, target)?))
        }
        (Some("session"), Some("set")) => {
            Ok(Command::StorageSessionSet(storage_set(args, target)?))
        }
        (Some("session"), Some("clear")) => {
            Ok(Command::StorageSessionClear(browser::TargetCommand {
                target,
            }))
        }
        _ => Err(error("browser_exec_storage_command_unsupported")),
    }
}

fn storage_key(
    args: &[String],
    target: Option<browser::BrowserTarget>,
) -> Result<browser::StorageKeyCommand, BrowserCommandError> {
    Ok(browser::StorageKeyCommand {
        target,
        key: arg(args, 2, false)?.to_owned(),
    })
}

fn storage_set(
    args: &[String],
    target: Option<browser::BrowserTarget>,
) -> Result<browser::StorageSetCommand, BrowserCommandError> {
    Ok(browser::StorageSetCommand {
        target,
        key: arg(args, 2, false)?.to_owned(),
        value: arg(args, 3, true)?.to_owned(),
    })
}

fn element(
    constructor: fn(browser::ElementCommand) -> Command,
    target: Option<browser::BrowserTarget>,
    element: &str,
) -> Command {
    constructor(browser::ElementCommand {
        target,
        element: element.to_owned(),
    })
}

fn remove_page(target: &mut Option<browser::BrowserTarget>) {
    if let Some(target) = target {
        target.page = None;
    }
}

fn arg(args: &[String], index: usize, allow_empty: bool) -> Result<&str, BrowserCommandError> {
    args.get(index)
        .map(String::as_str)
        .filter(|value| allow_empty || !value.is_empty())
        .ok_or_else(|| error(&format!("browser_exec_argument_missing:{index}")))
}

fn flag<'a>(args: &'a [String], name: &str) -> Option<&'a str> {
    args.iter()
        .find_map(|arg| arg.strip_prefix(&format!("{name}=")))
        .or_else(|| {
            args.iter()
                .position(|arg| arg == name)
                .and_then(|index| args.get(index + 1).map(String::as_str))
        })
}

fn owned_flag(args: &[String], name: &str) -> Option<String> {
    flag(args, name).map(str::to_owned)
}

fn number(value: Option<&str>) -> Option<Number> {
    let value = value?.trim();
    let parsed = if value.is_empty() {
        Some(0.0)
    } else if let Some(digits) = value
        .strip_prefix("0x")
        .or_else(|| value.strip_prefix("0X"))
    {
        radix_number(digits, 16)
    } else if let Some(digits) = value
        .strip_prefix("0b")
        .or_else(|| value.strip_prefix("0B"))
    {
        radix_number(digits, 2)
    } else if let Some(digits) = value
        .strip_prefix("0o")
        .or_else(|| value.strip_prefix("0O"))
    {
        radix_number(digits, 8)
    } else {
        value.parse::<f64>().ok()
    };
    parsed
        .filter(|value| value.is_finite())
        .and_then(Number::from_f64)
}

fn radix_number(digits: &str, radix: u32) -> Option<f64> {
    (!digits.is_empty()).then_some(())?;
    digits.chars().try_fold(0.0_f64, |number, digit| {
        digit
            .to_digit(radix)
            .map(|digit| number.mul_add(f64::from(radix), f64::from(digit)))
    })
}

fn number_value(value: Number) -> f64 {
    value.as_f64().unwrap_or_default()
}

fn required_number(value: Option<&str>) -> Result<f64, BrowserCommandError> {
    number(value)
        .map(number_value)
        .ok_or_else(|| error("browser_exec_number_invalid"))
}

fn parse_shell_args(input: &str) -> Result<Vec<String>, BrowserCommandError> {
    let mut args = Vec::new();
    let mut current = String::new();
    let mut quote = None;
    for character in input.chars() {
        if matches!(character, '\'' | '"') && (quote.is_none() || quote == Some(character)) {
            quote = if quote.is_some() {
                None
            } else {
                Some(character)
            };
        } else if character.is_whitespace() && quote.is_none() {
            if !current.is_empty() {
                args.push(std::mem::take(&mut current));
            }
        } else {
            current.push(character);
        }
    }
    if quote.is_some() {
        return Err(error("browser_exec_quote_unclosed"));
    }
    if !current.is_empty() {
        args.push(current);
    }
    Ok(args)
}

fn strip_transport_args(args: Vec<String>) -> Vec<String> {
    args.iter()
        .enumerate()
        .filter(|(index, arg)| {
            let previous = index
                .checked_sub(1)
                .and_then(|position| args.get(position))
                .map(String::as_str);
            !arg.starts_with("--cdp=")
                && !arg.starts_with("--session=")
                && previous != Some("--cdp")
                && previous != Some("--session")
                && *arg != "--cdp"
                && *arg != "--session"
        })
        .map(|(_, value)| value.clone())
        .collect()
}

fn error(message: &str) -> BrowserCommandError {
    BrowserCommandError::Exec(message.to_owned())
}
