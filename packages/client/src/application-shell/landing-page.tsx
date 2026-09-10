import { AGENTSTART_GITHUB_STARGAZERS_URL } from '@agentstart/protocol/hosted-review/agentstart-repository'
import type { Repo } from '@agentstart/protocol/project/repository'
import { isGitRepoKind } from '@agentstart/protocol/project/repository'
import { useEffect, useRef, useState } from 'react'
import { openHttpLink } from '~renderer/editor/http-link-routing'
import { translate } from '~renderer/i18n/i18n'
import {
  Warning as AlertTriangle,
  Star,
  ArrowSquareOut as ExternalLink,
  FolderPlus,
  GitMerge,
  X
} from '~renderer/icons/hugeicons'
import { useProjectCatalog } from '~renderer/project-catalog/provider'
import { useMountedRef } from '~renderer/react/use-mounted-ref'
import {
  checkShellAgentStartStarred,
  completeShellStarNag,
  starAgentStartFromShell
} from '~renderer/runtime/github-shell-client'
import { preflightCheck } from '~renderer/runtime/preflight-target'
import { Button } from '~renderer/ui/button'

import { getActiveRuntimeTarget } from '../runtime/rpc-client'
import { useAppStore } from '../store/state'
import { cn } from '../ui/class-names'
import {
  dismissPreflightIssue,
  githubProjectKeys,
  isPreflightIssueDismissed
} from './landing-preflight-dismissal'
import {
  getLandingPreflightIssues,
  hasGitHubBackedProject,
  type PreflightIssue
} from './landing-preflight-issues'
import { LandingShortcuts } from './landing-shortcuts'

type StarState = 'loading' | 'starred' | 'not-starred' | 'web-fallback' | 'hidden'

function GitHubStarButton({ hasRepos }: { hasRepos: boolean }): React.JSX.Element | null {
  const [state, setState] = useState<StarState>('loading')
  const [menuOpen, setMenuOpen] = useState(false)
  const wrapperRef = useRef<HTMLDivElement | null>(null)
  const mountedRef = useMountedRef()

  useEffect(() => {
    let cancelled = false
    void checkShellAgentStartStarred().then((result) => {
      if (cancelled) {
        return
      }
      if (result === null) {
        setState('web-fallback')
      } else {
        setState(result ? 'starred' : 'not-starred')
      }
    })
    return () => {
      cancelled = true
    }
  }, [])

  useEffect(() => {
    if (!menuOpen) {
      return
    }
    const onDocClick = (e: MouseEvent): void => {
      if (!wrapperRef.current?.contains(e.target as Node)) {
        setMenuOpen(false)
      }
    }
    document.addEventListener('mousedown', onDocClick)
    return () => document.removeEventListener('mousedown', onDocClick)
  }, [menuOpen])

  const handleClick = async (event: React.MouseEvent<HTMLButtonElement>): Promise<void> => {
    if (state === 'starred') {
      setMenuOpen((v) => !v)
      return
    }
    if (state === 'web-fallback') {
      openHttpLink(AGENTSTART_GITHUB_STARGAZERS_URL, { event })
      return
    }
    if (state !== 'not-starred') {
      return
    }
    setState('starred') // optimistic
    const ok = await starAgentStartFromShell('landing')
    if (!ok) {
      if (mountedRef.current) {
        setState('web-fallback')
      }
      return
    }
    // Why: starring from any entry point mutes the threshold-based nag.
    // Without this the background notification could still fire on the next
    // threshold crossing, which would feel like a bug to the user.
    await completeShellStarNag()
  }

  // Hide once the user has already starred and added a repo.
  if (state === 'hidden' || (state === 'starred' && hasRepos)) {
    return null
  }

  return (
    <div ref={wrapperRef} className="relative inline-block">
      <Button
        variant="outline"
        size="default"
        className={cn(
          'focus-visible:border-amber-500/80 focus-visible:bg-amber-400/10 dark:focus-visible:border-amber-400/50 dark:focus-visible:bg-amber-400/[0.08]',
          'py-1.5 text-[13px] duration-300',
          state === 'loading' && 'pointer-events-none opacity-0',
          state !== 'starred' &&
            'border-amber-500/60 text-amber-700 hover:border-amber-500/80 hover:bg-amber-400/10 dark:border-amber-400/30 dark:text-amber-300/90 dark:hover:border-amber-400/50 dark:hover:bg-amber-400/[0.08]',
          state === 'starred' &&
            'border-amber-500/50 bg-amber-400/10 text-amber-700 dark:border-amber-400/25 dark:bg-amber-400/[0.06] dark:text-amber-400/60'
        )}
        onClick={handleClick}
        disabled={state === 'loading'}
      >
        {state === 'web-fallback' ? (
          <ExternalLink className="size-3.5 text-amber-600 transition-all duration-300 dark:text-amber-400/80" />
        ) : (
          <Star
            className={cn(
              'size-3.5 transition-all duration-300',
              state === 'starred'
                ? 'fill-amber-500/70 text-amber-500/70 dark:fill-amber-400/60 dark:text-amber-400/60'
                : 'text-amber-600 dark:text-amber-400/80'
            )}
          />
        )}
        {state === 'starred'
          ? translate('auto.components.Landing.ec43b38ba7', 'Starred on GitHub')
          : state === 'web-fallback'
            ? translate('auto.components.Landing.157bb5ecbb', 'Open GitHub')
            : translate('auto.components.Landing.0d0ace8861', 'Star on GitHub')}
      </Button>
      {state === 'starred' && menuOpen && (
        <div className="border-border bg-popover absolute top-[calc(100%+4px)] right-0 z-10 min-w-[100px] rounded-md border py-1">
          <Button
            variant="ghost"
            size="sm"
            className="text-foreground hover:bg-muted focus-visible:bg-muted w-full justify-start gap-0 border-0 py-1.5 text-left text-[13px] font-normal whitespace-normal"
            onClick={() => {
              setMenuOpen(false)
              setState('hidden')
            }}
          >
            {translate('auto.components.Landing.c1cf168479', 'Hide')}
          </Button>
        </div>
      )}
    </div>
  )
}

