import { useState } from 'react'
import { translate } from '~renderer/i18n/i18n'
import { ArrowElbowDownLeft as CornerDownLeft } from '~renderer/icons/hugeicons'
import { useMountedRef } from '~renderer/react/use-mounted-ref'
import { Button } from '~renderer/ui/button'
import { Textarea } from '~renderer/ui/textarea'

import { formatMarkdownReviewNotes, type MarkdownReviewNote } from '../markdown-review-notes'
import { NotesSendMenu } from '../notes-send-menu'

type MarkdownSingleNoteSendMenuProps = {
  content: string
  filePath: string
  modeSlot: string
  note: MarkdownReviewNote
  onDelivered: (notes: readonly MarkdownReviewNote[]) => void
  worktreeId: string
}

export function MarkdownSingleNoteSendMenu({
  content,
  filePath,
  modeSlot,
  note,
  onDelivered,
  worktreeId
}: MarkdownSingleNoteSendMenuProps): React.JSX.Element {
  const scopes = [
    {
      id: 'note',
      label: translate('auto.components.editor.MarkdownPreview.f37b98999e', 'This note'),
      notes: note.sentAt ? [] : [note],
      prompt: formatMarkdownReviewNotes([note], content)
    }
  ]
  return (
    <NotesSendMenu
      worktreeId={worktreeId}
      groupId={worktreeId}
      modeIdParts={['markdown-notes', worktreeId, filePath, modeSlot, note.id]}
      scopes={scopes}
      targetModeLabel="This note"
      triggerClassName="agentstart-diff-comment-pill-btn"
      disabledTooltip="Note already sent"
      onDelivered={onDelivered}
    />
  )
}

type MarkdownAnnotationComposerProps = {
  lineNumber: number
  onCancel: () => void
  onSubmit: (body: string) => Promise<boolean>
  startLine?: number
}

export function MarkdownAnnotationComposer({
  onCancel,
  onSubmit
}: MarkdownAnnotationComposerProps): React.JSX.Element {
  const [body, setBody] = useState('')
  const [isSubmitting, setIsSubmitting] = useState(false)
  const mountedRef = useMountedRef()
  const trimmedBody = body.trim()

  const submit = async (): Promise<void> => {
    if (isSubmitting || !trimmedBody) {
      return
    }
    setIsSubmitting(true)
    try {
      const didSubmit = await onSubmit(trimmedBody)
      if (mountedRef.current && didSubmit) {
        setBody('')
      }
    } finally {
      if (mountedRef.current) {
        setIsSubmitting(false)
      }
    }
  }

  return (
    <div
      className="mt-0 max-w-none scroll-m-3 overflow-hidden rounded-md border border-[color-mix(in_srgb,var(--foreground)_18%,transparent)] bg-[var(--editor-surface)] p-2 @max-[760px]/markdown-preview:mt-1.5"
      onClick={(event) => event.stopPropagation()}
    >
      <div className="agentstart-diff-comment-popover-label">
        {translate('auto.components.editor.MarkdownPreview.b1bfc04034', 'Selected text')}
      </div>
      <Textarea
        ref={(textarea) => textarea?.focus()}
        className="agentstart-diff-comment-popover-textarea focus-visible:border-ring outline-none"
        placeholder={translate(
          'auto.components.editor.MarkdownPreview.d737791433',
          'Add note for the AI'
        )}
        value={body}
        onChange={(event) => setBody(event.target.value)}
        onKeyDown={(event) => {
          if (event.key === 'Escape') {
            event.preventDefault()
            onCancel()
          } else if (event.key === 'Enter' && !event.nativeEvent.isComposing && !event.shiftKey) {
            event.preventDefault()
            void submit()
          }
        }}
        rows={3}
      />
      <div className="agentstart-diff-comment-popover-footer">
        <Button variant="ghost" size="sm" onClick={onCancel} disabled={isSubmitting}>
          {translate('auto.components.editor.MarkdownPreview.e4683f70c4', 'Cancel')}
        </Button>
        <Button size="sm" onClick={() => void submit()} disabled={isSubmitting || !trimmedBody}>
          {isSubmitting
            ? translate('auto.components.editor.MarkdownPreview.d652c87c91', 'Saving…')
            : translate('auto.components.editor.MarkdownPreview.13f94d760c', 'Add note')}
          {!isSubmitting ? <CornerDownLeft className="ml-1 size-3 opacity-70" /> : null}
        </Button>
      </div>
    </div>
  )
}
