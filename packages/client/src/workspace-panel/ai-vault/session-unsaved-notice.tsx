import type React from 'react'
import { translate } from '~renderer/i18n/i18n'
import { Archive } from '~renderer/icons/hugeicons'
import type { AiVaultSession } from '~renderer/workspace-panel/ai-vault/session/record'
import {
  aiVaultSessionRecoverableSignalCount,
  isAiVaultSessionRecoverableEmpty
} from '~renderer/workspace-panel/ai-vault/session/recovery'

// Distinct state for a zero-turn transcript: the conversation was not persisted,
// but queued prompts and/or subagent transcripts may still be recoverable.
export function SessionUnsavedConversationNotice({
  session,
  logAvailable
}: {
  session: AiVaultSession
  // Whether an open-log affordance exists nearby; remote (SSH) sessions have
  // none, so the "open the log" hint would point at nothing.
  logAvailable: boolean
}): React.JSX.Element {
  const recoverable = isAiVaultSessionRecoverableEmpty(session)

  return (
    <section className="space-y-1.5">
      <div className="text-muted-foreground flex items-center gap-1.5 text-[11px] font-semibold tracking-[0.05em] uppercase">
        <Archive className="text-muted-foreground/80 size-3" />
        <span>
          {translate(
            'auto.components.right.sidebar.AiVaultSessionDetails.conversationNotSaved',
            'Conversation not saved'
          )}
        </span>
      </div>
      <div className="border-border/70 bg-foreground/[0.04] text-muted-foreground border border-dashed px-2.5 py-2 text-[11px] leading-4">
        {recoverable
          ? translate(
              'auto.components.right.sidebar.AiVaultSessionDetails.recoverableEmptyDetail',
              'This session has no saved conversation, but {{value0}} recoverable item(s) survive.',
              { value0: aiVaultSessionRecoverableSignalCount(session) }
            )
          : translate(
              'auto.components.right.sidebar.AiVaultSessionDetails.emptyConversationDetail',
              'This session has no saved conversation and cannot be resumed.'
            )}
        {recoverable && logAvailable
          ? ` ${translate(
              'auto.components.right.sidebar.AiVaultSessionDetails.recoverableEmptyOpenLogHint',
              'Open the log to recover them.'
            )}`
          : null}
        {recoverable ? (
          <SessionRecoverableSignalLines
            queuedMessageCount={session.queuedMessageCount}
            subagentTranscriptCount={session.subagentTranscriptCount}
          />
        ) : null}
      </div>
    </section>
  )
}

function SessionRecoverableSignalLines({
  queuedMessageCount,
  subagentTranscriptCount
}: {
  queuedMessageCount: number
  subagentTranscriptCount: number
}): React.JSX.Element {
  return (
    <ul className="text-foreground/80 mt-1.5 space-y-0.5 text-[11px] leading-4">
      {queuedMessageCount > 0 ? (
        <li>
          {translate(
            'auto.components.right.sidebar.AiVaultSessionDetails.queuedMessages',
            '{{value0}} queued message(s)',
            { value0: queuedMessageCount }
          )}
        </li>
      ) : null}
      {subagentTranscriptCount > 0 ? (
        <li>
          {translate(
            'auto.components.right.sidebar.AiVaultSessionDetails.subagentTranscripts',
            '{{value0}} subagent transcript(s)',
            { value0: subagentTranscriptCount }
          )}
        </li>
      ) : null}
    </ul>
  )
}