function PreflightBanner({
  issues,
  repos
}: {
  issues: PreflightIssue[]
  repos: Repo[]
}): React.JSX.Element | null {
  // Why: keying the seed on the current GitHub project set means adding a new
  // GitHub project (which changes the key) re-evaluates dismissals, so a lapsed
  // dismissal re-surfaces the nudge without a manual reset.
  const githubKey = githubProjectKeys(repos).join('|')
  const persistedDismissed = new Set(
    issues
      .filter((issue) => issue.dismissible && isPreflightIssueDismissed(issue.id, repos))
      .map((issue) => issue.id)
  )
  const [dismissedState, setDismissedState] = useState<{
    githubKey: string
    issueIds: Set<string>
  }>({ githubKey, issueIds: persistedDismissed })
  const dismissed =
    dismissedState.githubKey === githubKey ? dismissedState.issueIds : persistedDismissed

  const visibleIssues = issues.filter((issue) => !dismissed.has(issue.id))
  if (visibleIssues.length === 0) {
    return null
  }

  const dismiss = (issue: PreflightIssue): void => {
    dismissPreflightIssue(issue.id, repos)
    setDismissedState({ githubKey, issueIds: new Set(dismissed).add(issue.id) })
  }

  return (
    // Why: cap width below the max-w-lg column so the card reads as part of the
    // centered content stack instead of stretching edge-to-edge. The styleguide
    // reserves color for true error state — these are soft setup nudges, so use
    // the quiet muted/border surface, not an amber frame.
    <div className="border-border bg-muted/40 w-full max-w-sm space-y-1.5 rounded-lg border p-3">
      {visibleIssues.map((issue) => (
        <div
          key={issue.id}
          className="flex items-start gap-3 rounded-md px-1 py-1.5 first:pt-0 last:pb-0"
        >
          <AlertTriangle className="mt-0.5 size-4 shrink-0 text-amber-500/70" />
          <div className="min-w-0 flex-1 space-y-0.5">
            <p className="text-foreground text-[13px] leading-snug font-medium">{issue.title}</p>
            <p className="text-muted-foreground text-xs leading-snug">{issue.description}</p>
            <Button
              variant="ghost"
              size="xs"
              className="text-primary focus-visible:bg-accent mt-1 h-auto border-0 p-0 underline-offset-4 hover:underline"
              onClick={(event) => openHttpLink(issue.fixUrl, { event })}
            >
              {issue.fixLabel}
              <ExternalLink className="size-3" />
            </Button>
          </div>
          {issue.dismissible && (
            <Button
              variant="quiet"
              size="xs"
              className="/70 -mt-0.5 -mr-1 h-auto border-0 p-1"
              onClick={() => dismiss(issue)}
              aria-label={translate('auto.components.Landing.preflightDismiss', 'Dismiss')}
            >
              <X className="size-3.5" />
            </Button>
          )}
        </div>
      ))}
    </div>
  )
}

