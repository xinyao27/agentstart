use std::sync::Arc;
use std::sync::atomic::{AtomicBool, Ordering};

use qwertty_term_vt::formatter::{Content, Options as FormatOptions, ScreenExtra, TerminalExtra};
use qwertty_term_vt::modes::{Mode, ModeTag};
use qwertty_term_vt::point::Point;
use qwertty_term_vt::screen::Screen;
use qwertty_term_vt::stream::{Stream, TerminalHandler};
use qwertty_term_vt::terminal::{Options as TerminalOptions, ScreenKey, Terminal};
use serde_json::json;
use tokio::sync::{mpsc, oneshot};

use super::TerminalSessionAuthority;
use super::model::TerminalReadResult;
use super::process::{ProcessEvent, TerminalClear, TerminalEvent};
use super::read_handler::ReadHandler;
use super::state::TerminalDisplayMode;

const DEFAULT_SNAPSHOT_BYTES: usize = 2 * 1024 * 1024;
const HARD_SNAPSHOT_BYTES: usize = 8 * 1024 * 1024;
const MODEL_QUEUE_DEPTH: usize = 256;
const MODEL_SCROLLBACK_BYTES: usize = 64 * 1024 * 1024;
const MODEL_SCROLLBACK_ROWS: usize = 5_000;
const PARTIAL_ESCAPE_TAIL_BYTES: usize = 4_096;

#[derive(Clone)]
pub(super) struct TerminalSnapshotProvider {
    alternate_screen: Arc<AtomicBool>,
    commands: mpsc::Sender<ModelCommand>,
}

pub(super) struct TerminalSnapshotRequest {
    pub(crate) cancellation: Arc<AtomicBool>,
    pub(crate) cwd: String,
    pub(crate) display_mode: &'static str,
    pub(crate) max_bytes: usize,
    pub(crate) pending_delivery_start_sequence: Option<u64>,
    pub(crate) requested_scrollback_rows: usize,
    pub(crate) title: Option<String>,
}

pub(crate) enum TerminalSnapshotResult {
    Complete(TerminalSnapshot),
    TooLarge { coverage_end_sequence: u64 },
    Unavailable,
}

pub(crate) struct TerminalSnapshot {
    pub(crate) active_buffer: u8,
    pub(crate) cols: u16,
    pub(crate) coverage_end_sequence: u64,
    pub(crate) pending_delivery_start_sequence: u64,
    pub(crate) retained_scrollback_rows: u32,
    pub(crate) rows: u16,
    pub(crate) sections: [Vec<u8>; 5],
    pub(crate) truncated: bool,
}

pub(super) enum ModelCommand {
    PlainHistory(oneshot::Sender<String>),
    Read {
        handle: String,
        status: &'static str,
        cursor: Option<u64>,
        limit: Option<usize>,
        result: oneshot::Sender<TerminalReadResult>,
    },
    Restore {
        text: String,
        completed: oneshot::Sender<()>,
    },
    Clear(oneshot::Sender<Option<TerminalClear>>),
    Output {
        bytes: Vec<u8>,
        observed_at: i64,
    },
    ReaderFinished {
        observed_at: i64,
    },
    Resize {
        cols: u16,
        rows: u16,
    },
    Snapshot {
        request: TerminalSnapshotRequest,
        result: oneshot::Sender<TerminalSnapshotResult>,
    },
}

struct TerminalModel {
    pending_escape_tail: Vec<u8>,
    sequence: u64,
    stream: Stream<ReadHandler>,
}

impl TerminalSnapshotProvider {
    pub(super) async fn read(
        &self,
        handle: String,
        status: &'static str,
        cursor: Option<u64>,
        limit: Option<usize>,
    ) -> Option<TerminalReadResult> {
        let (result, receiver) = oneshot::channel();
        self.commands
            .send(ModelCommand::Read {
                handle,
                status,
                cursor,
                limit,
                result,
            })
            .await
            .ok()?;
        receiver.await.ok()
    }
    pub(super) async fn plain_history(&self) -> Option<String> {
        let (result, receiver) = oneshot::channel();
        self.commands
            .send(ModelCommand::PlainHistory(result))
            .await
            .ok()?;
        receiver.await.ok()
    }
    pub(super) fn channel() -> (Self, mpsc::Receiver<ModelCommand>) {
        let (commands, receiver) = mpsc::channel(MODEL_QUEUE_DEPTH);
        (
            Self {
                alternate_screen: Arc::new(AtomicBool::new(false)),
                commands,
            },
            receiver,
        )
    }

