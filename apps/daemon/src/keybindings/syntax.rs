mod token;

use crate::protocol::KeybindingDescriptor;

use super::model::definition;
use token::{normalize_key, safe_bare_key};

#[derive(Clone, Copy, Debug, Eq, Hash, PartialEq)]
pub(super) enum Modifier {
    Mod,
    Cmd,
    Ctrl,
    Alt,
    Shift,
}

#[derive(Clone, Debug, Default)]
pub(super) struct ParsedBinding {
    pub(super) is_mod: bool,
    pub(super) is_meta: bool,
    pub(super) is_control: bool,
    pub(super) is_alt: bool,
    pub(super) is_shift: bool,
    pub(super) key: String,
    pub(super) double_tap: Option<Modifier>,
}

pub(super) fn normalize_array(
    definitions: &[KeybindingDescriptor],
    action_id: &str,
    bindings: &[String],
) -> Result<Vec<String>, String> {
    let mut output = Vec::new();
    for binding in bindings {
        for normalized in normalize_list(definitions, action_id, binding)? {
            if !output.contains(&normalized) {
                output.push(normalized);
            }
        }
    }
    Ok(output)
}

pub(super) fn normalize_list(
    definitions: &[KeybindingDescriptor],
    action_id: &str,
    bindings: &str,
) -> Result<Vec<String>, String> {
    let trimmed = bindings.trim();
    if trimmed.is_empty() {
        return Ok(Vec::new());
    }
    let allow_bare = definition(definitions, action_id)
        .is_some_and(|definition| definition.allow_bare_keybindings);
    let mut output = Vec::new();
    for binding in trimmed.split(',') {
        let normalized = normalize_binding(binding, allow_bare)?;
        let normalized = if is_digit_index(action_id) {
            canonical_digit_index(&normalized)?
        } else {
            normalized
        };
        if !output.contains(&normalized) {
            output.push(normalized);
        }
    }
    Ok(output)
}

pub(super) fn parse(binding: &str) -> Option<ParsedBinding> {
    let parts = binding
        .split('+')
        .map(str::trim)
        .filter(|part| !part.is_empty())
        .collect::<Vec<_>>();
    if parts.is_empty() {
        return None;
    }
    if parts
        .iter()
        .any(|part| part.eq_ignore_ascii_case("doubletap"))
    {
        return parse_double_tap(&parts);
    }
    let mut parsed = ParsedBinding::default();
    for part in parts {
        if let Some(modifier) = parse_modifier(part) {
            apply_modifier(&mut parsed, modifier);
        } else {
            if !parsed.key.is_empty() {
                return None;
            }
            parsed.key = normalize_key(part)?;
        }
    }
    (!parsed.key.is_empty()).then_some(parsed)
}

pub(super) fn canonical(parsed: &ParsedBinding) -> String {
    if let Some(modifier) = parsed.double_tap {
        return format!("DoubleTap+{}", modifier_name(modifier));
    }
    let mut parts = Vec::new();
    if parsed.is_mod {
        parts.push("Mod");
    }
    if parsed.is_meta {
        parts.push("Cmd");
    }
    if parsed.is_control {
        parts.push("Ctrl");
    }
    if parsed.is_alt {
        parts.push("Alt");
    }
    if parsed.is_shift {
        parts.push("Shift");
    }
    parts.push(&parsed.key);
    parts.join("+")
}

pub(super) fn is_digit_index(action_id: &str) -> bool {
    matches!(action_id, "tab.selectByIndex" | "workspace.selectByIndex")
}

pub(super) fn normalize_binding(binding: &str, allow_bare: bool) -> Result<String, String> {
    let parsed =
        parse(binding).ok_or_else(|| "Use a shortcut like Ctrl+Shift+P or Cmd+K.".to_owned())?;
    if parsed.is_mod && (parsed.is_meta || parsed.is_control) {
        return Err("Use either Mod or a platform-specific modifier, not both.".to_owned());
    }
    if parsed.double_tap.is_some() {
        return Ok(canonical(&parsed));
    }
    let shift_insert = parsed.is_shift && parsed.key == "Insert";
    let bare_allowed = allow_bare && safe_bare_key(&parsed);
    if !parsed.is_mod
        && !parsed.is_meta
        && !parsed.is_control
        && !parsed.is_alt
        && !shift_insert
        && !bare_allowed
    {
        return Err("Include at least one modifier key.".to_owned());
    }
    Ok(canonical(&parsed))
}

pub(super) fn canonical_digit_index(binding: &str) -> Result<String, String> {
    let Some(mut parsed) = parse(binding) else {
        return Err(digit_error());
    };
    if parsed.double_tap.is_some()
        || parsed.key.len() != 1
        || !matches!(parsed.key.as_bytes()[0], b'1'..=b'9')
    {
        return Err(digit_error());
    }
    parsed.key = "1".to_owned();
    Ok(canonical(&parsed))
}

fn digit_error() -> String {
    "Pick a number key 1–9 with a modifier, like Cmd+1 or Ctrl+1.".to_owned()
}

fn parse_double_tap(parts: &[&str]) -> Option<ParsedBinding> {
    let mut saw_double_tap = false;
    let mut modifiers = Vec::new();
    for part in parts {
        if part.eq_ignore_ascii_case("doubletap") {
            if saw_double_tap {
                return None;
            }
            saw_double_tap = true;
        } else {
            modifiers.push(parse_modifier(part)?);
        }
    }
    if modifiers.is_empty() {
        return None;
    }
    let mut parsed = ParsedBinding::default();
    for modifier in &modifiers {
        apply_modifier(&mut parsed, *modifier);
    }
    if parsed.is_mod && (parsed.is_meta || parsed.is_control) {
        parsed.double_tap = Some(Modifier::Mod);
        return Some(parsed);
    }
    if modifiers.len() != 1 {
        return None;
    }
    parsed.double_tap = modifiers.first().copied();
    Some(parsed)
}

fn parse_modifier(part: &str) -> Option<Modifier> {
    let lower = part.to_lowercase();
    match lower.as_str() {
        "mod" | "cmdorctrl" | "commandorcontrol" => Some(Modifier::Mod),
        "cmd" | "command" | "meta" => Some(Modifier::Cmd),
        "ctrl" | "control" => Some(Modifier::Ctrl),
        "alt" | "option" | "opt" => Some(Modifier::Alt),
        "shift" => Some(Modifier::Shift),
        _ => match part {
            "⌘" => Some(Modifier::Cmd),
            "⌃" => Some(Modifier::Ctrl),
            "⌥" => Some(Modifier::Alt),
            "⇧" => Some(Modifier::Shift),
            _ => None,
        },
    }
}

fn apply_modifier(parsed: &mut ParsedBinding, modifier: Modifier) {
    match modifier {
        Modifier::Mod => parsed.is_mod = true,
        Modifier::Cmd => parsed.is_meta = true,
        Modifier::Ctrl => parsed.is_control = true,
        Modifier::Alt => parsed.is_alt = true,
        Modifier::Shift => parsed.is_shift = true,
    }
}

fn modifier_name(modifier: Modifier) -> &'static str {
    match modifier {
        Modifier::Mod => "Mod",
        Modifier::Cmd => "Cmd",
        Modifier::Ctrl => "Ctrl",
        Modifier::Alt => "Alt",
        Modifier::Shift => "Shift",
    }
}
