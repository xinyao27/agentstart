use super::BrowserCommandError;

const COMMANDS: &[&str] = &[
    "back",
    "capture start",
    "capture stop",
    "check",
    "clear",
    "click",
    "clipboard read",
    "clipboard write",
    "console",
    "cookie delete",
    "cookie get",
    "cookie set",
    "dblclick",
    "dialog accept",
    "dialog dismiss",
    "download",
    "drag",
    "eval",
    "exec",
    "fill",
    "find",
    "focus",
    "forward",
    "full-screenshot",
    "geolocation",
    "get",
    "goto",
    "highlight",
    "hover",
    "inserttext",
    "intercept disable",
    "intercept enable",
    "intercept list",
    "is",
    "keypress",
    "mouse down",
    "mouse move",
    "mouse up",
    "mouse wheel",
    "network",
    "pdf",
    "reload",
    "screenshot",
    "scroll",
    "scrollintoview",
    "select",
    "select-all",
    "set credentials",
    "set device",
    "set headers",
    "set media",
    "set offline",
    "snapshot",
    "storage local clear",
    "storage local get",
    "storage local set",
    "storage session clear",
    "storage session get",
    "storage session set",
    "tab close",
    "tab create",
    "tab current",
    "tab list",
    "tab profile clone",
    "tab profile create",
    "tab profile delete",
    "tab profile list",
    "tab profile set",
    "tab profile show",
    "tab profile use-default",
    "tab show",
    "tab switch",
    "type",
    "uncheck",
    "upload",
    "viewport",
    "wait",
];

pub(super) fn is_root(value: &str) -> bool {
    COMMANDS
        .iter()
        .any(|command| command.split_once(' ').map_or(*command, |(root, _)| root) == value)
}

pub(super) fn is_command(value: &str) -> bool {
    COMMANDS.contains(&value)
}

pub(super) fn print(command: &str) -> Result<(), BrowserCommandError> {
    let usage = usage(command)
        .ok_or_else(|| BrowserCommandError::CommandUnsupported(command.to_owned()))?;
    println!("Usage: {usage}");
    Ok(())
}

