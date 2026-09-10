import { DiffCommentPopover } from '~renderer/diff-comments/diff-comment-popover'
import { translate } from '~renderer/i18n/i18n'
import { Plus } from '~renderer/icons/hugeicons'
import { Button } from '~renderer/ui/button'

import type { RichMarkdownAnnotationTarget } from './review-annotations'

type RichMarkdownAnnotationOverlayProps = {
  target: RichMarkdownAnnotationTarget | null
  popover: RichMarkdownAnnotationTarget | null
  markdownSourceLineOffset: number
  onOpenPopover: () => void
  onCancelPopover: () => void
  onSubmit: (body: string) => Promise<void>
}

export function RichMarkdownAnnotationOverlay({
  target,
  popover,
  markdownSourceLineOffset,
  onOpenPopover,
  onCancelPopover,
  onSubmit
}: RichMarkdownAnnotationOverlayProps): React.JSX.Element {
  return (
    <>
      {target ? (
        <Button
          variant="ghost"
          size="xs"
          type="button"
          // Why: `.agentstart-diff-comment-add-btn` is unlayered CSS in main.css (owned
          // by the diff-comments feature, out of scope here) and always wins over
          // layered Tailwind utilities, so the themed always-visible treatment for
          // this selection-triggered button stays the paired
          // `rich-markdown-comment-add-btn` override in rich-markdown-content.css
          // rather than fighting the base rule with Tailwind classNames.
          className="agentstart-diff-comment-add-btn rich-markdown-comment-add-btn focus-visible:bg-accent h-auto border-0 p-0"
          style={{
            top: target.buttonTop ?? 56,
            left: target.buttonLeft ?? 16
          }}
          title={translate(
            'auto.components.editor.RichMarkdownAnnotationOverlay.6f2f3a6001',
            'Add review note'
          )}
          aria-label={translate(
            'auto.components.editor.RichMarkdownAnnotationOverlay.6f2f3a6001',
            'Add review note'
          )}
          onMouseDown={(event) => {
            event.preventDefault()
            event.stopPropagation()
          }}
          onClick={(event) => {
            event.preventDefault()
            event.stopPropagation()
            onOpenPopover()
          }}
        >
          <Plus className="size-3.5" />
        </Button>
      ) : null}
      {popover ? (
        <DiffCommentPopover
          key={`${popover.startLine ?? popover.lineNumber}:${popover.lineNumber}`}
          lineNumber={popover.lineNumber + markdownSourceLineOffset}
          startLine={
            popover.startLine === undefined
              ? undefined
              : popover.startLine + markdownSourceLineOffset
          }
          top={popover.top}
          left={popover.left}
          title={translate(
            'auto.components.editor.RichMarkdownAnnotationOverlay.069b5677b8',
            'Selected text'
          )}
          onCancel={onCancelPopover}
          onSubmit={onSubmit}
        />
      ) : null}
    </>
  )
}