    pub(super) fn ingest(&self, bytes: Vec<u8>, observed_at: i64) -> bool {
        self.commands
            .blocking_send(ModelCommand::Output { bytes, observed_at })
            .is_ok()
    }

    pub(super) async fn restore(&self, text: String) -> bool {
        let (completed, receiver) = oneshot::channel();
        self.commands
            .send(ModelCommand::Restore { text, completed })
            .await
            .is_ok()
            && receiver.await.is_ok()
    }

    pub(super) fn resize(&self, cols: u16, rows: u16) {
        let _ = self
            .commands
            .blocking_send(ModelCommand::Resize { cols, rows });
    }

    pub(super) fn finish(&self, observed_at: i64) {
        let _ = self
            .commands
            .blocking_send(ModelCommand::ReaderFinished { observed_at });
    }

    pub(super) async fn clear(&self) -> Option<TerminalClear> {
        let (result, receiver) = oneshot::channel();
        if self
            .commands
            .send(ModelCommand::Clear(result))
            .await
            .is_err()
        {
            return None;
        }
        receiver.await.ok().flatten()
    }

    async fn snapshot(&self, request: TerminalSnapshotRequest) -> TerminalSnapshotResult {
        let (result, receiver) = oneshot::channel();
        if self
            .commands
            .send(ModelCommand::Snapshot { request, result })
            .await
            .is_ok()
        {
            receiver
                .await
                .unwrap_or(TerminalSnapshotResult::Unavailable)
        } else {
            TerminalSnapshotResult::Unavailable
        }
    }

    pub(super) fn is_alternate_screen(&self) -> bool {
        self.alternate_screen.load(Ordering::Acquire)
    }

    pub(super) fn alternate_screen_state(&self) -> Arc<AtomicBool> {
        self.alternate_screen.clone()
    }
}

impl TerminalSessionAuthority {
    pub(crate) async fn terminal_snapshot(
        &self,
        handle: &str,
        cancellation: Arc<AtomicBool>,
        max_bytes: usize,
        pending_delivery_start_sequence: Option<u64>,
        requested_scrollback_rows: usize,
    ) -> TerminalSnapshotResult {
        let Some((provider, cwd, title, display_mode)) = self.state.with(handle, |record| {
            (
                record.snapshot_provider.clone(),
                record.cwd.clone(),
                record.title.clone(),
                match record.display_mode {
                    TerminalDisplayMode::Auto => "auto",
                    TerminalDisplayMode::Desktop => "desktop",
                },
            )
        }) else {
            return TerminalSnapshotResult::Unavailable;
        };
        provider
            .snapshot(TerminalSnapshotRequest {
                cancellation,
                cwd,
                display_mode,
                max_bytes,
                pending_delivery_start_sequence,
                requested_scrollback_rows,
                title,
            })
            .await
    }

    pub(crate) fn terminal_is_alternate_screen(&self, handle: &str) -> bool {
        self.state
            .with(handle, |record| {
                record.snapshot_provider.is_alternate_screen()
            })
            .unwrap_or(false)
    }

    pub(crate) fn terminal_wire_byte_sequence(&self, handle: &str) -> Option<u64> {
        self.state.with(handle, |record| record.sequence)
    }
}

