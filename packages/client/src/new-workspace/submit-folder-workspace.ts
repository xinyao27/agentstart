import {
  resolveTuiAgentLaunchArgs,
  resolveTuiAgentLaunchEnv
} from '@agentstart/protocol/agent/launch-defaults'
import { isTuiAgentEnabled } from '@agentstart/protocol/agent/selection'
import type { TuiAgent } from '@agentstart/protocol/agent/types'
import type { ProjectGroup } from '@agentstart/protocol/project/group-model'
import type { GlobalSettings } from '@agentstart/protocol/settings/global/model'
import type { WorkspaceSource as WorkspaceCreateTelemetrySource } from '@agentstart/protocol/workspace/source'
import type { Dispatch, SetStateAction } from 'react'
import { toast } from 'sonner'
import { translate } from '~renderer/i18n/i18n'
import type { WorkspaceCreateErrorDisplay } from '~renderer/new-workspace-composer-card/workspace-create-error-format'
import {
  formatWorkspaceCreateError,
  getWorkspaceCreateErrorToastMessage
} from '~renderer/new-workspace-composer-card/workspace-create-error-format'
import type { LinkedWorkItemSummary } from '~renderer/new-workspace/workspace-creation'
import { submitFolderWorkspaceCreate } from '~renderer/sidebar/folder-workspace-composer-submit'

import type { createComposerSubmissionGuard } from './composer-submission-guard'

type FolderSourceResolution =
  | { kind: 'none' }
  | { kind: 'resolved'; linkedWorkItem: LinkedWorkItemSummary; workspaceName: string }

type SubmitFolderWorkspaceOptions = {
  clearDraft: () => void
  createFolderWorkspace: Parameters<typeof submitFolderWorkspaceCreate>[0]['createFolderWorkspace']
  disabledAgents: TuiAgent[]
  isDisabled: boolean
  isRemote: boolean
  lastAutoName: string
  linkedWorkItem: LinkedWorkItemSummary | null
  name: string
  note: string
  onCreated?: () => void
  persistDraft: boolean
  projectGroup: ProjectGroup | null
  requestedAgent: TuiAgent | null
  resolveSmartGitHub: () => Promise<FolderSourceResolution>
  runtimeEnvironmentId: string | null
  setCreateError: Dispatch<SetStateAction<WorkspaceCreateErrorDisplay | null>>
  setCreating: Dispatch<SetStateAction<boolean>>
  settings: GlobalSettings | null
  submissionGuard: ReturnType<typeof createComposerSubmissionGuard>
  telemetrySource?: WorkspaceCreateTelemetrySource
}

export async function submitFolderWorkspace({
  clearDraft,
  createFolderWorkspace,
  disabledAgents,
  isDisabled,
  isRemote,
  lastAutoName,
  linkedWorkItem,
  name,
  note,
  onCreated,
  persistDraft,
  projectGroup,
  requestedAgent,
  resolveSmartGitHub,
  runtimeEnvironmentId,
  setCreateError,
  setCreating,
  settings,
  submissionGuard,
  telemetrySource
}: SubmitFolderWorkspaceOptions): Promise<void> {
  if (!projectGroup?.parentPath || isDisabled) {
    return
  }
  const submissionId = submissionGuard.begin()
  setCreateError(null)
  setCreating(true)
  try {
    const resolution = await resolveSmartGitHub()
    if (!submissionGuard.isCurrent(submissionId)) {
      return
    }
    const agent =
      requestedAgent && isTuiAgentEnabled(requestedAgent, disabledAgents) ? requestedAgent : null
    const created = await submitFolderWorkspaceCreate({
      projectGroup,
      name: resolution.kind === 'none' ? name : resolution.workspaceName,
      lastAutoName,
      linkedWorkItem: resolution.kind === 'none' ? linkedWorkItem : resolution.linkedWorkItem,
      note,
      quickAgent: agent,
      autoRenameBranchFromWork: settings?.autoRenameBranchFromWork,
      agentCmdOverrides: settings?.agentCmdOverrides,
      agentArgs: agent ? resolveTuiAgentLaunchArgs(agent, settings?.agentDefaultArgs) : undefined,
      agentEnv: agent ? resolveTuiAgentLaunchEnv(agent, settings?.agentDefaultEnv) : undefined,
      terminalWindowsShell: settings?.terminalWindowsShell,
      isRemote,
      launchSource: telemetrySource === 'onboarding' ? 'onboarding' : 'new_workspace_composer',
      runtimeEnvironmentId,
      createFolderWorkspace,
      onOpenChange: (open) => {
        if (!open) {
          if (persistDraft) {
            clearDraft()
          }
          onCreated?.()
        }
      }
    })
    if (submissionGuard.isCurrent(submissionId) && !created) {
      setCreateError({
        title: translate(
          'auto.hooks.useComposerState.folderWorkspaceCreateFailedTitle',
          'Folder workspace creation failed'
        ),
        message: translate(
          'auto.hooks.useComposerState.folderWorkspaceCreateFailedMessage',
          'The folder workspace could not be created. Check the error details above, then try again.'
        )
      })
    }
  } catch (error) {
    if (submissionGuard.isCurrent(submissionId)) {
      const formattedError = formatWorkspaceCreateError(error)
      setCreateError(formattedError)
      toast.error(getWorkspaceCreateErrorToastMessage(formattedError))
    }
  } finally {
    if (submissionGuard.isCurrent(submissionId)) {
      setCreating(false)
    }
  }
}
