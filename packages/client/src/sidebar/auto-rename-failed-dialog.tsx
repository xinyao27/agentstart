import { useEffect, useRef, useState } from 'react'
import { translate } from '~renderer/i18n/i18n'
import { WarningCircle as AlertCircle, Check, Copy } from '~renderer/icons/hugeicons'
import { shellClient } from '~renderer/runtime/shell-client'
import { useAppStore } from '~renderer/store/state'
import { Button } from '~renderer/ui/button'
import { Dialog, DialogContent, DialogFooter, DialogHeader, DialogTitle } from '~renderer/ui/dialog'

type FullOutputResult = {
  worktreeId: string
  error: string
  output: string | null
}

type AutoRenameFailedDialogProps = {
  open: boolean
  onOpenChange: (open: boolean) => void
  /** Worktree whose auto-rename failed; keys the full-output lookup. */
  worktreeId: string
  /** Sidebar name of the worktree whose auto-rename failed. */
  worktreeName: string
  /** Persisted failure message — headline plus a sanitized output excerpt. */
  error: string
}

/**
 * Modal that surfaces the auto-rename generation failure. It shows the full
 * CLI output when main still holds it (in-memory, lost on restart), falling
 * back to the persisted excerpt — either can run many lines, so it gets a
 * dedicated scrollable surface rather than a tooltip — see the sibling
 * SshDisconnectedDialog pattern.
 */
export function AutoRenameFailedDialog({
  open,
  onOpenChange,
  worktreeId,
  worktreeName,
  error
}: AutoRenameFailedDialogProps): React.JSX.Element {
  const [copied, setCopied] = useState(false)
  const [fullOutputResult, setFullOutputResult] = useState<FullOutputResult | null>(null)
  const copiedResetTimerRef = useRef<number | null>(null)

  useEffect(() => {
    return () => {
      if (copiedResetTimerRef.current !== null) {
        window.clearTimeout(copiedResetTimerRef.current)
      }
    }
  }, [])

  const getWorktreeBranchRenameFailureOutput = useAppStore(
    (s) => s.getWorktreeBranchRenameFailureOutput
  )

  useEffect(() => {
    if (!open) {
      return
    }
    let stale = false
    getWorktreeBranchRenameFailureOutput(worktreeId)
      .then((output) => {
        if (!stale) {
          setFullOutputResult({ worktreeId, error, output })
        }
      })
      .catch(() => {
        if (!stale) {
          setFullOutputResult({ worktreeId, error, output: null })
        }
      })
    return () => {
      stale = true
    }
  }, [error, open, worktreeId, getWorktreeBranchRenameFailureOutput])

  // Why: a fetch keyed to a previous (worktreeId, error) pair must never render
  // as this failure's detail — a new failure for the same worktree carries a
  // new persisted excerpt, so both fields identify the request.
  const fullOutput =
    fullOutputResult &&
    fullOutputResult.worktreeId === worktreeId &&
    fullOutputResult.error === error
      ? fullOutputResult.output
      : null
  const detailText = fullOutput ?? error

  const handleCopy = async () => {
    try {
      // Why: use the shared clipboard capability, because navigator.clipboard can fail
      // silently inside Radix dialogs — and an inline icon swap (no toast),
      // matching the app's other inline copy buttons.
      await shellClient.ui.writeClipboardText(detailText)
      setCopied(true)
      if (copiedResetTimerRef.current !== null) {
        window.clearTimeout(copiedResetTimerRef.current)
      }
      copiedResetTimerRef.current = window.setTimeout(() => {
        copiedResetTimerRef.current = null
        setCopied(false)
      }, 1500)
    } catch {
      /* best-effort */
    }
  }

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="sm:max-w-xl">
        <DialogHeader>
          <DialogTitle className="text-destructive flex items-center gap-2">
            <AlertCircle className="size-4 shrink-0" />
            {translate(
              'auto.components.sidebar.AutoRenameFailedDialog.ca3b225195',
              'Branch auto-name failed'
            )}
          </DialogTitle>
        </DialogHeader>
        <p className="text-muted-foreground text-sm">
          {translate(
            'auto.components.sidebar.AutoRenameFailedDialog.ff62a18580',
            "AgentStart couldn't generate a branch name for"
          )}{' '}
          <span className="text-foreground font-medium">{worktreeName}</span>{' '}
          {translate(
            'auto.components.sidebar.AutoRenameFailedDialog.3afcad0497',
            'from the first agent message.'
          )}
        </p>
        {/* Why: agent-CLI output is literal and often multi-line, so render it
            verbatim (mono, wrapped) inside a height-capped scroll region. */}
        <div className="space-y-1.5">
          <p className="text-foreground text-xs font-medium">
            {translate(
              'auto.components.sidebar.AutoRenameFailedDialog.74fc00776f',
              'Error details'
            )}
          </p>
          <div className="relative">
            <Button
              type="button"
              variant="quiet"
              size="icon-xs"
              onClick={handleCopy}
              aria-label={
                copied
                  ? translate('auto.components.sidebar.AutoRenameFailedDialog.a23b22d16f', 'Copied')
                  : translate(
                      'auto.components.sidebar.AutoRenameFailedDialog.eab8b45238',
                      'Copy error'
                    )
              }
              // Why: float over the scroll region's top-right; pad the text so
              // long lines never slide under the button.
              className="absolute top-1.5 right-1.5"
            >
              {copied ? <Check className="size-3.5" /> : <Copy className="size-3.5" />}
            </Button>
            <pre className="scrollbar-sleek border-border/60 bg-muted/40 text-foreground max-h-[40vh] overflow-auto rounded-md border py-3 pr-9 pl-3 font-mono text-[11px] leading-4 break-words whitespace-pre-wrap">
              {detailText}
            </pre>
          </div>
        </div>
        <DialogFooter>
          {/* Why: Close backs the user out, so it stays quiet (outline, not a
              solid CTA) — matching the sibling SshDisconnectedDialog. */}
          <Button type="button" variant="outline" size="sm" onClick={() => onOpenChange(false)}>
            {translate('auto.components.sidebar.AutoRenameFailedDialog.aed1623b1e', 'Close')}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  )
}
