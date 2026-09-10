import { useRef, useState } from 'react'
import { toast } from 'sonner'
import { translate } from '~renderer/i18n/i18n'
import { ArrowElbowDownLeft as CornerDownLeft } from '~renderer/icons/hugeicons'
import {
  getCommentBodySubmitState,
  hasBoundedCommentBodyText
} from '~renderer/source-control/comment-submit-state'
import { Button } from '~renderer/ui/button'
import { Textarea } from '~renderer/ui/textarea'

export function PierreDiffCommentComposer({
  lineNumber,
  startLine,
  placeholder,
  submitLabel,
  submittingLabel,
  onCancel,
  onSubmit
}: {
  lineNumber: number
  startLine?: number
  placeholder?: string
  submitLabel?: string
  submittingLabel?: string
  onCancel: () => void
  onSubmit: (body: string) => Promise<void>
}): React.JSX.Element {
  const [body, setBody] = useState('')
  const [submitting, setSubmitting] = useState(false)
  const mountedRef = useRef(true)
  const canSubmit = hasBoundedCommentBodyText(body) && !submitting

  const submit = async (): Promise<void> => {
    if (!canSubmit) {
      return
    }
    const bodyState = getCommentBodySubmitState(body)
    if (bodyState.status === 'empty') {
      return
    }
    if (bodyState.status === 'too-large-leading-whitespace') {
      toast.error(
        translate(
          'auto.components.diff.comments.DiffCommentPopover.commentTooLarge',
          'Comment is too large to submit safely.'
        )
      )
      return
    }
    setSubmitting(true)
    try {
      await onSubmit(bodyState.body)
    } finally {
      if (mountedRef.current) {
        setSubmitting(false)
      }
    }
  }

  return (
    <div className="agentstart-diff-comment-inline">
      <div className="agentstart-diff-comment-card">
        <div className="agentstart-diff-comment-content-col gap-2">
          <div className="agentstart-diff-comment-header">
            <div className="agentstart-diff-comment-meta-group">
              {startLine && startLine !== lineNumber
                ? translate(
                    'auto.components.diff.comments.DiffCommentPopover.c845170b3b',
                    'Lines {{value0}}-{{value1}}',
                    { value0: startLine, value1: lineNumber }
                  )
                : translate(
                    'auto.components.diff.comments.DiffCommentPopover.e05063cfc1',
                    'Line {{value0}}',
                    { value0: lineNumber }
                  )}
            </div>
          </div>
          <Textarea
            ref={(node) => {
              if (node) {
                mountedRef.current = true
                node.focus()
              } else {
                mountedRef.current = false
              }
            }}
            className="agentstart-diff-comment-popover-textarea focus-visible:border-ring outline-none"
            placeholder={placeholder ?? 'Add note for the AI'}
            value={body}
            rows={3}
            onChange={(event) => setBody(event.target.value)}
            onKeyDown={(event) => {
              if (event.key === 'Escape') {
                event.preventDefault()
                onCancel()
                return
              }
              if (event.key === 'Enter' && !event.nativeEvent.isComposing && !event.shiftKey) {
                event.preventDefault()
                void submit()
              }
            }}
          />
          <div className="agentstart-diff-comment-popover-footer">
            <Button variant="ghost" size="sm" onClick={onCancel}>
              {translate('auto.components.diff.comments.DiffCommentPopover.2b3ce6d394', 'Cancel')}
            </Button>
            <Button size="sm" disabled={!canSubmit} onClick={() => void submit()}>
              {submitting ? (submittingLabel ?? 'Saving…') : (submitLabel ?? 'Add note')}
              {!submitting && <CornerDownLeft className="ml-1 size-3 opacity-70" />}
            </Button>
          </div>
        </div>
      </div>
    </div>
  )
}
