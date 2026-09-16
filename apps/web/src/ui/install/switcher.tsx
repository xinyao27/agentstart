import { CheckmarkCircle02Icon, Copy01Icon } from '@hugeicons/core-free-icons'
import { HugeiconsIcon } from '@hugeicons/react'
import { useEffect, useRef, useState } from 'react'

const COPIED_LABEL_MS = 2000

/**
 * Why: a closed set, not two optional fields. An entry is either a command — which
 * gets the copy control — or content that stands on its own.
 */
export type SwitcherEntry =
  | { label: string; command: string }
  | { label: string; content: React.ReactNode }

export type InstallSwitcherProps = {
  entries: readonly SwitcherEntry[]
}

/**
 * Why: one box, one entry on screen. Quoting every command and channel at once stacks
 * rows the reader needs exactly one of, and the homepage has to stay small — so the
 * others sit one click away instead of one scroll away.
 *
 * Why: `Copy` and `Copied` are stacked in one grid cell so the button always holds the
 * width of the longer label. Swapping the text must not resize the control and reflow
 * what sits beside it.
 */
export function InstallSwitcher({ entries }: InstallSwitcherProps): React.JSX.Element {
  const [selectedIndex, setSelectedIndex] = useState(0)
  const [copied, setCopied] = useState(false)
  const resetTimer = useRef<ReturnType<typeof setTimeout> | undefined>(undefined)

  useEffect(() => () => clearTimeout(resetTimer.current), [])

  const selected = entries[selectedIndex]
  const selectedCommand = 'command' in selected ? selected.command : ''

  async function copyCommand(): Promise<void> {
    try {
      await navigator.clipboard.writeText(selectedCommand)
    } catch {
      // Why: the clipboard is the browser's to refuse, and a refused write is not a
      // copy. Leave the label at `Copy` rather than confirming something that did not
      // happen — the command is on screen to select by hand instead.
      return
    }
    setCopied(true)
    clearTimeout(resetTimer.current)
    resetTimer.current = setTimeout(() => setCopied(false), COPIED_LABEL_MS)
  }

  function selectEntry(index: number): void {
    clearTimeout(resetTimer.current)
    setCopied(false)
    setSelectedIndex(index)
  }

  return (
    <div className="border-hairline rounded-card flex flex-col gap-2 border px-4 py-3">
      <div className="flex items-center justify-between gap-3">
        <div
          role="group"
          aria-label="Install options"
          className="flex flex-wrap items-center gap-2 font-mono text-[12px]"
        >
          {entries.map((entry, index) => (
            <span key={entry.label} className="flex items-center gap-2">
              {index > 0 ? (
                <span className="text-faint" aria-hidden="true">
                  /
                </span>
              ) : null}
              <button
                type="button"
                aria-pressed={index === selectedIndex}
                onClick={() => selectEntry(index)}
                className={index === selectedIndex ? 'text-ink' : 'text-copy hover:text-ink'}
              >
                {entry.label}
              </button>
            </span>
          ))}
        </div>
        {'command' in selected ? (
          <button
            type="button"
            onClick={copyCommand}
            aria-label={`Copy the ${selected.label} install command`}
            className="text-muted hover:text-ink inline-flex shrink-0 items-center gap-1.5 font-mono text-[12px] transition-colors"
          >
            <HugeiconsIcon
              icon={copied ? CheckmarkCircle02Icon : Copy01Icon}
              className="size-3.5"
              aria-hidden="true"
            />
            <span className="grid" aria-hidden="true">
              <span className="invisible col-start-1 row-start-1">Copied</span>
              <span className="col-start-1 row-start-1">{copied ? 'Copied' : 'Copy'}</span>
            </span>
          </button>
        ) : null}
      </div>
      {/* Why: every entry stays in the document and only the selected one is visible.
          Unmounting the others would leave the prerendered page — which is what a
          crawler and a reader with JS off both get — without the Windows command or
          the TestFlight and extension links at all. The `hidden` attribute removes an
          entry from the layout and the accessibility tree, so the visible result is
          one entry at a time either way. */}
      {entries.map((entry, index) => (
        <div key={entry.label} hidden={index !== selectedIndex}>
          {'command' in entry ? (
            <code className="text-ink font-mono text-[14px] break-words">{entry.command}</code>
          ) : (
            entry.content
          )}
        </div>
      ))}
      <span role="status" className="sr-only">
        {copied ? `Copied the ${selected.label} install command` : ''}
      </span>
    </div>
  )
}