pub(super) fn run_model(
    mut receiver: mpsc::Receiver<ModelCommand>,
    cols: u16,
    rows: u16,
    pty_id: String,
    events: mpsc::Sender<TerminalEvent>,
    alternate_screen: Arc<AtomicBool>,
) {
    let mut model = TerminalModel::new(cols, rows);
    while let Some(command) = receiver.blocking_recv() {
        match command {
            ModelCommand::Read {
                handle,
                status,
                cursor,
                limit,
                result,
            } => {
                let visible = if cursor.is_none() {
                    model.plain_read_view()
                } else {
                    String::new()
                };
                let _ = result.send(
                    model
                        .stream
                        .handler
                        .history
                        .read(handle, status, cursor, limit, &visible),
                );
            }
            ModelCommand::PlainHistory(result) => {
                let _ = result.send(model.plain_history());
            }
            ModelCommand::Restore { text, completed } => {
                // Why: history belongs to the new model, not its live byte sequence or event stream.
                let sequence = model.sequence;
                model.ingest(text.replace('\n', "\r\n").as_bytes());
                model.sequence = sequence;
                let _ = completed.send(());
            }
            ModelCommand::Clear(result) => {
                let screen = model.stream.handler.inner.terminal.screens.active_mut();
                screen.scroll_clear();
                screen.erase_history(None);
                model.stream.handler.clear();
                if events
                    .blocking_send(TerminalEvent::Clear {
                        pty_id: pty_id.clone(),
                        result,
                    })
                    .is_err()
                {
                    return;
                }
            }
            ModelCommand::Output { bytes, observed_at } => {
                model.ingest(&bytes);
                alternate_screen.store(
                    model.stream.handler.inner.terminal.screens.active_key()
                        == ScreenKey::Alternate,
                    Ordering::Release,
                );
                if events
                    .blocking_send(TerminalEvent::Process(ProcessEvent::Output {
                        bytes,
                        observed_at,
                        pty_id: pty_id.clone(),
                    }))
                    .is_err()
                {
                    return;
                }
            }
            ModelCommand::Resize { cols, rows } => {
                model.stream.handler.inner.terminal.resize(cols, rows);
                model
                    .stream
                    .handler
                    .position
                    .reanchor(&model.stream.handler.inner.terminal);
            }
            ModelCommand::ReaderFinished { observed_at } => {
                let _ =
                    events.blocking_send(TerminalEvent::Process(ProcessEvent::ReaderFinished {
                        observed_at,
                        pty_id: pty_id.clone(),
                        history: model.plain_history(),
                    }));
            }
            ModelCommand::Snapshot { request, result } => {
                let _ = result.send(model.snapshot(request));
            }
        }
    }
}

impl TerminalModel {
    fn plain_read_view(&self) -> String {
        let terminal = &self.stream.handler.inner.terminal;
        if terminal.screens.active_key() == ScreenKey::Primary {
            return self.plain_history();
        }
        terminal.screens.active().format(
            &FormatOptions {
                unwrap: true,
                ..FormatOptions::plain()
            },
            &ScreenExtra::default(),
            Content::Range {
                tl: Point::active(0, 0),
                br: Point::active(
                    terminal.cols.saturating_sub(1),
                    u32::from(terminal.rows.saturating_sub(1)),
                ),
            },
        )
    }

    fn plain_history(&self) -> String {
        let terminal = &self.stream.handler.inner.terminal;
        let Some(primary) = terminal.screens.get(ScreenKey::Primary) else {
            return String::new();
        };
        let history_rows = primary
            .pages
            .total_rows()
            .saturating_sub(terminal.rows as usize);
        let retained_rows = history_rows.min(MODEL_SCROLLBACK_ROWS);
        let range = Content::Range {
            tl: if retained_rows == 0 {
                Point::active(0, 0)
            } else {
                Point::history(
                    0,
                    u32::try_from(history_rows - retained_rows).unwrap_or(u32::MAX),
                )
            },
            br: Point::active(
                terminal.cols.saturating_sub(1),
                u32::from(terminal.rows - 1),
            ),
        };
        // Why: cursor redraws operate on physical rows; the CLI tail cannot reconstruct wrapped prompts.
        primary.format(
            &FormatOptions {
                unwrap: true,
                ..FormatOptions::plain()
            },
            &ScreenExtra::default(),
            range,
        )
    }
    fn new(cols: u16, rows: u16) -> Self {
        let mut terminal = Terminal::new(TerminalOptions {
            cols,
            rows,
            max_scrollback: MODEL_SCROLLBACK_BYTES,
            ..Default::default()
        });
        // Why: the multiplex snapshot format cannot replay kitty image payloads; retaining them
        // in an otherwise hidden terminal model would consume memory without restoring content.
        terminal.set_kitty_graphics_size_limit(0);
        let mut handler = TerminalHandler::new(terminal);
        handler.set_title_reporting(false);
        Self {
            pending_escape_tail: Vec::new(),
            sequence: 0,
            stream: Stream::new(ReadHandler::new(handler)),
        }
    }

    fn ingest(&mut self, bytes: &[u8]) {
        advance_partial_escape_tail(&mut self.pending_escape_tail, bytes);
        self.stream.feed(bytes);
        self.sequence = self.sequence.saturating_add(bytes.len() as u64);
        let handler = &mut self.stream.handler.inner;
        drop(handler.take_output());
        drop(handler.take_clipboard());
        let _ = handler.take_bell();
        drop(handler.take_notification());
        drop(handler.take_command_boundaries());
        let _ = handler.take_progress_report();
    }

