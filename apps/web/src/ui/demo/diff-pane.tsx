import { cn } from 'cnfast'

import { DIFF_FILE, DIFF_LINES } from './state'
import type { DemoState, DiffLine } from './state'

// Why: the Pierre model the desktop already renders (@pierre/diffs, wired up in
// editor/pierre-diff-viewer.tsx) uses a number column tinted stronger than its
// row, and two background tiers per changed line — a wash across the whole row
// plus a denser highlight on only the characters that changed.
const rowClasses: Record<DiffLine['kind'], string> = {
  add: 'bg-add-bg text-add-ink',
  del: 'bg-del-bg text-del-ink',
  context: 'text-copy',
  meta: 'text-faint'
}

const gutterClasses: Record<DiffLine['kind'], string> = {
  add: 'bg-add-gutter-bg text-add-ink',
  del: 'bg-del-gutter-bg text-del-ink',
  context: 'text-faint',
  meta: ''
}

const emphasisClasses: Record<DiffLine['kind'], string> = {
  add: 'bg-add-emphasis',
  del: 'bg-del-emphasis',
  context: '',
  meta: ''
}

const signFor: Record<DiffLine['kind'], string> = {
  add: '+',
  del: '-',
  context: ' ',
  meta: ' '
}

function LineText({ line }: { line: DiffLine }): React.JSX.Element {
  if (!line.emphasis) {
    return <>{line.text}</>
  }
  const [start, end] = line.emphasis
  return (
    <>
      {line.text.slice(0, start)}
      <span className={emphasisClasses[line.kind]}>{line.text.slice(start, end)}</span>
      {line.text.slice(end)}
    </>
  )
}

export type DiffPaneProps = {
  state: DemoState
}

export function DiffPane({ state }: DiffPaneProps): React.JSX.Element {
  return (
    <div className="flex min-w-0 flex-1 flex-col">
      <div className="border-hairline text-faint shrink-0 truncate border-b px-3 py-2 font-mono text-[11px]/[1.4]">
        {DIFF_FILE}
      </div>
      <div className="min-w-0 overflow-hidden font-mono text-[11px]/[19px]">
        {DIFF_LINES.slice(0, state.diffLines).map((line, index) =>
          line.kind === 'meta' ? (
            <div key={`meta-${index}`} className="text-faint bg-raised px-3 py-0.5">
              {line.text}
            </div>
          ) : (
            <div key={`${line.kind}-${line.number}-${index}`} className="grid grid-cols-[34px_1fr]">
              <span
                className={cn(
                  'shrink-0 pr-2 text-right tabular-nums select-none',
                  gutterClasses[line.kind]
                )}
              >
                {line.number}
              </span>
              <span className={cn('min-w-0 truncate pl-2 whitespace-pre', rowClasses[line.kind])}>
                <span className="select-none">{signFor[line.kind]} </span>
                <LineText line={line} />
              </span>
            </div>
          )
        )}
      </div>
    </div>
  )
}
