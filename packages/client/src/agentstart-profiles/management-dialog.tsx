import type { Repo } from '@agentstart/protocol/project/repository'
import { useState } from 'react'
import { toast } from 'sonner'
import { translate } from '~renderer/i18n/i18n'
import {
  Copy,
  FolderSimple as FolderGit2,
  ArrowsLeftRight as ArrowRightLeft,
  ArrowRight as MoveRight
} from '~renderer/icons/hugeicons'
import { LoadingIndicator } from '~renderer/loading/indicator'
import { useProjectCatalog } from '~renderer/project-catalog/provider'
import { useAppStore } from '~renderer/store/state'
import { Button } from '~renderer/ui/button'
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle
} from '~renderer/ui/dialog'
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuLabel,
  DropdownMenuSeparator,
  DropdownMenuTrigger
} from '~renderer/ui/dropdown-menu'
import { ScrollArea } from '~renderer/ui/scroll-area'

import { AgentStartProfileAvatar } from './avatar'
import type {
  AgentStartProfileSummary,
  TransferAgentStartProfileProjectMode
} from './profile-model'
import {
  AgentStartProfileProjectTransferConfirmDialog,
  type PendingProjectTransfer
} from './project-transfer-confirm-dialog'
import { getAgentStartProfileProjectLiveWorkSummary } from './switch-liveness'

type PendingTransfer = {
  repoId: string
  targetProfileId: string
  mode: TransferAgentStartProfileProjectMode
}

function pendingKey(value: PendingTransfer): string {
  return `${value.mode}:${value.repoId}:${value.targetProfileId}`
}

function getRepoPath(repo: Repo): string {
  return repo.path || repo.displayName
}

function ProjectTransferMenu({
  repo,
  sourceProfileId,
  targetProfiles,
  pending,
  onTransfer
}: {
  repo: Repo
  sourceProfileId: string
  targetProfiles: AgentStartProfileSummary[]
  pending: PendingTransfer | null
  onTransfer: (
    repo: Repo,
    targetProfile: AgentStartProfileSummary,
    mode: TransferAgentStartProfileProjectMode
  ) => void
}): React.JSX.Element {
  const disabled = targetProfiles.length === 0 || Boolean(pending)
  const repoPending = pending?.repoId === repo.id
  const renderTargetItems = (mode: TransferAgentStartProfileProjectMode): React.JSX.Element[] =>
    targetProfiles.map((profile) => {
      const targetPending =
        pending &&
        pendingKey(pending) === pendingKey({ repoId: repo.id, targetProfileId: profile.id, mode })
      return (
        <DropdownMenuItem
          key={`${mode}:${profile.id}`}
          disabled={Boolean(pending) || profile.id === sourceProfileId}
          onClick={() => onTransfer(repo, profile, mode)}
        >
          {mode === 'move' ? <MoveRight /> : <Copy />}
          <AgentStartProfileAvatar profile={profile} />
          <span className="min-w-0 truncate">{profile.name}</span>
          {targetPending ? <LoadingIndicator className="ml-auto size-3.5" /> : null}
        </DropdownMenuItem>
      )
    })

  return (
    <DropdownMenu>
      <DropdownMenuTrigger
        render={
          <Button variant="outline" size="xs" disabled={disabled}>
            {repoPending ? <LoadingIndicator className="size-3.5" /> : <ArrowRightLeft />}
            {translate('auto.components.agentstart.profiles.management.04e7bd2a23', 'Transfer')}
          </Button>
        }
      />
      <DropdownMenuContent align="end" className="w-56">
        <DropdownMenuLabel>
          {translate('auto.components.agentstart.profiles.management.128c7dfe64', 'Copy to')}
        </DropdownMenuLabel>
        {renderTargetItems('copy')}
        <DropdownMenuSeparator />
        <DropdownMenuLabel>
          {translate('auto.components.agentstart.profiles.management.df8b7d876b', 'Move to')}
        </DropdownMenuLabel>
        {renderTargetItems('move')}
      </DropdownMenuContent>
    </DropdownMenu>
  )
}