    fn snapshot(&self, request: TerminalSnapshotRequest) -> TerminalSnapshotResult {
        let coverage_end_sequence = self.sequence;
        if request.cancellation.load(Ordering::Acquire) {
            return TerminalSnapshotResult::Unavailable;
        }
        let effective_cap = request
            .max_bytes
            .min(DEFAULT_SNAPSHOT_BYTES)
            .min(HARD_SNAPSHOT_BYTES);
        let history_rows = self
            .stream
            .handler
            .inner
            .terminal
            .screens
            .get(ScreenKey::Primary)
            .map_or(0, |screen| {
                screen
                    .pages
                    .total_rows()
                    .saturating_sub(self.stream.handler.inner.terminal.rows as usize)
                    .min(MODEL_SCROLLBACK_ROWS)
            });
        let maximum_rows = request.requested_scrollback_rows.min(history_rows);
        let mandatory = self.serialize(&request, 0);
        if snapshot_bytes(&mandatory.sections) > effective_cap {
            return TerminalSnapshotResult::TooLarge {
                coverage_end_sequence,
            };
        }

        let mut selected = mandatory;
        let mut selected_rows = 0_usize;
        let mut first_oversize = None;
        let mut probe_rows = maximum_rows.min(1);
        while probe_rows > 0 && !request.cancellation.load(Ordering::Acquire) {
            let candidate = self.serialize(&request, probe_rows);
            if snapshot_bytes(&candidate.sections) <= effective_cap {
                selected = candidate;
                selected_rows = probe_rows;
                if probe_rows == maximum_rows {
                    break;
                }
                probe_rows = probe_rows.saturating_mul(2).min(maximum_rows);
            } else {
                first_oversize = Some(probe_rows);
                break;
            }
        }
        if let Some(first_oversize) = first_oversize {
            let mut low = selected_rows.saturating_add(1);
            let mut high = first_oversize.saturating_sub(1);
            while low <= high && !request.cancellation.load(Ordering::Acquire) {
                let candidate_rows = low + (high - low) / 2;
                let candidate = self.serialize(&request, candidate_rows);
                if snapshot_bytes(&candidate.sections) <= effective_cap {
                    selected = candidate;
                    low = candidate_rows.saturating_add(1);
                } else {
                    high = candidate_rows.saturating_sub(1);
                }
            }
        } else if selected_rows == maximum_rows && request.requested_scrollback_rows > maximum_rows
        {
            let candidate = self.serialize(&request, request.requested_scrollback_rows);
            if snapshot_bytes(&candidate.sections) <= effective_cap {
                selected = candidate;
            }
        }
        if request.cancellation.load(Ordering::Acquire) {
            return TerminalSnapshotResult::Unavailable;
        }
        selected.retained_scrollback_rows = selected
            .retained_scrollback_rows
            .min(u32::try_from(request.requested_scrollback_rows).unwrap_or(u32::MAX));
        selected.truncated = usize::try_from(selected.retained_scrollback_rows)
            .unwrap_or(usize::MAX)
            < request.requested_scrollback_rows;
        TerminalSnapshotResult::Complete(selected)
    }

