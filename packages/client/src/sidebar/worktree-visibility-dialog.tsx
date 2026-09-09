import { useQueryClient } from '@tanstack/react-query'
import { isGitRepoKind } from '@yiru/protocol/project/repository'
import {
  effectiveExternalWorktreeVisibility,
  isLegacyRepoForExternalWorktreeVisibility
} from '@yiru/protocol/worktree/external/ownership'
import React from 'react'
import { translate } from '~renderer/i18n/i18n'
import { Eye, EyeSlash as EyeOff } from '~renderer/icons/hugeicons'
import { useProjectCatalog } from '~renderer/project-catalog/provider'
import { refreshProjectCatalogWorktrees } from '~renderer/project-catalog/refresh'
import { projectCatalogRepoBuckets } from '~renderer/project-catalog/repo-buckets'
import { useAppStore } from '~renderer/store/state'
import { Button } from '~renderer/ui/button'
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle
} from '~renderer/ui/dialog'

export default function WorktreeVisibilityDialog(): React.JSX.Element | null {
  const queryClient = useQueryClient()
  const activeModal = useAppStore((s) => s.activeModal)
  const modalData = useAppStore((s) => s.modalData)
  const closeModal = useAppStore((s) => s.closeModal)
  const projectCatalog = useProjectCatalog()
  const { detectedWorktreesByRepo } = projectCatalogRepoBuckets(projectCatalog)
  const { repos } = projectCatalog
  const updateRepo = useAppStore((s) => s.updateRepo)

  const repoId = typeof modalData.repoId === 'string' ? modalData.repoId : ''
  const repo = repos.find((candidate) => candidate.id === repoId) ?? null
  const detected = repoId ? detectedWorktreesByRepo[repoId] : undefined
  const showOther = repo
    ? effectiveExternalWorktreeVisibility(repo, isLegacyRepoForExternalWorktreeVisibility(repo)) ===
      'show'
    : false
  const hiddenCount =
    detected?.authoritative === true
      ? detected.worktrees.filter((worktree) => !worktree.visible).length
      : 0
  const otherCount =
    detected?.authoritative === true
      ? detected.worktrees.filter(
          (worktree) => !worktree.selectedCheckout && worktree.ownership !== 'yiru-managed'
        ).length
      : 0
  const hiddenWorktreeLabel = `${hiddenCount} ${hiddenCount === 1 ? 'worktree' : 'worktrees'}`
  const shownWorktreeLabel = `${otherCount} ${otherCount === 1 ? 'worktree' : 'worktrees'}`

  const handleToggle = async () => {
    if (!repoId) {
      return
    }
    await updateRepo(repoId, {
      externalWorktreeVisibility: showOther ? 'hide' : 'show',
      // Why: showing hidden externals again should re-enable the inbox if the
      // user previously opted out of discovery prompts for this repo.
      // Why: null is the transport sentinel for clearing on remote runtime paths
      // where `undefined` is stripped before persistence.
      ...(!showOther ? { externalWorktreeDiscoverySuppressedAt: null } : {})
    })
    if (repo) {
      await refreshProjectCatalogWorktrees(queryClient, repo)
    }
    closeModal()
  }

  if (activeModal !== 'worktree-visibility' || !repo || !isGitRepoKind(repo)) {
    return null
  }

  return (
    <Dialog open onOpenChange={(open) => !open && closeModal()}>
      <DialogContent className="sm:max-w-md">
        <DialogHeader>
          <DialogTitle>
            {translate(
              'auto.components.sidebar.WorktreeVisibilityDialog.83a5ba8dd1',
              'Non-Yiru worktrees'
            )}
          </DialogTitle>
          <DialogDescription>{repo.displayName}</DialogDescription>
        </DialogHeader>

        <div className="border-border bg-muted/30 flex items-center gap-3 border p-3">
          <div className="bg-background text-muted-foreground flex size-8 shrink-0 items-center justify-center">
            {showOther ? <Eye className="size-4" /> : <EyeOff className="size-4" />}
          </div>
          <div className="min-w-0 flex-1">
            <div className="text-sm font-medium">
              {showOther
                ? translate(
                    'auto.components.sidebar.WorktreeVisibilityDialog.3e045d4cb8',
                    'Shown in sidebar'
                  )
                : translate(
                    'auto.components.sidebar.WorktreeVisibilityDialog.5d02a5647f',
                    'Hidden from sidebar'
                  )}
            </div>
            <div className="text-muted-foreground text-xs">
              {showOther
                ? translate(
                    'auto.components.sidebar.WorktreeVisibilityDialog.8372e4bbd9',
                    '{{value0}} currently shown',
                    { value0: shownWorktreeLabel }
                  )
                : translate(
                    'auto.components.sidebar.WorktreeVisibilityDialog.25ddf19920',
                    '{{value0}} available to import',
                    { value0: hiddenWorktreeLabel }
                  )}
            </div>
          </div>
          <Button
            type="button"
            variant={showOther ? 'secondary' : 'outline'}
            onClick={handleToggle}
          >
            {showOther
              ? translate('auto.components.sidebar.WorktreeVisibilityDialog.759371df43', 'Hide')
              : translate('auto.components.sidebar.WorktreeVisibilityDialog.f1f71b9f02', 'Import')}
          </Button>
        </div>
      </DialogContent>
    </Dialog>
  )
}
