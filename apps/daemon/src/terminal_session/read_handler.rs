use super::read_history::ReadHistory;
use super::read_position::ReadPosition;
use qwertty_term_vt::csi::{EraseDisplay, EraseLine, TabClear};
use qwertty_term_vt::modes::Mode;
use qwertty_term_vt::stream::{
    CursorStyle, DeviceAttributesReq, DeviceStatusReq, Handler, ModifyKeyFormat, SizeReportStyle,
    TerminalHandler,
};
use qwertty_term_vt::terminal::ScreenKey;
use qwertty_term_vt::{dcs, osc, sgr};

pub(super) struct ReadHandler {
    pub(super) inner: TerminalHandler,
    pub(super) history: ReadHistory,
    pub(super) position: ReadPosition,
}
impl ReadHandler {
    pub(super) fn new(inner: TerminalHandler) -> Self {
        Self {
            inner,
            history: ReadHistory::default(),
            position: ReadPosition::default(),
        }
    }
    fn complete_line(&mut self, effect: impl FnOnce(&mut TerminalHandler)) {
        if self.inner.terminal.screens.active_key() != ScreenKey::Primary {
            effect(&mut self.inner);
            return;
        }
        let (row, text) = self.position.completed(&self.inner.terminal);
        self.history.complete(row, text);
        let scrolled = self.position.before_scroll(&self.inner.terminal);
        effect(&mut self.inner);
        self.position.after_scroll(&self.inner.terminal, scrolled);
    }
    pub(super) fn clear(&mut self) {
        self.history.clear();
        self.position.reanchor(&self.inner.terminal)
    }
}
// Why: only parsed line-completion/reset events add Read bookkeeping; every VT action keeps the library handler behavior.
impl Handler for ReadHandler {
    fn linefeed(&mut self) {
        self.complete_line(TerminalHandler::linefeed)
    }
    fn index(&mut self) {
        self.complete_line(TerminalHandler::index)
    }
    fn next_line(&mut self) {
        self.complete_line(TerminalHandler::next_line)
    }
    fn full_reset(&mut self) {
        self.inner.full_reset();
        self.clear()
    }
    fn erase_display(&mut self, mode: EraseDisplay, protected: bool) {
        self.inner.erase_display(mode, protected);
        if self.inner.terminal.screens.active_key() == ScreenKey::Primary
            && matches!(
                mode,
                EraseDisplay::Complete | EraseDisplay::Scrollback | EraseDisplay::ScrollComplete
            )
        {
            self.clear()
        }
    }
    fn print(&mut self, cp: u32) {
        self.inner.print(cp);
    }
    fn print_slice(&mut self, cps: &[u32]) {
        self.inner.print_slice(cps);
    }
    fn backspace(&mut self) {
        self.inner.backspace();
    }
    fn carriage_return(&mut self) {
        self.inner.carriage_return();
    }
    fn reverse_index(&mut self) {
        self.inner.reverse_index();
    }
    fn bell(&mut self) {
        self.inner.bell();
    }
    fn enquiry(&mut self) {
        self.inner.enquiry();
    }
    fn cursor_up(&mut self, count: u16) {
        self.inner.cursor_up(count);
    }
    fn cursor_down(&mut self, count: u16) {
        self.inner.cursor_down(count);
    }
    fn cursor_left(&mut self, count: u16) {
        self.inner.cursor_left(count);
    }
    fn cursor_right(&mut self, count: u16) {
        self.inner.cursor_right(count);
    }
    fn cursor_pos(&mut self, row: u16, col: u16) {
        self.inner.cursor_pos(row, col);
    }
    fn cursor_col(&mut self, col: u16) {
        self.inner.cursor_col(col);
    }
    fn cursor_row(&mut self, row: u16) {
        self.inner.cursor_row(row);
    }
    fn cursor_col_relative(&mut self, count: u16) {
        self.inner.cursor_col_relative(count);
    }
    fn cursor_row_relative(&mut self, count: u16) {
        self.inner.cursor_row_relative(count);
    }
    fn save_cursor(&mut self) {
        self.inner.save_cursor();
    }
    fn restore_cursor(&mut self) {
        self.inner.restore_cursor();
    }
    fn horizontal_tab(&mut self, count: u16) {
        self.inner.horizontal_tab(count);
    }
    fn horizontal_tab_back(&mut self, count: u16) {
        self.inner.horizontal_tab_back(count);
    }
    fn tab_clear(&mut self, cmd: TabClear) {
        self.inner.tab_clear(cmd);
    }
    fn tab_set(&mut self) {
        self.inner.tab_set();
    }
    fn tab_reset(&mut self) {
        self.inner.tab_reset();
    }
    fn erase_line(&mut self, mode: EraseLine, protected: bool) {
        self.inner.erase_line(mode, protected);
    }
    fn delete_chars(&mut self, count: u16) {
        self.inner.delete_chars(count);
    }
    fn erase_chars(&mut self, count: u16) {
        self.inner.erase_chars(count);
    }
    fn insert_lines(&mut self, count: u16) {
        self.inner.insert_lines(count);
    }
    fn insert_blanks(&mut self, count: u16) {
        self.inner.insert_blanks(count);
    }
    fn delete_lines(&mut self, count: u16) {
        self.inner.delete_lines(count);
    }
    fn scroll_up(&mut self, count: u16) {
        self.inner.scroll_up(count);
    }
    fn scroll_down(&mut self, count: u16) {
        self.inner.scroll_down(count);
    }
    fn set_mode(&mut self, mode: Mode, enabled: bool) {
        self.inner.set_mode(mode, enabled);
    }
    fn save_mode(&mut self, mode: Mode) {
        self.inner.save_mode(mode);
    }
    fn restore_mode(&mut self, mode: Mode) {
        self.inner.restore_mode(mode);
    }
    fn top_and_bottom_margin(&mut self, top: u16, bottom: u16) {
        self.inner.top_and_bottom_margin(top, bottom);
    }
    fn left_and_right_margin(&mut self, left: u16, right: u16) {
        self.inner.left_and_right_margin(left, right);
    }
    fn left_and_right_margin_ambiguous(&mut self) {
        self.inner.left_and_right_margin_ambiguous();
    }
    fn configure_charset(&mut self, intermediates: &[u8], set: qwertty_term_vt::charsets::Charset) {
        self.inner.configure_charset(intermediates, set);
    }
    fn invoke_charset(
        &mut self,
        active: qwertty_term_vt::charsets::ActiveSlot,
        slot: qwertty_term_vt::charsets::Slots,
        single: bool,
    ) {
        self.inner.invoke_charset(active, slot, single);
    }
    fn set_attribute(&mut self, attr: sgr::Attribute) {
        self.inner.set_attribute(attr);
    }
    fn protected_mode(&mut self, mode: qwertty_term_vt::terminal::ProtectedMode) {
        self.inner.protected_mode(mode);
    }
    fn active_status_display(&mut self, display: qwertty_term_vt::terminal::StatusDisplay) {
        self.inner.active_status_display(display);
    }
    fn decaln(&mut self) {
        self.inner.decaln();
    }
    fn print_repeat(&mut self, count: u16) {
        self.inner.print_repeat(count);
    }
    fn kitty_keyboard_query(&mut self) {
        self.inner.kitty_keyboard_query();
    }
    fn kitty_keyboard_push(&mut self, flags: qwertty_term_vt::screen::kitty_key::Flags) {
        self.inner.kitty_keyboard_push(flags);
    }
    fn kitty_keyboard_pop(&mut self, count: u16) {
        self.inner.kitty_keyboard_pop(count);
    }
    fn kitty_keyboard_set(
        &mut self,
        mode: qwertty_term_vt::screen::kitty_key::SetMode,
        flags: qwertty_term_vt::screen::kitty_key::Flags,
    ) {
        self.inner.kitty_keyboard_set(mode, flags);
    }
    fn title_push(&mut self, index: u16) {
        self.inner.title_push(index);
    }
    fn title_pop(&mut self, index: u16) {
        self.inner.title_pop(index);
    }
    fn mouse_shift_capture(&mut self, capture: bool) {
        self.inner.mouse_shift_capture(capture);
    }
    fn cursor_style(&mut self, style: CursorStyle) {
        self.inner.cursor_style(style);
    }
    fn window_title(&mut self, title: &str) {
        self.inner.window_title(title);
    }
    fn report_pwd(&mut self, url: &str) {
        self.inner.report_pwd(url);
    }
    fn semantic_prompt(&mut self, cmd: &osc::SemanticPrompt) {
        self.inner.semantic_prompt(cmd);
    }
    fn start_hyperlink(&mut self, uri: &str, id: Option<&str>) {
        self.inner.start_hyperlink(uri, id);
    }
    fn end_hyperlink(&mut self) {
        self.inner.end_hyperlink();
    }
    fn color_operation(&mut self, requests: &osc::ColorList, terminator: osc::Terminator) {
        self.inner.color_operation(requests, terminator);
    }
    fn kitty_color(&mut self, cmd: &osc::KittyColorProtocol) {
        self.inner.kitty_color(cmd);
    }
    fn mouse_shape(&mut self, value: &str) {
        self.inner.mouse_shape(value);
    }
    fn clipboard(&mut self, kind: u8, data: &str) {
        self.inner.clipboard(kind, data);
    }
    fn show_desktop_notification(&mut self, title: &str, body: &str) {
        self.inner.show_desktop_notification(title, body);
    }
    fn progress_report(&mut self, report: osc::ProgressReport) {
        self.inner.progress_report(report);
    }
    fn device_attributes(&mut self, req: DeviceAttributesReq) {
        self.inner.device_attributes(req);
    }
    fn device_status(&mut self, req: DeviceStatusReq) {
        self.inner.device_status(req);
    }
    fn request_mode(&mut self, mode: Mode) {
        self.inner.request_mode(mode);
    }
    fn request_mode_unknown(&mut self, mode_raw: u16, ansi: bool) {
        self.inner.request_mode_unknown(mode_raw, ansi);
    }
    fn decrqss(&mut self, setting: dcs::Decrqss) {
        self.inner.decrqss(setting);
    }
    fn xtversion(&mut self) {
        self.inner.xtversion();
    }
    fn xtgettcap(&mut self, cmd: &mut dcs::XtGetTcap) {
        self.inner.xtgettcap(cmd);
    }
    fn apc_start(&mut self) {
        self.inner.apc_start();
    }
    fn apc_put(&mut self, byte: u8) {
        self.inner.apc_put(byte);
    }
    fn apc_end(&mut self) {
        self.inner.apc_end();
    }
    fn dcs_hook(&mut self, dcs: qwertty_term_vt::parser::Dcs) {
        self.inner.dcs_hook(dcs);
    }
    fn dcs_put(&mut self, byte: u8) {
        self.inner.dcs_put(byte);
    }
    fn dcs_unhook(&mut self) {
        self.inner.dcs_unhook();
    }
    fn size_report(&mut self, style: SizeReportStyle) {
        self.inner.size_report(style);
    }
    fn modify_key_format(&mut self, format: ModifyKeyFormat) {
        self.inner.modify_key_format(format);
    }
}
