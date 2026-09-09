const MAX_SEQUENCE_BYTES: usize = 4_096;

#[derive(Default)]
pub(in crate::terminal_session) struct ControlParser {
    state: State,
    payload: Vec<u8>,
    overflow: bool,
    c1_prefix: bool,
}

#[derive(Default)]
enum State {
    #[default]
    Ground,
    Escape,
    Osc,
    OscEscape,
    Csi,
}

#[derive(Default)]
pub(in crate::terminal_session) struct ObservedControl {
    pub(in crate::terminal_session) titles: Vec<String>,
    pub(in crate::terminal_session) agent_statuses: Vec<serde_json::Value>,
    pub(in crate::terminal_session) command_finished: Vec<Option<i32>>,
    pub(in crate::terminal_session) subscribed: bool,
    pub(in crate::terminal_session) bell: bool,
}

impl ControlParser {
    pub(in crate::terminal_session) fn observe(&mut self, bytes: &[u8]) -> ObservedControl {
        let mut observed = ObservedControl::default();
        for byte in bytes {
            if matches!(byte, 0x18 | 0x1a) {
                self.state = State::Ground;
                self.payload.clear();
                self.overflow = false;
                self.c1_prefix = false;
                continue;
            }
            if *byte == 0x07 && matches!(self.state, State::Csi) {
                observed.bell = true;
                continue;
            }

            if matches!(self.state, State::Ground) {
                if self.c1_prefix && *byte == 0x9b {
                    self.c1_prefix = false;
                    self.begin(State::Csi);
                    continue;
                }
                self.c1_prefix = *byte == 0xc2;
            } else {
                self.c1_prefix = false;
            }

            match self.state {
                State::Ground => match byte {
                    0x1b => self.state = State::Escape,
                    0x07 => observed.bell = true,
                    _ => {}
                },
                State::Escape => match byte {
                    b']' => self.begin(State::Osc),
                    b'[' => self.begin(State::Csi),
                    0x1b => {}
                    0x07 => {
                        observed.bell = true;
                        self.state = State::Ground;
                    }
                    _ => self.state = State::Ground,
                },
                State::Osc => match byte {
                    0x07 => self.finish_osc(&mut observed),
                    0x1b => self.state = State::OscEscape,
                    _ => self.push(*byte),
                },
                State::OscEscape => {
                    if *byte == b'\\' {
                        self.finish_osc(&mut observed);
                    } else {
                        self.push(0x1b);
                        self.state = State::Osc;
                        if *byte == 0x07 {
                            self.finish_osc(&mut observed);
                        } else if *byte == 0x1b {
                            self.state = State::OscEscape;
                        } else {
                            self.push(*byte);
                        }
                    }
                }
                State::Csi => {
                    if (0x40..=0x7e).contains(byte) {
                        if *byte == b'h' && !self.overflow && self.payload.first() == Some(&b'?') {
                            observed.subscribed |= self.payload[1..]
                                .split(|b| *b == b';')
                                .any(|part| part == b"2031");
                        }
                        self.state = State::Ground;
                        self.payload.clear();
                    } else if *byte == 0x1b {
                        self.state = State::Escape;
                    } else {
                        self.push(*byte);
                    }
                }
            }
        }
        observed
    }

    fn begin(&mut self, state: State) {
        self.state = state;
        self.payload.clear();
        self.overflow = false;
    }

    fn push(&mut self, byte: u8) {
        let limit = if self.payload.starts_with(b"9999;") {
            64 * 1024
        } else {
            MAX_SEQUENCE_BYTES
        };
        if self.payload.len() < limit {
            self.payload.push(byte);
        } else {
            self.overflow = true;
        }
    }

    fn finish_osc(&mut self, observed: &mut ObservedControl) {
        if !self.overflow {
            let mut parts = self.payload.splitn(2, |byte| *byte == b';');
            if let (Some(selector), Some(payload)) = (parts.next(), parts.next()) {
                if matches!(selector, b"0" | b"2") {
                    observed
                        .titles
                        .push(String::from_utf8_lossy(payload).into_owned());
                } else if selector == b"9999" {
                    if let Some(status) = super::agent_status::parse(payload) {
                        observed.agent_statuses.push(status);
                    }
                } else if selector == b"133" {
                    let mut fields = payload.split(|byte| *byte == b';');
                    if fields.next() == Some(b"D") {
                        observed
                            .command_finished
                            .push(fields.next().and_then(parse_exit_code));
                    }
                }
            }
        }
        self.payload.clear();
        self.state = State::Ground;
    }
}

fn parse_exit_code(bytes: &[u8]) -> Option<i32> {
    let value = std::str::from_utf8(bytes).ok()?.trim_start();
    let end = value
        .char_indices()
        .find_map(|(index, character)| {
            (!(character.is_ascii_digit() || (index == 0 && matches!(character, '+' | '-'))))
                .then_some(index)
        })
        .unwrap_or(value.len());
    value[..end].parse().ok()
}
