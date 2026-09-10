import { useLayoutEffect, useRef, useState, type ReactNode } from 'react'
import { getDiffCommentLineLabel } from '~renderer/editor/diff-comment-compat'
import { openHttpLink } from '~renderer/editor/http-link-routing'
import { translate } from '~renderer/i18n/i18n'
import { Pencil, Trash, ArrowElbowDownLeft as CornerDownLeft } from '~renderer/icons/hugeicons'
import { useMountedRef } from '~renderer/react/use-mounted-ref'
import { Button } from '~renderer/ui/button'
import { Textarea } from '~renderer/ui/textarea'

import './diff-comment-styles.css'

// Why: the saved-note card lives inside a Monaco view zone's DOM node.
// useDiffCommentDecorator creates a React root per zone and renders this
// component into it so we can use the shared Hugeicons adapter and JSX instead of
// hand-built DOM + inline SVG strings.
//
// User-facing copy uses "Note" rather than "Comment" so it is not confused
// with GitHub PR review comments (which some diff-view surfaces also render).
// Internal types/ids (`DiffComment`, `diffComments`, `addDiffComment`) keep
// the old names so we don't have to migrate the persisted WorktreeMeta shape.

type Props = {
  lineNumber: number
  startLine?: number
  label?: string | null
  quote?: string
  body: string
  sentAt?: number
  author?: string
  createdAtLabel?: string
  url?: string
  onDelete?: () => void
  // Why: Monaco view zones have a fixed `heightInPx` set at insertion time
  // and aren't auto-measured. While the user is in edit mode the textarea
  // grows, so the parent decorator passes a callback we fire on resize and
  // it re-syncs the zone height. Without this the editor inputs would clip.
  onContentResize?: () => void
  onSubmitEdit?: (body: string) => Promise<boolean>
  headerActions?: ReactNode
}

