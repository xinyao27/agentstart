use crate::hosts::{ExecutionHost, HostKind, HostPlatform};

#[derive(Clone, Copy, Eq, PartialEq)]
pub(crate) enum Shell {
    Cmd,
    Posix,
    WindowsPs,
}

impl Shell {
    pub(crate) fn for_host(host: &dyn ExecutionHost, configured: Option<&str>) -> Self {
        if host.kind() != HostKind::Local || host.platform() != HostPlatform::Windows {
            return Self::Posix;
        }
        let configured = configured.map(str::trim).unwrap_or_default();
        if configured == "git-bash" {
            return Self::Posix;
        }
        match configured
            .replace('\\', "/")
            .rsplit('/')
            .next()
            .unwrap_or_default()
            .to_ascii_lowercase()
            .as_str()
        {
            "cmd.exe" => Self::Cmd,
            "wsl.exe" | "wsl" | "bash.exe" => Self::Posix,
            _ => Self::WindowsPs,
        }
    }
}

pub(crate) fn tokenize(value: &str, shell: Shell) -> Option<Vec<String>> {
    if shell == Shell::Posix {
        tokenize_posix(value)
    } else {
        tokenize_windows(value, shell)
    }
}

fn tokenize_posix(value: &str) -> Option<Vec<String>> {
    let mut tokens = Vec::new();
    let mut token = String::new();
    let mut started = false;
    let mut quote = None;
    let mut characters = value.chars().peekable();
    while let Some(character) = characters.next() {
        if let Some(active) = quote {
            if character == '\\' && active == '"' && characters.peek().is_some() {
                token.push(characters.next()?);
            } else if character == active {
                quote = None;
                started = true;
            } else {
                token.push(character);
            }
        } else if matches!(character, '\'' | '"') {
            quote = Some(character);
            started = true;
        } else if character == '\\' && characters.peek().is_some() {
            token.push(characters.next()?);
            started = true;
        } else if is_ecmascript_whitespace(character) {
            push_token(&mut tokens, &mut token, &mut started);
        } else {
            token.push(character);
            started = true;
        }
    }
    if quote.is_some() {
        return None;
    }
    push_token(&mut tokens, &mut token, &mut started);
    Some(tokens)
}

fn tokenize_windows(value: &str, shell: Shell) -> Option<Vec<String>> {
    let mut tokens = Vec::new();
    let mut token = String::new();
    let mut started = false;
    let mut quote = None;
    let characters = value.chars().collect::<Vec<_>>();
    let mut index = 0;
    while index < characters.len() {
        let character = characters[index];
        let escape = if shell == Shell::Cmd { '^' } else { '`' };
        if character == escape && index + 1 < characters.len() {
            token.push(characters[index + 1]);
            started = true;
            index += 2;
            continue;
        }
        if let Some(active) = quote {
            if character == active {
                if shell == Shell::WindowsPs
                    && active == '\''
                    && characters.get(index + 1) == Some(&'\'')
                {
                    token.push('\'');
                    index += 2;
                    continue;
                }
                quote = None;
            } else {
                token.push(character);
            }
            started = true;
        } else if matches!(character, '\'' | '"') {
            quote = Some(character);
            started = true;
        } else if is_ecmascript_whitespace(character) {
            push_token(&mut tokens, &mut token, &mut started);
        } else {
            token.push(character);
            started = true;
        }
        index += 1;
    }
    if quote.is_some() {
        return None;
    }
    push_token(&mut tokens, &mut token, &mut started);
    Some(tokens)
}

fn push_token(tokens: &mut Vec<String>, token: &mut String, started: &mut bool) {
    if *started {
        tokens.push(std::mem::take(token));
        *started = false;
    }
}

pub(crate) fn quote(value: &str, shell: Shell) -> String {
    match shell {
        Shell::WindowsPs => format!("'{}'", value.replace('\'', "''")),
        Shell::Cmd => {
            let mut quoted = String::with_capacity(value.len() + 2);
            quoted.push('"');
            for character in value.chars() {
                if matches!(
                    character,
                    '^' | '&' | '|' | '<' | '>' | '(' | ')' | '%' | '!' | '"'
                ) {
                    quoted.push('^');
                }
                quoted.push(character);
            }
            quoted.push('"');
            quoted
        }
        Shell::Posix => format!("'{}'", value.replace('\'', "'\\''")),
    }
}

pub(crate) fn is_ecmascript_whitespace(character: char) -> bool {
    matches!(
        character,
        '\u{0009}'..='\u{000d}'
            | '\u{0020}'
            | '\u{00a0}'
            | '\u{1680}'
            | '\u{2000}'..='\u{200a}'
            | '\u{2028}'
            | '\u{2029}'
            | '\u{202f}'
            | '\u{205f}'
            | '\u{3000}'
            | '\u{feff}'
    )
}
