#[derive(Default)]
pub(super) struct TextDecoder {
    pending: Vec<u8>,
}

impl TextDecoder {
    pub(super) fn decode(&mut self, bytes: &[u8]) -> String {
        let mut input = std::mem::take(&mut self.pending);
        input.extend_from_slice(bytes);
        let mut output = String::new();
        let mut rest = input.as_slice();
        loop {
            match std::str::from_utf8(rest) {
                Ok(text) => {
                    output.push_str(text);
                    break;
                }
                Err(error) => {
                    let valid = error.valid_up_to();
                    if let Ok(text) = std::str::from_utf8(&rest[..valid]) {
                        output.push_str(text);
                    }
                    if let Some(invalid) = error.error_len() {
                        output.push('\u{fffd}');
                        rest = &rest[valid + invalid..];
                    } else {
                        self.pending.extend_from_slice(&rest[valid..]);
                        break;
                    }
                }
            }
        }
        output
    }
}

pub(super) fn tail(text: &str, count: usize) -> &str {
    let start = text
        .char_indices()
        .rev()
        .nth(count.saturating_sub(1))
        .map_or(0, |(offset, _)| offset);
    &text[start..]
}