    fn serialize(
        &self,
        request: &TerminalSnapshotRequest,
        requested_rows: usize,
    ) -> TerminalSnapshot {
        let terminal = &self.stream.handler.inner.terminal;
        let active_key = terminal.screens.active_key();
        let primary = terminal
            .screens
            .get(ScreenKey::Primary)
            .expect("primary terminal screen is always available");
        let cols = terminal.cols;
        let rows = terminal.rows;
        let available_history_rows = primary.pages.total_rows().saturating_sub(rows as usize);
        let history_rows = available_history_rows.min(MODEL_SCROLLBACK_ROWS);
        let retained_rows = requested_rows.min(history_rows);
        let primary_range = Content::Range {
            tl: if retained_rows == 0 {
                Point::active(0, 0)
            } else {
                Point::history(
                    0,
                    u32::try_from(available_history_rows - retained_rows).unwrap_or(u32::MAX),
                )
            },
            br: Point::active(cols.saturating_sub(1), u32::from(rows - 1)),
        };
        let (normal_scrollback, normal_screen, alternate_screen) =
            if active_key == ScreenKey::Primary {
                (
                    Vec::new(),
                    format_active_screen(terminal, primary_range, cols, rows, true),
                    Vec::new(),
                )
            } else {
                // Why: replay rebuilds the primary buffer before its own 1049 transition. Keeping
                // the model's active-alt mode in this prefix would switch buffers too early.
                let mut normal = buffer_prologue();
                normal.extend_from_slice(
                    primary
                        .format(&FormatOptions::vt(), &screen_extras(), primary_range)
                        .as_bytes(),
                );
                append_cursor_registers(&mut normal, None, primary, cols, rows);
                let alternate_content = format_active_screen(
                    terminal,
                    Content::Range {
                        tl: Point::active(0, 0),
                        br: Point::active(cols.saturating_sub(1), u32::from(rows - 1)),
                    },
                    cols,
                    rows,
                    false,
                );
                (normal, Vec::new(), alternate_content)
            };
        let kitty_keyboard_flags = terminal.screens.active().kitty_keyboard.current().int();
        let metadata = serde_json::to_vec(&json!({
            "cwd": request.cwd,
            "lastTitle": request.title,
            "oscLinks": [],
            "kittyKeyboardFlags": kitty_keyboard_flags,
            "displayMode": request.display_mode,
            "requestedScrollbackRows": requested_rows
        }))
        .unwrap_or_default();
        TerminalSnapshot {
            active_buffer: u8::from(active_key == ScreenKey::Alternate),
            cols,
            coverage_end_sequence: self.sequence,
            pending_delivery_start_sequence: request
                .pending_delivery_start_sequence
                .unwrap_or(self.sequence)
                .min(self.sequence),
            retained_scrollback_rows: u32::try_from(retained_rows).unwrap_or(u32::MAX),
            rows,
            sections: [
                normal_scrollback,
                normal_screen,
                alternate_screen,
                // Why: OSC/DCS payloads and a split UTF-8 scalar are arbitrary terminal bytes.
                // Lossy text conversion would corrupt the exact tail the client must replay.
                self.pending_escape_tail.clone(),
                metadata,
            ],
            truncated: false,
        }
    }
}

fn screen_extras() -> ScreenExtra {
    ScreenExtra {
        cursor: false,
        ..ScreenExtra::all()
    }
}

fn terminal_extras() -> TerminalExtra {
    TerminalExtra {
        modes: false,
        screen: screen_extras(),
        ..TerminalExtra::all()
    }
}

fn format_active_screen(
    terminal: &Terminal,
    content: Content,
    cols: u16,
    rows: u16,
    include_alt_screen_modes: bool,
) -> Vec<u8> {
    let mut serialized = buffer_prologue();
    serialized
        .extend_from_slice(terminal_mode_prefix(terminal, include_alt_screen_modes).as_bytes());
    serialized.extend_from_slice(
        terminal
            .format_content(&FormatOptions::vt(), &terminal_extras(), content)
            .as_bytes(),
    );
    append_cursor_registers(
        &mut serialized,
        Some(terminal),
        terminal.screens.active(),
        cols,
        rows,
    );
    serialized
}

fn buffer_prologue() -> Vec<u8> {
    // Why: snapshots replay into a terminal that may still have the source TUI's origin and
    // margin state. Content is serialized against a full-screen origin, then source state is
    // restored after the body by TerminalExtra.
    b"\x1b[0m\x1b]8;;\x1b\\\x1b[0\"q\x1b[?6l\x1b[?69l\x1b[r\x1b[H".to_vec()
}

fn terminal_mode_prefix(terminal: &Terminal, include_alt_screen_modes: bool) -> String {
    let mut serialized = String::new();
    for &mode in Mode::ALL {
        if terminal.modes.get(mode) == terminal.modes.default_value(mode)
            || !include_alt_screen_modes
                && matches!(
                    mode,
                    Mode::AltScreenLegacy | Mode::AltScreen | Mode::AltScreenSaveCursorClearEnter
                )
        {
            continue;
        }
        let tag = ModeTag::from_mode(mode);
        let prefix = if tag.ansi { "" } else { "?" };
        let suffix = if terminal.modes.get(mode) { "h" } else { "l" };
        serialized.push_str(&format!("\x1b[{prefix}{}{suffix}", tag.value));
    }
    serialized
}