export function AgentStartProfileManagementDialog({
  open,
  onOpenChange,
  activeProfile,
  profiles
}: {
  open: boolean
  onOpenChange: (open: boolean) => void
  activeProfile: AgentStartProfileSummary
  profiles: AgentStartProfileSummary[]
}): React.JSX.Element {
  const { repos } = useProjectCatalog()
  const transferProject = useAppStore((s) => s.transferAgentStartProfileProject)
  const [pending, setPending] = useState<PendingTransfer | null>(null)
  const [pendingConfirmation, setPendingConfirmation] = useState<PendingProjectTransfer | null>(
    null
  )
  const targetProfiles = (() => profiles.filter((profile) => profile.id !== activeProfile.id))()

  const runTransfer = async (
    repo: Repo,
    targetProfile: AgentStartProfileSummary,
    mode: TransferAgentStartProfileProjectMode
  ): Promise<void> => {
    if (pending) {
      return
    }
    const nextPending = { repoId: repo.id, targetProfileId: targetProfile.id, mode }
    setPending(nextPending)
    const result = await transferProject({
      sourceProfileId: activeProfile.id,
      targetProfileId: targetProfile.id,
      repoId: repo.id,
      mode
    })
    setPending(null)
    if (result?.status === 'transferred') {
      toast.success(
        mode === 'move'
          ? translate('auto.components.agentstart.profiles.management.9aa26347b3', 'Project moved')
          : translate(
              'auto.components.agentstart.profiles.management.816ce624b6',
              'Project copied'
            ),
        {
          description: targetProfile.name
        }
      )
    }
  }

  const handleTransfer = (
    repo: Repo,
    targetProfile: AgentStartProfileSummary,
    mode: TransferAgentStartProfileProjectMode
  ): void => {
    if (pending) {
      return
    }
    const liveWorkSummary = getAgentStartProfileProjectLiveWorkSummary(
      useAppStore.getState(),
      repo.id
    )
    if (mode === 'move' || liveWorkSummary.hasLiveWork) {
      setPendingConfirmation({ repo, targetProfile, mode, liveWorkSummary })
      return
    }
    void runTransfer(repo, targetProfile, mode)
  }

  const confirmTransfer = async (): Promise<void> => {
    if (!pendingConfirmation) {
      return
    }
    const next = pendingConfirmation
    await runTransfer(next.repo, next.targetProfile, next.mode)
    setPendingConfirmation(null)
  }

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="gap-4 sm:max-w-[640px]">
        <DialogHeader>
          <DialogTitle>
            {translate(
              'auto.components.agentstart.profiles.management.2c45bda8d3',
              'Manage profiles'
            )}
          </DialogTitle>
          <DialogDescription>
            {translate(
              'auto.components.agentstart.profiles.management.2db945e4a0',
              'Copy or move projects from the active profile to another local profile.'
            )}
          </DialogDescription>
        </DialogHeader>

        <div className="border-border border">
          <div className="border-border flex items-center gap-2 border-b px-3 py-2">
            <AgentStartProfileAvatar profile={activeProfile} />
            <div className="min-w-0">
              <div className="truncate text-sm font-medium">{activeProfile.name}</div>
              <div className="text-muted-foreground truncate text-xs">
                {translate(
                  repos.length === 1
                    ? 'auto.components.agentstart.profiles.management.projectCountSingular'
                    : 'auto.components.agentstart.profiles.management.projectCountPlural',
                  repos.length === 1 ? '{{count}} project' : '{{count}} projects',
                  { count: repos.length }
                )}
              </div>
            </div>
          </div>
          <ScrollArea className="max-h-[360px]">
            {repos.length === 0 ? (
              <div className="text-muted-foreground px-3 py-8 text-center text-sm">
                {translate(
                  'auto.components.agentstart.profiles.management.8668cb2946',
                  'No projects in this profile.'
                )}
              </div>
            ) : (
              <div className="divide-border divide-y">
                {repos.map((repo) => (
                  <div key={repo.id} className="flex min-w-0 items-center gap-3 px-3 py-2.5">
                    <FolderGit2 className="text-muted-foreground size-4 shrink-0" />
                    <div className="min-w-0 flex-1">
                      <div className="truncate text-sm font-medium">{repo.displayName}</div>
                      <div className="text-muted-foreground truncate font-mono text-[11px]">
                        {getRepoPath(repo)}
                      </div>
                    </div>
                    <ProjectTransferMenu
                      repo={repo}
                      sourceProfileId={activeProfile.id}
                      targetProfiles={targetProfiles}
                      pending={pending}
                      onTransfer={(selectedRepo, targetProfile, mode) => {
                        handleTransfer(selectedRepo, targetProfile, mode)
                      }}
                    />
                  </div>
                ))}
              </div>
            )}
          </ScrollArea>
        </div>

        {targetProfiles.length === 0 ? (
          <div className="text-muted-foreground text-xs">
            {translate(
              'auto.components.agentstart.profiles.management.93034915ab',
              'Create another profile before copying projects.'
            )}
          </div>
        ) : null}
        <AgentStartProfileProjectTransferConfirmDialog
          activeProfileName={activeProfile.name}
          pendingTransfer={pendingConfirmation}
          pending={Boolean(pending)}
          onCancel={() => setPendingConfirmation(null)}
          onConfirm={() => {
            void confirmTransfer()
          }}
        />
      </DialogContent>
    </Dialog>
  )
}
