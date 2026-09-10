import { AGENTSTART_GITHUB_ISSUES_URL } from '@agentstart/protocol/hosted-review/agentstart-repository'
import type { GitHubViewer } from '@agentstart/protocol/hosted-review/review-types'
import { useQuery } from '@tanstack/react-query'
import React, { useRef, useState } from 'react'
import { toast } from 'sonner'
import { openHttpLink } from '~renderer/editor/http-link-routing'
import { translate } from '~renderer/i18n/i18n'
import { GithubLogo as Github, ArrowSquareOut as ExternalLink } from '~renderer/icons/hugeicons'
import { useMountedRef } from '~renderer/react/use-mounted-ref'
import { getShellGitHubViewer } from '~renderer/runtime/github-shell-client'
import { shellClient } from '~renderer/runtime/shell-client'
import { Button } from '~renderer/ui/button'
import { Checkbox } from '~renderer/ui/checkbox'
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle
} from '~renderer/ui/dialog'
import { Textarea } from '~renderer/ui/textarea'

type SubmitIdentity = {
  githubLogin: string | null
  githubEmail: string | null
}

type SidebarFeedbackDialogProps = {
  open: boolean
  onOpenChange: (open: boolean) => void
}

function openExternalUrl(url: string, event: React.MouseEvent<HTMLButtonElement>): void {
  openHttpLink(url, { event })
}

function getSubmitIdentity(viewer: GitHubViewer | null, anonymous: boolean): SubmitIdentity {
  if (anonymous || !viewer) {
    return {
      githubLogin: null,
      githubEmail: null
    }
  }

  return {
    githubLogin: viewer.login,
    githubEmail: viewer.email
  }
}

export function SidebarFeedbackDialog({
  open,
  onOpenChange
}: SidebarFeedbackDialogProps): React.JSX.Element {
  const [feedback, setFeedback] = useState('')
  const [isSubmitting, setIsSubmitting] = useState(false)
  const viewerQuery = useQuery({
    queryKey: ['github-viewer'],
    queryFn: getShellGitHubViewer,
    enabled: open
  })
  const viewer = viewerQuery.data ?? null
  const isViewerLoading = viewerQuery.isPending
  const [submitAnonymously, setSubmitAnonymously] = useState(false)
  const mountedRef = useMountedRef()
  const feedbackTextareaRef = useRef<HTMLTextAreaElement>(null)

  const handleSubmit = async (): Promise<void> => {
    const trimmed = feedback.trim()
    if (!trimmed) {
      toast.warning(
        translate(
          'auto.components.sidebar.SidebarFeedbackDialog.a2fd890d9e',
          'Please enter feedback before submitting.'
        )
      )
      return
    }

    setIsSubmitting(true)
    try {
      const identity = getSubmitIdentity(viewer, submitAnonymously)
      // Why: submission goes through the daemon so authentication and network
      // behavior stay consistent across Chrome clients.
      const result = await shellClient.feedback.submit({
        feedback: trimmed,
        submitAnonymously,
        githubLogin: identity.githubLogin,
        githubEmail: identity.githubEmail
      })

      if (!result.ok) {
        throw new Error(`Feedback request failed: ${result.error}`)
      }

      if (mountedRef.current) {
        toast.success(
          translate(
            'auto.components.sidebar.SidebarFeedbackDialog.7a46c228b8',
            'Thanks for the feedback.'
          )
        )
        setFeedback('')
        setSubmitAnonymously(false)
        onOpenChange(false)
      }
    } catch (err) {
      if (mountedRef.current) {
        toast.error(
          translate(
            'auto.components.sidebar.SidebarFeedbackDialog.60b721e857',
            'Failed to submit feedback. Please try again.'
          )
        )
      }
      console.error('Failed to submit feedback:', err)
    } finally {
      if (mountedRef.current) {
        setIsSubmitting(false)
      }
    }
  }

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="sm:max-w-lg" initialFocus={feedbackTextareaRef}>
        <DialogHeader>
          <DialogTitle className="text-sm">
            {translate('auto.components.sidebar.SidebarFeedbackDialog.0eb643f07f', 'Send Feedback')}
          </DialogTitle>
          <DialogDescription className="text-xs">
            {translate(
              'auto.components.sidebar.SidebarFeedbackDialog.a828fa4aee',
              "Share what's working, what's broken, or what AgentStart should do next."
            )}
          </DialogDescription>
        </DialogHeader>

        <div className="border-border/70 bg-muted/30 space-y-2 rounded-md border p-3">
          <div className="text-foreground text-xs font-medium">
            {translate(
              'auto.components.sidebar.SidebarFeedbackDialog.9b33530b3d',
              'Report bugs and request features'
            )}
          </div>
          <div className="flex flex-wrap gap-2">
            <Button
              type="button"
              variant="outline"
              size="sm"
              className="h-8 text-xs"
              onClick={(event) => openExternalUrl(`${AGENTSTART_GITHUB_ISSUES_URL}/`, event)}
            >
              <Github className="size-3.5" />
              {translate(
                'auto.components.sidebar.SidebarFeedbackDialog.d245c4ef6c',
                'GitHub issues'
              )}
              <ExternalLink className="size-3.5" />
            </Button>
          </div>
        </div>

        <Textarea
          ref={feedbackTextareaRef}
          value={feedback}
          onChange={(event) => setFeedback(event.target.value)}
          placeholder={translate(
            'auto.components.sidebar.SidebarFeedbackDialog.d46ddd66fc',
            'What could we improve?'
          )}
          rows={7}
          className="min-h-32"
        />

        <div className="border-border/70 bg-muted/30 min-h-9 rounded-md border px-3 py-2">
          {viewer ? (
            <div className="text-muted-foreground flex flex-wrap items-center gap-x-3 gap-y-1 text-xs">
              <span>
                {translate('auto.components.sidebar.SidebarFeedbackDialog.c9e5ea0791', 'GitHub:')}{' '}
                <span className="text-foreground font-mono">
                  {viewer.login}
                  {viewer.email ? ` (${viewer.email})` : ''}
                </span>
              </span>
              <label className="text-foreground flex cursor-pointer items-center gap-2">
                <Checkbox
                  checked={submitAnonymously}
                  onCheckedChange={(checked) => setSubmitAnonymously(checked === true)}
                />
                {translate(
                  'auto.components.sidebar.SidebarFeedbackDialog.5b120b9634',
                  'Submit anonymously'
                )}
              </label>
            </div>
          ) : isViewerLoading ? (
            <div className="text-muted-foreground text-xs">
              {translate(
                'auto.components.sidebar.SidebarFeedbackDialog.d20439c560',
                'Checking GitHub identity…'
              )}
            </div>
          ) : (
            <div className="text-muted-foreground text-xs">
              {translate(
                'auto.components.sidebar.SidebarFeedbackDialog.8de03e23c5',
                'Submit with your typed feedback only, or connect `gh` to include GitHub identity.'
              )}
            </div>
          )}
        </div>
        <DialogFooter>
          <Button variant="outline" onClick={() => onOpenChange(false)} disabled={isSubmitting}>
            {translate('auto.components.sidebar.SidebarFeedbackDialog.8bf619e4cf', 'Cancel')}
          </Button>
          <Button onClick={() => void handleSubmit()} disabled={isSubmitting || !feedback.trim()}>
            {isSubmitting
              ? translate('auto.components.sidebar.SidebarFeedbackDialog.69969ba364', 'Sending…')
              : translate('auto.components.sidebar.SidebarFeedbackDialog.f2e42e1307', 'Send')}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  )
}
