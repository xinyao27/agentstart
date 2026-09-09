use crate::protocol::KeybindingDescriptor;

use super::model::{KeybindingOverrides, KeybindingPlatform};
use super::syntax::{
    Modifier, ParsedBinding, canonical_digit_index, is_digit_index, normalize_binding, parse,
};

pub(super) struct Conflict {
    pub(super) binding: String,
    pub(super) action_ids: Vec<String>,
}

struct Owners {
    identity: String,
    binding: String,
    action_ids: Vec<String>,
}

pub(super) fn find(
    definitions: &[KeybindingDescriptor],
    platform: KeybindingPlatform,
    overrides: &KeybindingOverrides,
) -> Vec<Conflict> {
    let customized = overrides
        .iter()
        .map(|(action_id, _)| action_id)
        .collect::<Vec<_>>();
    let mut owners = Vec::<Owners>::new();
    for definition in definitions {
        for binding in effective_bindings(definition, platform, overrides) {
            let mut groups = vec![
                definition
                    .conflict_group
                    .as_deref()
                    .unwrap_or(&definition.scope),
            ];
            if definition.conflict_group.is_some() {
                groups.push(&definition.scope);
            }
            for group in groups {
                for identity in identities(&definition.id, &binding, platform) {
                    let identity = format!("{group}\0{identity}");
                    if let Some(current) = owners
                        .iter_mut()
                        .find(|current| current.identity == identity)
                    {
                        if !is_digit_index(&definition.id)
                            && current
                                .action_ids
                                .iter()
                                .any(|action_id| is_digit_index(action_id))
                        {
                            current.binding.clone_from(&binding);
                        }
                        if !current.action_ids.contains(&definition.id) {
                            current.action_ids.push(definition.id.clone());
                        }
                    } else {
                        owners.push(Owners {
                            binding: binding.clone(),
                            identity,
                            action_ids: vec![definition.id.clone()],
                        });
                    }
                }
            }
        }
    }
    let mut conflicts = Vec::<Conflict>::new();
    for owner in owners {
        if owner.action_ids.len() < 2
            || !owner
                .action_ids
                .iter()
                .any(|action_id| customized.contains(&action_id.as_str()))
        {
            continue;
        }
        if conflicts.iter().any(|conflict| {
            conflict.binding == owner.binding && conflict.action_ids == owner.action_ids
        }) {
            continue;
        }
        conflicts.push(Conflict {
            binding: owner.binding,
            action_ids: owner.action_ids,
        });
    }
    conflicts
}

pub(super) fn format_binding(binding: &str, platform: KeybindingPlatform) -> String {
    let Some(parsed) = parse(binding) else {
        return binding.to_owned();
    };
    if let Some(modifier) = parsed.double_tap {
        let label = modifier_label(modifier, platform);
        return format!("{label} {label}");
    }
    let mut parts = Vec::new();
    if parsed.is_mod {
        parts.push(if platform == KeybindingPlatform::Darwin {
            "⌘"
        } else {
            "Ctrl"
        });
    }
    if parsed.is_meta {
        parts.push(if platform == KeybindingPlatform::Darwin {
            "⌘"
        } else {
            "Cmd"
        });
    }
    if parsed.is_control {
        parts.push(if platform == KeybindingPlatform::Darwin {
            "⌃"
        } else {
            "Ctrl"
        });
    }
    if parsed.is_alt {
        parts.push(if platform == KeybindingPlatform::Darwin {
            "⌥"
        } else {
            "Alt"
        });
    }
    if parsed.is_shift {
        parts.push(if platform == KeybindingPlatform::Darwin {
            "⇧"
        } else {
            "Shift"
        });
    }
    let key = format_key(&parsed.key);
    parts.push(&key);
    parts.join(if platform == KeybindingPlatform::Darwin {
        ""
    } else {
        "+"
    })
}