fn append_cursor_registers(
    serialized: &mut Vec<u8>,
    terminal: Option<&Terminal>,
    screen: &Screen,
    cols: u16,
    rows: u16,
) {
    if screen.cursor.pending_wrap || screen.cursor.x >= cols || screen.cursor.y >= rows {
        return;
    }
    if let Some(saved) = &screen.saved_cursor {
        let x = saved.x.min(cols - 1);
        let y = saved.y.min(rows - 1);
        if (x != 0 || y != 0)
            && let Some((x, y)) = cursor_coordinates(terminal, x, y)
        {
            serialized.extend_from_slice(format!("\x1b[{};{}H\x1b7", y + 1, x + 1).as_bytes());
        }
    }
    if let Some((x, y)) = cursor_coordinates(terminal, screen.cursor.x, screen.cursor.y) {
        serialized.extend_from_slice(format!("\x1b[{};{}H", y + 1, x + 1).as_bytes());
    }
}

fn cursor_coordinates(terminal: Option<&Terminal>, x: u16, y: u16) -> Option<(u16, u16)> {
    let Some(terminal) = terminal.filter(|terminal| terminal.modes.get(Mode::Origin)) else {
        return Some((x, y));
    };
    let region = &terminal.scrolling_region;
    Some((x.checked_sub(region.left)?, y.checked_sub(region.top)?))
}

fn snapshot_bytes(sections: &[Vec<u8>; 5]) -> usize {
    sections.iter().map(Vec::len).sum()
}

fn advance_partial_escape_tail(pending: &mut Vec<u8>, chunk: &[u8]) {
    let mut stream = Vec::with_capacity(pending.len().saturating_add(chunk.len()));
    stream.extend_from_slice(pending);
    stream.extend_from_slice(chunk);
    *pending = extract_partial_escape_tail(&stream);
    if pending.len() > PARTIAL_ESCAPE_TAIL_BYTES {
        pending.clear();
    }
}

fn extract_partial_escape_tail(stream: &[u8]) -> Vec<u8> {
    #[derive(Clone, Copy, Eq, PartialEq)]
    enum State {
        Ground,
        Esc,
        EscIntermediate,
        Csi,
        Osc,
        OscEsc,
        String,
        StringEsc,
    }

    fn after_esc(byte: u8) -> State {
        match byte {
            b'[' => State::Csi,
            b']' => State::Osc,
            b'P' | b'X' | b'^' | b'_' => State::String,
            0x20..=0x2f => State::EscIntermediate,
            0x00..=0x1f | 0x7f => State::Esc,
            _ => State::Ground,
        }
    }

    let mut state = State::Ground;
    let mut start = 0;
    for (index, byte) in stream.iter().copied().enumerate() {
        if state == State::Ground {
            if byte == 0x1b {
                start = index;
                state = State::Esc;
            }
            continue;
        }
        if byte == 0x1b
            && !matches!(
                state,
                State::Osc | State::String | State::OscEsc | State::StringEsc
            )
        {
            start = index;
            state = State::Esc;
            continue;
        }
        if matches!(byte, 0x18 | 0x1a) && matches!(state, State::Esc | State::EscIntermediate) {
            state = State::Ground;
            continue;
        }
        state = match state {
            State::Esc => after_esc(byte),
            State::EscIntermediate if (0x30..=0x7e).contains(&byte) => State::Ground,
            State::EscIntermediate => State::EscIntermediate,
            State::Csi if matches!(byte, 0x18 | 0x1a) || (0x40..=0x7e).contains(&byte) => {
                State::Ground
            }
            State::Csi => State::Csi,
            State::Osc if matches!(byte, 0x07 | 0x18 | 0x1a) => State::Ground,
            State::Osc if byte == 0x1b => State::OscEsc,
            State::Osc => State::Osc,
            State::String if matches!(byte, 0x18 | 0x1a) => State::Ground,
            State::String if byte == 0x1b => State::StringEsc,
            State::String => State::String,
            State::OscEsc | State::StringEsc if byte == b'\\' => State::Ground,
            State::OscEsc | State::StringEsc => {
                start = index.saturating_sub(1);
                if byte == 0x1b {
                    State::Esc
                } else {
                    after_esc(byte)
                }
            }
            State::Ground => State::Ground,
        };
    }
    if state == State::Ground {
        Vec::new()
    } else {
        stream[start..].to_vec()
    }
}
