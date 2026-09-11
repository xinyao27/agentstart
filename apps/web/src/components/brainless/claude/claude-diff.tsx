import { cn } from '../../../ui/class-names'

/**
 * ClaudeDiff — Claude Code's inline edit hunk (the ⏺ Update / ⎿ summary + the
 * +/- lines). Added/removed rows carry semantic tinted backgrounds and an
 * off-screen "added"/"removed" label so the diff is legible without color.
 *
 * Vendored from https://brainless.swerdlow.dev/r/claude-diff.json; the only
 * edit is that colours read the --claude-* variables in index.css, so the hunk
 * survives this page's light theme.
 */
export type DiffLine = {
  type: 'add' | 'del' | 'ctx'
  n?: number
  text: string
}

const GREEN = 'var(--claude-ok)'

export function ClaudeDiff({
  file,
  summary,
  lines,
  className
}: {
  file: string
  summary?: string
  lines: DiffLine[]
  className?: string
}) {
  return (
    <div className={cn('min-w-0 font-mono text-[13px] leading-[1.55]', className)}>
      <div className="flex min-w-0 flex-wrap items-baseline gap-x-2">
        <span aria-hidden className="shrink-0" style={{ color: GREEN }}>
          ⏺
        </span>
        <span style={{ color: 'var(--claude-fg)' }}>Update</span>
        <span className="min-w-0 break-all">
          <span style={{ color: 'var(--claude-punct)' }}>(</span>
          <span style={{ color: 'var(--claude-arg)' }}>{file}</span>
          <span style={{ color: 'var(--claude-punct)' }}>)</span>
        </span>
      </div>
      {summary ? (
        <div className="flex min-w-0 items-baseline gap-2" style={{ color: 'var(--claude-dim)' }}>
          {/* invisible status glyph spacer: aligns ⎿ under "Update" */}
          <span aria-hidden className="invisible shrink-0">
            ⏺
          </span>
          <span aria-hidden className="shrink-0" style={{ color: 'var(--claude-punct)' }}>
            ⎿
          </span>
          <span className="min-w-0 break-words">{summary}</span>
        </div>
      ) : null}

      <pre
        className="mt-1 min-w-0 overflow-x-auto rounded-none border py-1.5 pr-3 pl-2"
        style={{
          borderColor: 'var(--claude-code-border)',
          background: 'var(--claude-code-bg)'
        }}
      >
        {lines.map((l, i) => {
          const bg =
            l.type === 'add'
              ? 'color-mix(in srgb, var(--claude-ok) 12%, transparent)'
              : l.type === 'del'
                ? 'color-mix(in srgb, var(--claude-err) 14%, transparent)'
                : 'transparent'
          const mark = l.type === 'add' ? '+' : l.type === 'del' ? '-' : ' '
          const markColor =
            l.type === 'add'
              ? GREEN
              : l.type === 'del'
                ? 'var(--claude-err)'
                : 'var(--claude-punct)'
          return (
            <div key={i} className="flex min-w-0" style={{ background: bg }}>
              <span
                className="w-9 shrink-0 pr-2 text-right select-none"
                style={{ color: 'var(--claude-lineno)' }}
              >
                {l.n ?? ''}
              </span>
              <span className="w-3 shrink-0 select-none" style={{ color: markColor }}>
                {mark}
              </span>
              <span
                className="min-w-0 break-all"
                style={{
                  color: l.type === 'ctx' ? 'var(--claude-dim)' : 'var(--claude-fg)'
                }}
              >
                {l.type !== 'ctx' ? (
                  <span className="sr-only">{l.type === 'add' ? 'added: ' : 'removed: '}</span>
                ) : null}
                {l.text}
              </span>
            </div>
          )
        })}
      </pre>
    </div>
  )
}
