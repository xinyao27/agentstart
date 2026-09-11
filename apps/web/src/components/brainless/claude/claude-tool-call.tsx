import * as React from 'react'

import { cn } from '../../../ui/class-names'

/**
 * ClaudeToolCall — Claude Code's collapsed tool/result line.
 *
 * In the terminal this is faked with box-drawing glyphs and a "ctrl+o to
 * expand" hint. Here it's a real <details> disclosure: keyboard-operable,
 * announced to screen readers, and it keeps the exact ⏺ / ⎿ visual grammar.
 *
 * Vendored from https://brainless.swerdlow.dev/r/claude-tool-call.json; the
 * only edit is that colours read the --claude-* variables in index.css, so the
 * line survives this page's light theme.
 */
type Status = 'success' | 'error' | 'pending'

const STATUS_COLOR: Record<Status, string> = {
  success: 'var(--claude-ok)',
  error: 'var(--claude-err)',
  pending: 'var(--claude-pending)'
}

export function ClaudeToolCall({
  tool,
  arg,
  result,
  status = 'success',
  defaultOpen = false,
  className,
  children
}: {
  tool: string
  arg?: string
  result: string
  status?: Status
  defaultOpen?: boolean
  className?: string
  children?: React.ReactNode
}) {
  const expandable = Boolean(children)

  return (
    <details
      open={defaultOpen}
      className={cn(
        'group font-mono text-[13px] leading-[1.55] [&_summary::-webkit-details-marker]:hidden',
        className
      )}
    >
      <summary
        className={cn(
          'list-none',
          expandable ? 'cursor-pointer' : 'cursor-default',
          'rounded-none outline-none focus-visible:ring-1 focus-visible:ring-[color-mix(in_srgb,var(--claude-arg)_60%,transparent)]'
        )}
      >
        <span className="flex min-w-0 items-baseline gap-2">
          <span aria-hidden className="shrink-0" style={{ color: STATUS_COLOR[status] }}>
            ⏺
          </span>
          <span className="min-w-0 break-words">
            <span style={{ color: 'var(--claude-fg)' }}>{tool}</span>
            {arg !== undefined ? (
              <>
                <span style={{ color: 'var(--claude-punct)' }}>(</span>
                <span style={{ color: 'var(--claude-arg)' }}>{arg}</span>
                <span style={{ color: 'var(--claude-punct)' }}>)</span>
              </>
            ) : null}
          </span>
        </span>
        <span className="flex min-w-0 items-baseline gap-2" style={{ color: 'var(--claude-dim)' }}>
          {/* invisible status glyph spacer: aligns ⎿ under the tool name */}
          <span aria-hidden className="invisible shrink-0">
            ⏺
          </span>
          <span className="flex min-w-0 items-baseline gap-2">
            <span aria-hidden className="shrink-0" style={{ color: 'var(--claude-punct)' }}>
              ⎿
            </span>
            <span className="min-w-0 break-words">
              {result}
              {expandable ? (
                <span className="ml-2 group-open:hidden" style={{ color: 'var(--claude-punct)' }}>
                  (ctrl+o to expand)
                </span>
              ) : null}
            </span>
          </span>
        </span>
      </summary>

      {expandable ? (
        <div className="mt-1 pl-[32px] whitespace-pre-wrap" style={{ color: 'var(--claude-dim)' }}>
          {children}
        </div>
      ) : null}
    </details>
  )
}