fn usage(command: &str) -> Option<&'static str> {
    Some(match command {
        "back" => "back [--page <id>] [--worktree <selector>] [--json]",
        "capture start" => "capture start [--page <id>] [--worktree <selector>] [--json]",
        "capture stop" => "capture stop [--page <id>] [--worktree <selector>] [--json]",
        "check" => "check --element <ref> [--page <id>] [--worktree <selector>] [--json]",
        "clear" => "clear --element <ref> [--page <id>] [--worktree <selector>] [--json]",
        "click" => "click --element <ref> [--page <id>] [--worktree <selector>] [--json]",
        "clipboard read" => "clipboard read [--page <id>] [--worktree <selector>] [--json]",
        "clipboard write" => {
            "clipboard write --text <text> [--page <id>] [--worktree <selector>] [--json]"
        }
        "console" => "console [--limit <n>] [--page <id>] [--worktree <selector>] [--json]",
        "cookie delete" => {
            "cookie delete --name <name> [--url <url>] [--page <id>] [--worktree <selector>] [--json]"
        }
        "cookie get" => "cookie get [--url <url>] [--page <id>] [--worktree <selector>] [--json]",
        "cookie set" => {
            "cookie set --name <name> --value <value> [--url <url>] [--domain <domain>] [--path <path>] [--secure] [--httpOnly] [--sameSite <value>] [--expires <epoch>] [--page <id>] [--worktree <selector>] [--json]"
        }
        "dblclick" => "dblclick --element <ref> [--page <id>] [--worktree <selector>] [--json]",
        "dialog accept" => {
            "dialog accept [--text <text>] [--page <id>] [--worktree <selector>] [--json]"
        }
        "dialog dismiss" => "dialog dismiss [--page <id>] [--worktree <selector>] [--json]",
        "download" => {
            "download --selector <ref> --path <path> [--page <id>] [--worktree <selector>] [--json]"
        }
        "drag" => "drag --from <ref> --to <ref> [--page <id>] [--worktree <selector>] [--json]",
        "eval" => "eval --expression <js> [--page <id>] [--worktree <selector>] [--json]",
        "exec" => "exec --command <command> [--page <id>] [--worktree <selector>] [--json]",
        "fill" => {
            "fill --element <ref> --value <text> [--page <id>] [--worktree <selector>] [--json]"
        }
        "find" => {
            "find --locator <type> --value <text> --action <action> [--text <text>] [--page <id>] [--worktree <selector>] [--json]"
        }
        "focus" => "focus --element <ref> [--page <id>] [--worktree <selector>] [--json]",
        "forward" => "forward [--page <id>] [--worktree <selector>] [--json]",
        "full-screenshot" => {
            "full-screenshot [--format <png|jpeg>] [--page <id>] [--worktree <selector>] [--json]"
        }
        "geolocation" => {
            "geolocation --latitude <lat> --longitude <lon> [--accuracy <n>] [--page <id>] [--worktree <selector>] [--json]"
        }
        "get" => {
            "get --what <property> [--element <ref>] [--page <id>] [--worktree <selector>] [--json]"
        }
        "goto" => "goto --url <url> [--page <id>] [--worktree <selector>] [--json]",
        "highlight" => "highlight --selector <ref> [--page <id>] [--worktree <selector>] [--json]",
        "hover" => "hover --element <ref> [--page <id>] [--worktree <selector>] [--json]",
        "inserttext" => "inserttext --text <text> [--page <id>] [--worktree <selector>] [--json]",
        "intercept disable" => "intercept disable [--page <id>] [--worktree <selector>] [--json]",
        "intercept enable" => {
            "intercept enable [--patterns <glob,...>] [--page <id>] [--worktree <selector>] [--json]"
        }
        "intercept list" => "intercept list [--page <id>] [--worktree <selector>] [--json]",
        "is" => "is --what <state> --element <ref> [--page <id>] [--worktree <selector>] [--json]",
        "keypress" => "keypress --key <name> [--page <id>] [--worktree <selector>] [--json]",
        "mouse down" => {
            "mouse down [--button <left|right|middle>] [--page <id>] [--worktree <selector>] [--json]"
        }
        "mouse move" => "mouse move --x <n> --y <n> [--page <id>] [--worktree <selector>] [--json]",
        "mouse up" => {
            "mouse up [--button <left|right|middle>] [--page <id>] [--worktree <selector>] [--json]"
        }
        "mouse wheel" => {
            "mouse wheel --dy <n> [--dx <n>] [--page <id>] [--worktree <selector>] [--json]"
        }
        "network" => "network [--limit <n>] [--page <id>] [--worktree <selector>] [--json]",
        "pdf" => "pdf [--page <id>] [--worktree <selector>] [--json]",
        "reload" => "reload [--page <id>] [--worktree <selector>] [--json]",
        "screenshot" => {
            "screenshot [--format <png|jpeg>] [--page <id>] [--worktree <selector>] [--json]"
        }
        "scroll" => {
            "scroll --direction <up|down> [--amount <pixels>] [--page <id>] [--worktree <selector>] [--json]"
        }
        "scrollintoview" => {
            "scrollintoview --element <ref> [--page <id>] [--worktree <selector>] [--json]"
        }
        "select" => {
            "select --element <ref> --value <value> [--page <id>] [--worktree <selector>] [--json]"
        }
        "select-all" => "select-all --element <ref> [--page <id>] [--worktree <selector>] [--json]",
        "set credentials" => {
            "set credentials --user <user> --pass <pass> [--page <id>] [--worktree <selector>] [--json]"
        }
        "set device" => "set device --name <device> [--page <id>] [--worktree <selector>] [--json]",
        "set headers" => {
            "set headers --headers <json> [--page <id>] [--worktree <selector>] [--json]"
        }
        "set media" => {
            "set media [--color-scheme <dark|light>] [--reduced-motion <reduce|no-preference>] [--page <id>] [--worktree <selector>] [--json]"
        }
        "set offline" => {
            "set offline [--state <on|off>] [--page <id>] [--worktree <selector>] [--json]"
        }
        "snapshot" => "snapshot [--page <id>] [--worktree <selector>] [--json]",
        "storage local clear" => {
            "storage local clear [--page <id>] [--worktree <selector>] [--json]"
        }
        "storage local get" => {
            "storage local get --key <key> [--page <id>] [--worktree <selector>] [--json]"
        }
        "storage local set" => {
            "storage local set --key <key> --value <value> [--page <id>] [--worktree <selector>] [--json]"
        }
        "storage session clear" => {
            "storage session clear [--page <id>] [--worktree <selector>] [--json]"
        }
        "storage session get" => {
            "storage session get --key <key> [--page <id>] [--worktree <selector>] [--json]"
        }
        "storage session set" => {
            "storage session set --key <key> --value <value> [--page <id>] [--worktree <selector>] [--json]"
        }
        "tab close" => "tab close [--index <n>] [--page <id>] [--json]",
        "tab create" => {
            "tab create [--url <url>] [--worktree <selector>] [--profile <id>] [--json]"
        }
        "tab current" => "tab current [--worktree <selector|all>] [--json]",
        "tab list" => "tab list [--worktree <selector|all>] [--show-profile] [--json]",
        "tab profile clone" => {
            "tab profile clone --profile <id> [--page <id>] [--worktree <selector>] [--json]"
        }
        "tab profile create" => {
            "tab profile create --label <name> [--scope <isolated|imported>] [--json]"
        }
        "tab profile delete" => "tab profile delete --profile <id> [--json]",
        "tab profile list" => "tab profile list [--json]",
        "tab profile set" => {
            "tab profile set (--page <id> | --worktree <selector>) --profile <id> [--json]"
        }
        "tab profile show" => "tab profile show --page <id> [--worktree <selector>] [--json]",
        "tab profile use-default" => {
            "tab profile use-default --page <id> [--worktree <selector>] [--json]"
        }
        "tab show" => "tab show --page <id> [--worktree <selector>] [--json]",
        "tab switch" => {
            "tab switch (--index <n> | --page <id>) [--worktree <selector>] [--focus] [--json]"
        }
        "type" => "type --input <text> [--page <id>] [--worktree <selector>] [--json]",
        "uncheck" => "uncheck --element <ref> [--page <id>] [--worktree <selector>] [--json]",
        "upload" => {
            "upload --element <ref> --files <path,...> [--page <id>] [--worktree <selector>] [--json]"
        }
        "viewport" => {
            "viewport --width <w> --height <h> [--scale <n>] [--mobile] [--page <id>] [--worktree <selector>] [--json]"
        }
        "wait" => {
            "wait [--selector <sel>] [--timeout <ms>] [--text <text>] [--url <pattern>] [--load <state>] [--fn <js>] [--state <hidden|visible>] [--page <id>] [--worktree <selector>] [--json]"
        }
        _ => return None,
    })
}