export function DiffCommentCard({
  lineNumber,
  startLine,
  label,
  quote,
  body,
  sentAt,
  author,
  createdAtLabel,
  url,
  onDelete,
  onContentResize,
  onSubmitEdit,
  headerActions
}: Props): React.JSX.Element {
  const [editing, setEditing] = useState(false)
  const [draft, setDraft] = useState(body)
  const [submitting, setSubmitting] = useState(false)
  const mountedRef = useMountedRef()
  const textareaRef = useRef<HTMLTextAreaElement | null>(null)
  const resizeAfterCloseRef = useRef(false)

  // Why: stash `onContentResize` in a ref so the layout/resize effects only
  // re-run on `editing` transitions. The decorator passes a fresh arrow every
  // render; depending on it directly would re-fire the layout effect on every
  // unrelated parent render and yank the caret to the textarea's end while
  // the user is mid-edit.
  const onContentResizeRef = useRef(onContentResize)
  useLayoutEffect(() => {
    onContentResizeRef.current = onContentResize
  }, [onContentResize])

  // Why: focus + auto-grow the textarea on entering edit mode. Layout effect
  // so the height is set before the browser paints — a measurement pass on
  // the next animation frame would visibly jump from 0 to N px.
  useLayoutEffect(() => {
    if (!editing) {
      if (resizeAfterCloseRef.current) {
        resizeAfterCloseRef.current = false
        onContentResizeRef.current?.()
      }
      return
    }
    const el = textareaRef.current
    if (!el) {
      return
    }
    el.focus()
    el.setSelectionRange(el.value.length, el.value.length)
    onContentResizeRef.current?.()
  }, [editing])

  const scheduleContentResizeAfterClose = (): void => {
    // Why: closing edit mode removes the textarea/footer before Monaco can
    // re-measure the view zone. Let the layout effect run after React commits
    // the body-only card so async saves cannot measure the old edit height.
    resizeAfterCloseRef.current = true
  }

  const handleStartEdit = (): void => {
    setDraft(body)
    setEditing(true)
  }

  const handleCancel = (): void => {
    scheduleContentResizeAfterClose()
    setEditing(false)
    setDraft(body)
  }

  const trimmedDraft = draft.trim()
  const canSubmit = !submitting && trimmedDraft.length > 0 && trimmedDraft !== body
  const lineLabel =
    label === undefined ? getDiffCommentLineLabel({ lineNumber, startLine }).toLowerCase() : label
  const metaText = [author || 'Note', lineLabel, createdAtLabel || (sentAt ? 'sent' : null)]
    .filter(Boolean)
    .join(' ')

  const handleSubmit = async (): Promise<void> => {
    if (!canSubmit || !onSubmitEdit) {
      return
    }
    setSubmitting(true)
    try {
      const ok = await onSubmitEdit(trimmedDraft)
      if (ok && mountedRef.current) {
        scheduleContentResizeAfterClose()
        setEditing(false)
      }
    } catch (err) {
      // Why: surface the error in the console but keep the editor open with
      // the draft intact so the user can retry. Without this, a rejection from
      // `onSubmitEdit` becomes an unhandled promise rejection at the call sites
      // (`void handleSubmit()`).
      console.error('Failed to submit diff comment edit:', err)
    } finally {
      if (mountedRef.current) {
        setSubmitting(false)
      }
    }
  }

  return (
    <div className="agentstart-diff-comment-card">
      <div className="agentstart-diff-comment-content-col">
        {/* Header Row */}
        <div className="agentstart-diff-comment-header">
          <div className="agentstart-diff-comment-meta-group">{metaText}</div>

          {/* Action buttons pill (only shown if not editing) */}
          {!editing && (
            <div
              className="agentstart-diff-comment-actions-pill"
              onMouseDown={(ev) => ev.stopPropagation()}
            >
              {headerActions}
              {headerActions && (url || onSubmitEdit || onDelete) && (
                <span className="agentstart-diff-comment-pill-divider" />
              )}
              {url && (
                <>
                  <Button
                    variant="ghost"
                    size="xs"
                    type="button"
                    className="agentstart-diff-comment-pill-btn focus-visible:bg-accent h-auto border-0 p-0"
                    title={translate(
                      'auto.components.diff.comments.DiffCommentCard.508ee678a5',
                      'Open in browser'
                    )}
                    aria-label={translate(
                      'auto.components.diff.comments.DiffCommentCard.508ee678a5',
                      'Open in browser'
                    )}
                    onClick={(ev) => {
                      ev.preventDefault()
                      ev.stopPropagation()
                      openHttpLink(url, { event: ev })
                    }}
                  >
                    {translate('auto.components.diff.comments.DiffCommentCard.6978871a3d', 'Open')}
                  </Button>
                  {(onSubmitEdit || onDelete) && (
                    <span className="agentstart-diff-comment-pill-divider" />
                  )}
                </>
              )}
              {onSubmitEdit && (
                <>
                  <Button
                    variant="ghost"
                    size="xs"
                    type="button"
                    className="agentstart-diff-comment-pill-btn focus-visible:bg-accent h-auto border-0 p-0"
                    title={translate(
                      'auto.components.diff.comments.DiffCommentCard.cad3384faa',
                      'Edit note'
                    )}
                    aria-label={translate(
                      'auto.components.diff.comments.DiffCommentCard.cad3384faa',
                      'Edit note'
                    )}
                    onClick={(ev) => {
                      ev.preventDefault()
                      ev.stopPropagation()
                      handleStartEdit()
                    }}
                  >
                    <Pencil className="size-3" />
                  </Button>
                  {onDelete && <span className="agentstart-diff-comment-pill-divider" />}
                </>
              )}
              {onDelete && (
                <Button
                  variant="ghost"
                  size="xs"
                  type="button"
                  className="agentstart-diff-comment-pill-btn agentstart-diff-comment-pill-btn-danger focus-visible:bg-accent h-auto border-0 p-0"
                  title={translate(
                    'auto.components.diff.comments.DiffCommentCard.cce596969e',
                    'Delete note'
                  )}
                  aria-label={translate(
                    'auto.components.diff.comments.DiffCommentCard.cce596969e',
                    'Delete note'
                  )}
                  onClick={(ev) => {
                    ev.preventDefault()
                    ev.stopPropagation()
                    onDelete()
                  }}
                >
                  <Trash className="size-3" />
                </Button>
              )}
            </div>
          )}
        </div>

        {/* Quote Block */}
        {quote ? (
          <div className="agentstart-diff-comment-quote">
            <div className="agentstart-diff-comment-quote-text">{quote}</div>
          </div>
        ) : null}

        {/* Body or Edit Mode */}
        {editing ? (
          <div className="mt-1 flex flex-col gap-2">
            <Textarea
              ref={textareaRef}
              className="agentstart-diff-comment-popover-textarea focus-visible:border-ring outline-none"
              value={draft}
              onChange={(e) => {
                setDraft(e.target.value)
                onContentResizeRef.current?.()
              }}
              onKeyDown={(e) => {
                if (e.key === 'Escape') {
                  e.preventDefault()
                  handleCancel()
                  return
                }
                if (e.key === 'Enter' && !e.nativeEvent.isComposing && !e.shiftKey) {
                  e.preventDefault()
                  if (!canSubmit) {
                    return
                  }
                  void handleSubmit()
                }
              }}
              rows={3}
            />
            <div className="agentstart-diff-comment-popover-footer">
              <Button variant="ghost" size="sm" onClick={handleCancel} disabled={submitting}>
                {translate('auto.components.diff.comments.DiffCommentCard.0203bed775', 'Cancel')}
              </Button>
              <Button
                size="sm"
                onClick={() => void handleSubmit()}
                disabled={!canSubmit}
                title={
                  submitting
                    ? translate(
                        'auto.components.diff.comments.DiffCommentCard.bb0a55f856',
                        'Saving…'
                      )
                    : undefined
                }
              >
                {translate('auto.components.diff.comments.DiffCommentCard.109a791e7b', 'Save')}
                <CornerDownLeft className="ml-1 size-3 opacity-70" />
              </Button>
            </div>
          </div>
        ) : (
          <div className="agentstart-diff-comment-body">{body}</div>
        )}
      </div>
    </div>
  )
}
