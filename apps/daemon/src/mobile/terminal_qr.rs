use std::io::IsTerminal;

use qrcode::QrCode;
use qrcode::types::{Color, EcLevel, QrError};
use thiserror::Error;

const QUIET_ZONE_MODULES: usize = 2;
const UPPER_HALF_BLOCK: char = '\u{2580}';
const RESET: &str = "\u{1b}[0m";
const DARK_FOREGROUND: &str = "\u{1b}[30m";
const LIGHT_FOREGROUND: &str = "\u{1b}[97m";
const DARK_BACKGROUND: &str = "\u{1b}[40m";
const LIGHT_BACKGROUND: &str = "\u{1b}[107m";

#[derive(Debug, Error)]
pub(crate) enum TerminalQrError {
    #[error("QR encoding failed: {0}")]
    Qr(#[from] QrError),
}

/// Render `value` as a QR code a phone camera can read off the terminal, or `None` when the caller
/// should print only the text.
///
/// Why: half blocks fold two module rows into one character, and both colours are forced rather than
/// inherited. A QR drawn in the terminal's own foreground and background inverts on a dark theme,
/// which is exactly the case phone decoders handle worst.
pub(crate) fn render(value: &str) -> Result<Option<String>, TerminalQrError> {
    if !std::io::stdout().is_terminal() || std::env::var_os("NO_COLOR").is_some() {
        return Ok(None);
    }
    let code = QrCode::with_error_correction_level(value.as_bytes(), EcLevel::M)?;
    let modules = code.width();
    let span = modules + QUIET_ZONE_MODULES * 2;
    let mut rendered = String::new();
    for row in (0..span).step_by(2) {
        let mut foreground = None;
        let mut background = None;
        for column in 0..span {
            let upper = is_dark(&code, modules, column, row);
            let lower = is_dark(&code, modules, column, row + 1);
            if foreground != Some(upper) {
                rendered.push_str(if upper {
                    DARK_FOREGROUND
                } else {
                    LIGHT_FOREGROUND
                });
                foreground = Some(upper);
            }
            if background != Some(lower) {
                rendered.push_str(if lower {
                    DARK_BACKGROUND
                } else {
                    LIGHT_BACKGROUND
                });
                background = Some(lower);
            }
            rendered.push(UPPER_HALF_BLOCK);
        }
        rendered.push_str(RESET);
        rendered.push('\n');
    }
    Ok(Some(rendered))
}

fn is_dark(code: &QrCode, modules: usize, column: usize, row: usize) -> bool {
    if column < QUIET_ZONE_MODULES || row < QUIET_ZONE_MODULES {
        return false;
    }
    let (module_column, module_row) = (column - QUIET_ZONE_MODULES, row - QUIET_ZONE_MODULES);
    module_column < modules
        && module_row < modules
        && code[(module_column, module_row)] == Color::Dark
}
