use qwertty_term_vt::formatter::{Content, Options, ScreenExtra};
use qwertty_term_vt::point::Point;
use qwertty_term_vt::terminal::{ScreenKey, Terminal};

#[derive(Default)]
pub(super) struct ReadPosition {
    history_rows: usize,
    logical_rows: u64,
    prefix: String,
}

impl ReadPosition {
    pub(super) fn reanchor(&mut self, terminal: &Terminal) {
        *self = Self::default();
        self.sync(terminal);
    }

    fn sync(&mut self, terminal: &Terminal) {
        let rows = history_rows(terminal);
        if rows < self.history_rows {
            self.history_rows = rows;
            return;
        }
        for index in self.history_rows..rows {
            self.extend(&row(terminal, index));
            if !wrapped(terminal, index) {
                self.extend("\n")
            }
        }
        self.history_rows = rows;
    }

    fn extend(&mut self, text: &str) {
        self.logical_rows = self
            .logical_rows
            .saturating_add(text.bytes().filter(|byte| *byte == b'\n').count() as u64);
        if let Some((_, last)) = text.rsplit_once('\n') {
            self.prefix = last.to_owned()
        } else {
            self.prefix.push_str(text)
        }
        if self.prefix.len() > 16 * 1024 {
            let mut start = self.prefix.len() - 16 * 1024;
            while !self.prefix.is_char_boundary(start) {
                start += 1
            }
            self.prefix.drain(..start);
        }
    }

    pub(super) fn completed(&mut self, terminal: &Terminal) -> (u64, String) {
        self.sync(terminal);
        let start = history_rows(terminal);
        let end = start + usize::from(terminal.screens.active().cursor.y);
        let mut logical = self.logical_rows;
        let mut text = self.prefix.clone();
        for index in start..=end {
            text.push_str(&row(terminal, index));
            if index < end && !wrapped(terminal, index) {
                logical = logical.saturating_add(1);
                text.clear()
            }
        }
        (logical, text.trim_end().to_owned())
    }

    pub(super) fn before_scroll(&self, terminal: &Terminal) -> Option<String> {
        let region = terminal.scrolling_region;
        let cursor = &terminal.screens.active().cursor;
        if region.top != 0
            || region.bottom != terminal.rows - 1
            || region.left != 0
            || region.right != terminal.cols - 1
            || cursor.y != region.bottom
            || cursor.x < region.left
            || cursor.x > region.right
        {
            return None;
        }
        let index = history_rows(terminal);
        let mut text = row(terminal, index);
        if !wrapped(terminal, index) {
            text.push('\n')
        }
        Some(text)
    }

    pub(super) fn after_scroll(&mut self, terminal: &Terminal, scrolled: Option<String>) {
        if let Some(text) = scrolled {
            self.extend(&text);
            self.history_rows = history_rows(terminal);
        }
    }
}

fn history_rows(terminal: &Terminal) -> usize {
    terminal
        .screens
        .get(ScreenKey::Primary)
        .expect("primary screen")
        .pages
        .total_rows()
        .saturating_sub(terminal.rows as usize)
}

fn point(terminal: &Terminal, index: usize, column: u16) -> Point {
    let history = history_rows(terminal);
    if index < history {
        Point::history(column, index as u32)
    } else {
        Point::active(column, (index - history) as u32)
    }
}

fn row(terminal: &Terminal, index: usize) -> String {
    format(
        terminal,
        point(terminal, index, 0),
        point(terminal, index, terminal.cols - 1),
    )
}

fn wrapped(terminal: &Terminal, index: usize) -> bool {
    // Why: the formatter always trims empty trailing rows; only a populated successor can be a soft-wrap continuation.
    if row(terminal, index).is_empty() || row(terminal, index + 1).is_empty() {
        return false;
    }
    !format(
        terminal,
        point(terminal, index, 0),
        point(terminal, index + 1, terminal.cols - 1),
    )
    .contains('\n')
}

fn format(terminal: &Terminal, tl: Point, br: Point) -> String {
    terminal
        .screens
        .get(ScreenKey::Primary)
        .expect("primary screen")
        .format(
            &Options {
                unwrap: true,
                trim: false,
                ..Options::plain()
            },
            &ScreenExtra::default(),
            Content::Range { tl, br },
        )
}