fn effective_bindings(
    definition: &KeybindingDescriptor,
    platform: KeybindingPlatform,
    overrides: &KeybindingOverrides,
) -> Vec<String> {
    if let Some(bindings) = overrides.get(&definition.id) {
        let mut output = Vec::new();
        for binding in bindings {
            let normalized = normalize_binding(binding, definition.allow_bare_keybindings)
                .and_then(|binding| {
                    if is_digit_index(&definition.id) {
                        canonical_digit_index(&binding)
                    } else {
                        Ok(binding)
                    }
                });
            if let Ok(binding) = normalized
                && !output.contains(&binding)
            {
                output.push(binding);
            }
        }
        return output;
    }
    let bindings = match platform {
        KeybindingPlatform::Darwin => &definition.default_bindings.darwin,
        KeybindingPlatform::Linux => &definition.default_bindings.linux,
        KeybindingPlatform::Win32 => &definition.default_bindings.win32,
    };
    bindings
        .iter()
        .map(|binding| {
            normalize_binding(binding, definition.allow_bare_keybindings)
                .unwrap_or_else(|_| binding.clone())
        })
        .collect()
}

fn identities(action_id: &str, binding: &str, platform: KeybindingPlatform) -> Vec<String> {
    let exact = identity(binding, platform);
    if !is_digit_index(action_id) {
        return vec![exact];
    }
    let Some(mut parsed) = parse(binding) else {
        return vec![exact];
    };
    if parsed.double_tap.is_some()
        || parsed.key.len() != 1
        || !matches!(parsed.key.as_bytes()[0], b'1'..=b'9')
    {
        return vec![exact];
    }
    (1..=9)
        .map(|digit| {
            parsed.key = digit.to_string();
            identity_for_parsed(&parsed, platform)
        })
        .collect()
}

fn identity(binding: &str, platform: KeybindingPlatform) -> String {
    parse(binding).map_or_else(
        || binding.to_owned(),
        |parsed| identity_for_parsed(&parsed, platform),
    )
}

fn identity_for_parsed(parsed: &ParsedBinding, platform: KeybindingPlatform) -> String {
    if let Some(modifier) = parsed.double_tap {
        return format!("DoubleTap:{}", resolved_modifier(modifier, platform));
    }
    format!(
        "{}+{}+{}+{}+{}",
        if parsed.is_meta || (parsed.is_mod && platform == KeybindingPlatform::Darwin) {
            "Meta"
        } else {
            ""
        },
        if parsed.is_control || (parsed.is_mod && platform != KeybindingPlatform::Darwin) {
            "Control"
        } else {
            ""
        },
        if parsed.is_alt { "Alt" } else { "" },
        if parsed.is_shift { "Shift" } else { "" },
        parsed.key
    )
}

fn resolved_modifier(modifier: Modifier, platform: KeybindingPlatform) -> &'static str {
    match modifier {
        Modifier::Mod if platform == KeybindingPlatform::Darwin => "meta",
        Modifier::Mod => "control",
        Modifier::Cmd => "meta",
        Modifier::Ctrl => "control",
        Modifier::Alt => "alt",
        Modifier::Shift => "shift",
    }
}

fn modifier_label(modifier: Modifier, platform: KeybindingPlatform) -> &'static str {
    match modifier {
        Modifier::Mod if platform == KeybindingPlatform::Darwin => "⌘",
        Modifier::Mod => "Ctrl",
        Modifier::Cmd if platform == KeybindingPlatform::Darwin => "⌘",
        Modifier::Cmd => "Cmd",
        Modifier::Ctrl if platform == KeybindingPlatform::Darwin => "⌃",
        Modifier::Ctrl => "Ctrl",
        Modifier::Alt if platform == KeybindingPlatform::Darwin => "⌥",
        Modifier::Alt => "Alt",
        Modifier::Shift if platform == KeybindingPlatform::Darwin => "⇧",
        Modifier::Shift => "Shift",
    }
}

fn format_key(key: &str) -> String {
    match key {
        "BracketLeft" => "[",
        "BracketRight" => "]",
        "Minus" => "-",
        "Underscore" => "_",
        "Equal" => "=",
        "Plus" => "+",
        "ArrowLeft" => "←",
        "ArrowRight" => "→",
        "ArrowUp" => "↑",
        "ArrowDown" => "↓",
        "NumpadAdd" => "Numpad +",
        "NumpadSubtract" => "Numpad -",
        "Comma" => ",",
        "Period" => ".",
        "Slash" => "/",
        "Backslash" => "\\",
        "Semicolon" => ";",
        "Quote" => "'",
        "Backquote" => "`",
        "Escape" => "Esc",
        "Space" => "Space",
        value => value,
    }
    .to_owned()
}
