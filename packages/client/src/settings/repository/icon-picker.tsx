import { getRepoExecutionHostId, parseExecutionHostId } from '@agentstart/protocol/host/identity'
import { DEFAULT_REPO_BADGE_COLOR } from '@agentstart/protocol/project/appearance'
import { normalizeRepoBadgeColor } from '@agentstart/protocol/project/appearance'
import type { RepoIcon } from '@agentstart/protocol/project/icon'
import type { Repo } from '@agentstart/protocol/project/repository'
import { useEffect, useRef, useState } from 'react'
import { toast } from 'sonner'
import { translate } from '~renderer/i18n/i18n'
import { ArrowCounterClockwise as RotateCcw } from '~renderer/icons/hugeicons'
import { useEventCallback } from '~renderer/react/use-event-callback'
import { useMountedRef } from '~renderer/react/use-mounted-ref'
import { RepoIconGlyph, getRepoIconOptions } from '~renderer/repo/icon'
import { getActiveRuntimeTarget } from '~renderer/runtime/rpc-client'
import { Button } from '~renderer/ui/button'
import { Label } from '~renderer/ui/label'

import { RepositoryIconColorSection } from './icon-color-section'
import {
  buildRepositoryGitHubAvatarUpdate,
  resolveRepositoryGitHubAvatar,
  resolveRepositoryUpstreamLive
} from './icon-github'
import { RepositoryIconTabs } from './icon-tabs'

