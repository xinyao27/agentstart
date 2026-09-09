// Why: emulator replies bypass input debounce so raw-mode queries do not time out.
// Modified F3 shares the CPR grammar; it safely takes the same immediate path.

const ESC = String.fromCharCode(0x1b)

/* oxlint-disable no-control-regex -- grammars match terminal ESC/BEL sequences by definition */
const CPR_OR_DSR_RE = new RegExp('^\\u001b\\[\\??[0-9;]*[Rn]$')
const DEVICE_ATTRIBUTES_RE = new RegExp('^\\u001b\\[[?>=]?[0-9;]*c$')
const WINDOW_SIZE_REPORT_RE = new RegExp('^\\u001b\\[[468];[0-9]+;[0-9]+t$')
const DECRPM_RE = new RegExp('^\\u001b\\[\\??[0-9;]*\\$y$')
const KITTY_FLAGS_RE = new RegExp('^\\u001b\\[\\?[0-9]+u$')
const OSC_RESPONSE_RE = new RegExp('^\\u001b\\][0-9]+;[^\\u0007\\u001b]*(?:\\u0007|\\u001b\\\\)$')
const DCS_RESPONSE_RE = new RegExp('^\\u001bP(?:[01]\\$r[^\\u001b]*|>\\|[^\\u001b]*)\\u001b\\\\$')
/* oxlint-enable no-control-regex */

export function isTerminalQueryReply(data: string): boolean {
  if (data.length < 3 || data[0] !== ESC) {
    return false
  }
  return (
    CPR_OR_DSR_RE.test(data) ||
    DEVICE_ATTRIBUTES_RE.test(data) ||
    WINDOW_SIZE_REPORT_RE.test(data) ||
    DECRPM_RE.test(data) ||
    KITTY_FLAGS_RE.test(data) ||
    OSC_RESPONSE_RE.test(data) ||
    DCS_RESPONSE_RE.test(data)
  )
}