export default function Landing(): React.JSX.Element {
  const { repos } = useProjectCatalog()
  const openModal = useAppStore((s) => s.openModal)

  const createTargetLabel =
    repos.length > 0 && repos.every((repo) => isGitRepoKind(repo)) ? 'Worktree' : 'Workspace'
  const canCreateWorktree = repos.length > 0
  const hasGitHubProject = (() => hasGitHubBackedProject(repos))()
  const showGitHubSupportFooter = repos.length === 0 || hasGitHubProject

  const [preflightIssues, setPreflightIssues] = useState<PreflightIssue[]>([])

  useEffect(() => {
    let cancelled = false
    const refreshPreflight = (force = false): void => {
      void preflightCheck(
        getActiveRuntimeTarget(useAppStore.getState().settings),
        force ? { force: true } : {}
      ).then((status) => {
        if (cancelled) {
          return
        }
        setPreflightIssues(
          getLandingPreflightIssues(status, { hasGitHubBackedProject: hasGitHubProject })
        )
      })
    }

    refreshPreflight()

    // Why: users often install/authenticate gh outside AgentStart. Re-check when the
    // window becomes active again so the landing warning clears without relaunch.
    const handleWindowActive = (): void => {
      if (document.visibilityState === 'visible') {
        refreshPreflight(true)
      }
    }

    document.addEventListener('visibilitychange', handleWindowActive)
    window.addEventListener('focus', handleWindowActive)

    return () => {
      cancelled = true
      document.removeEventListener('visibilitychange', handleWindowActive)
      window.removeEventListener('focus', handleWindowActive)
    }
  }, [hasGitHubProject])

  useEffect(() => {
    if (preflightIssues.length === 0) {
      return
    }

    let cancelled = false
    // Why: some users complete `gh auth login` without ever leaving the AgentStart
    // window. Poll only while a warning is visible so the banner self-clears.
    const intervalId = window.setInterval(() => {
      void preflightCheck(getActiveRuntimeTarget(useAppStore.getState().settings), {
        force: true
      }).then((status) => {
        if (cancelled) {
          return
        }
        setPreflightIssues(
          getLandingPreflightIssues(status, { hasGitHubBackedProject: hasGitHubProject })
        )
      })
    }, 30000)

    return () => {
      cancelled = true
      window.clearInterval(intervalId)
    }
  }, [hasGitHubProject, preflightIssues.length])

  const handleCreateWorkspace = (): void => {
    openModal('new-workspace-composer', { telemetrySource: 'unknown' })
  }

  return (
    <div className="bg-background absolute inset-0 flex items-center justify-center">
      <div className="w-full max-w-lg px-6">
        <div className="flex flex-col items-center gap-4 py-8">
          {preflightIssues.length > 0 && <PreflightBanner issues={preflightIssues} repos={repos} />}

          <p className="text-muted-foreground text-center text-sm">
            {canCreateWorktree
              ? translate(
                  'auto.components.Landing.9c00bd4adf',
                  'Select a workspace from the sidebar to begin.'
                )
              : translate('auto.components.Landing.cd21242762', 'Add a project to get started.')}
          </p>

          <div className="flex flex-wrap items-center justify-center gap-2.5">
            <Button
              variant="secondary"
              size="default"
              className="bg-secondary/70 border-border/80 text-foreground hover:bg-accent focus-visible:bg-accent gap-1.5 border text-sm transition-colors"
              onClick={() => openModal('add-repo')}
            >
              <FolderPlus className="size-3.5" />
              {translate('auto.components.Landing.f9eaa9e12d', 'Add Project')}
            </Button>

            <Button
              variant="secondary"
              size="default"
              className="bg-secondary/70 border-border/80 text-foreground enabled:hover:bg-accent enabled:focus-visible:bg-accent gap-1.5 border text-sm transition-colors enabled:cursor-pointer disabled:cursor-not-allowed disabled:opacity-40"
              disabled={!canCreateWorktree}
              title={
                !canCreateWorktree
                  ? translate('auto.components.Landing.f05d237049', 'Add a project first')
                  : undefined
              }
              onClick={handleCreateWorkspace}
            >
              <GitMerge className="size-3.5" />
              {translate('auto.components.Landing.76a95f7f47', 'Create')}{' '}
              {createTargetLabel.toLowerCase()}
            </Button>
          </div>

          <LandingShortcuts
            canCreateWorktree={canCreateWorktree}
            createTargetLabel={createTargetLabel}
            onCreate={handleCreateWorkspace}
          />
        </div>
      </div>

      {showGitHubSupportFooter && (
        <div className="absolute right-0 bottom-6 left-0 flex justify-center">
          <GitHubStarButton hasRepos={repos.length > 0} />
        </div>
      )}
    </div>
  )
}