export function RepositoryIconPicker({
  repo,
  updateRepo
}: {
  repo: Repo
  updateRepo: (repoId: string, updates: Partial<Repo>) => void
}): React.JSX.Element {
  const [loadingGitHub, setLoadingGitHub] = useState(false)
  const [resetting, setResetting] = useState(false)
  const mountedRef = useMountedRef()
  // Why: resolve this repo's upstream/avatar on the host that owns it, not the
  // focused runtime.
  const selectedHost = parseExecutionHostId(getRepoExecutionHostId(repo))
  const activeRuntimeEnvironmentId =
    selectedHost?.kind === 'runtime' ? selectedHost.environmentId : null
  const selectedIconName = repo.repoIcon?.type === 'lucide' ? repo.repoIcon.name : null
  const selectedEmoji = repo.repoIcon?.type === 'emoji' ? repo.repoIcon.emoji : ''
  const selectedBadgeColor = normalizeRepoBadgeColor(repo.badgeColor) ?? DEFAULT_REPO_BADGE_COLOR
  const initialTab =
    repo.repoIcon?.type === 'emoji' ? 'emoji' : repo.repoIcon?.type === 'lucide' ? 'icon' : 'avatar'
  const runtimeTarget = (() => getActiveRuntimeTarget({ activeRuntimeEnvironmentId }))()

  const currentIconLabel = (() => {
    if (repo.repoIcon?.type === 'image') {
      if (repo.repoIcon.source === 'github') {
        return 'GitHub avatar'
      }
      return repo.repoIcon.label ?? 'Custom image'
    }
    if (repo.repoIcon?.type === 'emoji') {
      return `${repo.repoIcon.emoji} emoji`
    }
    if (repo.repoIcon?.type === 'lucide') {
      const label =
        getRepoIconOptions().find((option) => option.name === selectedIconName)?.label ?? 'Folder'
      return `${label} icon with repo color`
    }
    return 'Default'
  })()

  const setIcon = (repoIcon: RepoIcon | null) => updateRepo(repo.id, { repoIcon })
  const setBadgeColor = (badgeColor: string) => updateRepo(repo.id, { badgeColor })

  const resolveUpstreamLive = useEventCallback(() =>
    resolveRepositoryUpstreamLive(runtimeTarget, repo)
  )

  const resolveGitHubAvatar = useEventCallback((options?: { forceLive?: boolean }) =>
    resolveRepositoryGitHubAvatar(runtimeTarget, repo, options)
  )

  const handleUseGitHubAvatar = async () => {
    setLoadingGitHub(true)
    try {
      const resolution = await resolveGitHubAvatar({ forceLive: true })
      if (!mountedRef.current) {
        return
      }
      if (!resolution.repoIcon) {
        toast.error(
          translate(
            'auto.components.settings.RepositoryIconPicker.f79972271a',
            'No GitHub remote found for this repo.'
          )
        )
        return
      }
      // A null build means the stored icon/upstream already match — nothing to write.
      const updates = buildRepositoryGitHubAvatarUpdate(repo, resolution)
      if (updates) {
        updateRepo(repo.id, updates)
      }
    } catch {
      if (mountedRef.current) {
        toast.error(
          translate(
            'auto.components.settings.RepositoryIconPicker.d71df44587',
            'Failed to resolve the GitHub repo.'
          )
        )
      }
    } finally {
      if (mountedRef.current) {
        setLoadingGitHub(false)
      }
    }
  }

  const handleResetToDefault = async () => {
    setResetting(true)
    try {
      const resolution = await resolveGitHubAvatar({ forceLive: true }).catch(() => null)
      if (!mountedRef.current) {
        return
      }
      const updates = resolution
        ? buildRepositoryGitHubAvatarUpdate(repo, resolution, { clearMissingIcon: true })
        : { repoIcon: null }
      if (updates) {
        updateRepo(repo.id, updates)
      }
    } finally {
      if (mountedRef.current) {
        setResetting(false)
      }
    }
  }

  const githubIdentityRefreshedRef = useRef<string | null>(null)
  useEffect(() => {
    const hasGitHubAvatar = repo.repoIcon?.type === 'image' && repo.repoIcon.source === 'github'
    const shouldRefresh = hasGitHubAvatar || repo.upstream === undefined
    if (!shouldRefresh || githubIdentityRefreshedRef.current === repo.id) {
      return
    }
    githubIdentityRefreshedRef.current = repo.id
    let cancelled = false
    void (async () => {
      let updates: Partial<Repo> | null
      try {
        if (hasGitHubAvatar) {
          // Why: stored upstream/icon metadata can outlive a GitHub repo transfer.
          // Refresh only when settings opens for the affected GitHub-avatar repo.
          const resolution = await resolveGitHubAvatar({ forceLive: true })
          updates = buildRepositoryGitHubAvatarUpdate(repo, resolution)
        } else {
          const upstream = await resolveUpstreamLive()
          updates = { upstream: upstream ?? null }
        }
      } catch {
        return
      }
      if (cancelled || !mountedRef.current || !updates) {
        return
      }
      updateRepo(repo.id, updates)
    })()
    return () => {
      cancelled = true
    }
  }, [repo, resolveGitHubAvatar, resolveUpstreamLive, updateRepo, mountedRef])

  return (
    <div className="space-y-3">
      <div className="flex items-center gap-3">
        <RepoIconGlyph
          repoIcon={repo.repoIcon}
          color={selectedBadgeColor}
          className="border-border/70 bg-muted/30 size-10 shrink-0 rounded-md border"
          iconClassName="size-5"
        />
        <div className="min-w-0 flex-1">
          <Label className="text-sm font-semibold">
            {translate('auto.components.settings.RepositoryIconPicker.4e2a14f967', 'Repo Icon')}
          </Label>
          <div className="text-muted-foreground mt-1 truncate text-xs">{currentIconLabel}</div>
        </div>
        <Button
          type="button"
          variant="outline"
          size="sm"
          className="gap-2"
          disabled={resetting}
          onClick={() => void handleResetToDefault()}
        >
          <RotateCcw className="size-3.5" />
          {translate('auto.components.settings.RepositoryIconPicker.549d126081', 'Reset')}
        </Button>
      </div>

      <RepositoryIconColorSection badgeColor={repo.badgeColor} onBadgeColorChange={setBadgeColor} />

      <RepositoryIconTabs
        initialTab={initialTab}
        selectedIconName={selectedIconName}
        selectedEmoji={selectedEmoji}
        loadingGitHub={loadingGitHub}
        onSetIcon={setIcon}
        onUseGitHubAvatar={() => void handleUseGitHubAvatar()}
      />
    </div>
  )
}
