import { cn } from 'cnfast'

import { ClaudeDiff } from '../../components/brainless/claude/claude-diff'
import { ClaudeHeader } from '../../components/brainless/claude/claude-header'
import { ClaudeMessage } from '../../components/brainless/claude/claude-message'
import { ClaudePrompt } from '../../components/brainless/claude/claude-prompt'
import { ClaudeThinking } from '../../components/brainless/claude/claude-thinking'
import { ClaudeToolCall } from '../../components/brainless/claude/claude-tool-call'
import {
  AGENT_CWD,
  AGENT_MODEL,
  AGENT_USER,
  AGENT_VERSION,
  PROMPT,
  SESSION_ANSWER,
  SESSION_TRANSCRIPT
} from './state'
import type { DemoState, SessionEntry } from './state'

export type SessionViewProps = {
  state: DemoState
  /** The phone renders the same session at a tighter scale. */
  compact?: boolean
}

const entryKey = (entry: SessionEntry): string =>
  entry.kind === 'tool' ? `tool-${entry.tool}` : `edit-${entry.file}`

/**
 * Why: desktop and phone render this one component from one state object, so the
 * two surfaces cannot drift — the mirroring the beat is claiming is structural
 * rather than two scripts kept in step by hand.
 *
 * Every line of the session is a brainless component rather than terminal chrome
 * drawn by hand, so the welcome box stays a fieldset/legend, a tool line stays a
 * keyboard-operable <details>, the working line stays an aria-live region and
 * the composer stays a real input. What the demo owns is the script; what the
 * output looks like is Claude Code's, not this page's guess at it.
 */
export function SessionView({ state, compact = false }: SessionViewProps): React.JSX.Element {
  // Why: size and leading must ship as one class. twMerge treats `text-[13px]`
  // as a font-size utility that may carry its own line-height, so a separate
  // `leading-*` placed before it is dropped — silently, and the line inherits.
  const line = compact ? 'text-[9px]/[1.55]' : 'text-[12px]/[1.55]'
  const typed = PROMPT.slice(0, state.promptChars)
  const entries = SESSION_TRANSCRIPT.slice(0, state.transcript).filter(
    (entry) => !compact || entry.wide !== true
  )

  return (
    // Why: a flex item with only min-w-0 shrinks to its content — the desktop
    // pane needs flex-1 to keep filling its column.
    <div className="flex h-full w-full min-w-0 flex-1 flex-col font-mono">
      {/* Why: a terminal scrolls off the top, and this transcript outgrows the
          pane on purpose. justify-end with the overflow clipped puts the oldest
          output past the top edge and keeps the newest line against the
          composer — the same place a real session leaves it, and without a
          scrollbar the visitor has no way to drive. */}
      <div
        className={cn(
          'flex min-h-0 flex-1 flex-col justify-end gap-2 overflow-hidden',
          compact ? 'p-2' : 'p-3.5'
        )}
      >
        {/* Why: the welcome box is a two-up grid around a sprite logo — it needs
            more width than the phone screen has, and a phone client would not
            print the desktop launch banner anyway. */}
        {compact ? null : (
          <ClaudeHeader
            version={AGENT_VERSION}
            user={AGENT_USER}
            model={AGENT_MODEL}
            org=""
            cwd={AGENT_CWD}
            tips={[]}
            whatsNew={[]}
            logoScale={3}
            className={cn('shrink-0', line)}
          />
        )}

        {state.promptChars > 0 ? (
          <ClaudeMessage role="user" className={cn('shrink-0', line)}>
            {typed}
            {state.promptChars < PROMPT.length ? <span className="caret">▊</span> : null}
          </ClaudeMessage>
        ) : null}

        {entries.map((entry) =>
          entry.kind === 'tool' ? (
            <ClaudeToolCall
              key={entryKey(entry)}
              tool={entry.tool}
              arg={entry.arg}
              result={entry.result}
              className={cn('shrink-0', line)}
            />
          ) : (
            <ClaudeDiff
              key={entryKey(entry)}
              file={entry.file}
              summary={entry.summary}
              lines={entry.lines}
              className={cn('shrink-0', line)}
            />
          )
        )}

        {state.working ? (
          <ClaudeThinking showTokens={false} className={cn('shrink-0', line)} />
        ) : null}

        {state.answered ? (
          <ClaudeMessage className={cn('shrink-0', line)}>{SESSION_ANSWER}</ClaudeMessage>
        ) : null}

        {state.followUp ? (
          <ClaudeMessage role="user" className={cn('shrink-0', line)}>
            {state.followUp}
          </ClaudeMessage>
        ) : null}

        {state.followUpWorking ? (
          <ClaudeThinking showTokens={false} className={cn('shrink-0', line)} />
        ) : null}
      </div>

      {/* Composer — the surface being driven from the phone. Why: readOnly
          because the script owns the value; without it React reports a
          controlled input with no change handler. The mode line is dropped on
          the phone, where it wraps to three. */}
      <ClaudePrompt
        value={state.composerText}
        readOnly
        effort={false}
        mode={compact ? false : 'auto'}
        className={cn('shrink-0', compact ? 'px-2 py-1.5' : 'px-3.5 py-2', line)}
        inputClassName={line}
      />
    </div>
  )
}
