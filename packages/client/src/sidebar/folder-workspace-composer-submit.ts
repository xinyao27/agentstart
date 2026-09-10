import { TUI_AGENT_CONFIG } from '@agentstart/protocol/agent/launch/config'
import type { SessionOptionValue } from '@agentstart/protocol/agent/session-options/types'
import type { AgentStartupShell } from '@agentstart/protocol/agent/shell-command'
import type { TuiAgent } from '@agentstart/protocol/agent/types'
import { isWindowsAbsolutePathLike } from '@agentstart/protocol/host/path'
import { resolveLocalWindowsAgentStartupShell } from '@agentstart/protocol/host/windows-terminal-shell'
import { isWslUncPath } from '@agentstart/protocol/host/wsl-paths'
import type { ProjectGroup } from '@agentstart/protocol/project/group-model'
import type { LaunchSource } from '@agentstart/protocol/telemetry/events/foundations'
import type { FolderWorkspace } from '@agentstart/protocol/workspace/folder'
import { folderWorkspaceKey } from '@agentstart/protocol/workspace/identity'
import {
  buildAgentDraftLaunchPlan,
  buildAgentStartupPlan,
  type AgentStartupPlan
} from '~renderer/agent/tui-startup'
import { createBrowserUuid } from '~renderer/browser/uuid'
import {
  CLIENT_PLATFORM,
  ensureAgentStartupInTerminal,
  type LinkedWorkItemSummary
} from '~renderer/new-workspace/workspace-creation'
import { markAgentWorkspaceTrusted } from '~renderer/runtime/agent-trust-client'
import { resolveQuickCreateLinkedWorkItemPrompt } from '~renderer/sidebar/linked-work-item-context'
import { isWorkItemLookupText } from '~renderer/sidebar/work-item-lookup-text'
import { tuiAgentToAgentKind } from '~renderer/telemetry/client'
import { activateAndRevealFolderWorkspace } from '~renderer/worktree/activation'

import {
  getLinkedItemDisplayName,
  toFolderWorkspaceLinkedReview
} from './folder-workspace-composer-model'

type FolderWorkspaceCreateInput = {
  projectGroupId: string
  name: string
  connectionId?: string | null
  linkedReview: FolderWorkspace['linkedReview']
  createdWithAgent?: TuiAgent
  pendingFirstAgentMessageRename?: boolean
}

type SubmitFolderWorkspaceCreateParams = {
  projectGroup: ProjectGroup
  name: string
  lastAutoName: string
  linkedWorkItem: LinkedWorkItemSummary | null
  note: string
  quickAgent: TuiAgent | null
  autoRenameBranchFromWork: boolean | undefined
  agentCmdOverrides: Record<string, string> | undefined
  agentArgs?: string | null
  agentEnv?: Record<string, string>
  sessionOptions?: Record<string, SessionOptionValue>
  terminalWindowsShell?: string | null
  isRemote?: boolean
  launchSource?: LaunchSource
  runtimeEnvironmentId?: string | null
  createFolderWorkspace: (input: FolderWorkspaceCreateInput) => Promise<FolderWorkspace | null>
  onOpenChange: (open: boolean) => void
}

function getFolderWorkspaceAgentLaunchPlatform(
  projectGroup: Pick<ProjectGroup, 'connectionId' | 'parentPath'>
): NodeJS.Platform {
  const parentPath = projectGroup.parentPath?.trim() ?? ''
  if (projectGroup.connectionId) {
    return isWindowsAbsolutePathLike(parentPath) ? 'win32' : 'linux'
  }
  return parentPath && isWslUncPath(parentPath) ? 'linux' : CLIENT_PLATFORM
}

function buildFolderWorkspaceLinkedStartupPlan(args: {
  agent: TuiAgent
  linkedWorkItem: LinkedWorkItemSummary
  note: string
  agentCmdOverrides: Record<string, string> | undefined
  agentArgs?: string | null
  agentEnv?: Record<string, string>
  sessionOptions?: Record<string, SessionOptionValue>
  platform: NodeJS.Platform
  shell?: AgentStartupShell
  isRemote: boolean
}): AgentStartupPlan | null {
  const { prompt, draftPrompt } = resolveQuickCreateLinkedWorkItemPrompt(
    args.linkedWorkItem,
    args.note
  )
  const linkedDraftPrompt = (draftPrompt ?? prompt.trim()) || null
  const draftLaunchPlan = linkedDraftPrompt
    ? buildAgentDraftLaunchPlan({
        agent: args.agent,
        draft: linkedDraftPrompt,
        cmdOverrides: args.agentCmdOverrides ?? {},
        agentArgs: args.agentArgs,
        agentEnv: args.agentEnv,
        sessionOptions: args.sessionOptions,
        platform: args.platform,
        shell: args.shell,
        isRemote: args.isRemote
      })
    : null
  if (draftLaunchPlan) {
    return {
      agent: draftLaunchPlan.agent,
      launchCommand: draftLaunchPlan.launchCommand,
      expectedProcess: draftLaunchPlan.expectedProcess,
      followupPrompt: null,
      launchConfig: draftLaunchPlan.launchConfig,
      ...(draftLaunchPlan.sessionOptions ? { sessionOptions: draftLaunchPlan.sessionOptions } : {}),
      ...(draftLaunchPlan.startupCommandDelivery
        ? { startupCommandDelivery: draftLaunchPlan.startupCommandDelivery }
        : {}),
      ...(draftLaunchPlan.env ? { env: draftLaunchPlan.env } : {})
    }
  }

  const startupPlan = buildAgentStartupPlan({
    agent: args.agent,
    // Why: linked context must stay reviewable; launch empty, then paste the
    // draft after the agent is ready instead of submitting it on argv/stdin.
    prompt: '',
    cmdOverrides: args.agentCmdOverrides ?? {},
    agentArgs: args.agentArgs,
    agentEnv: args.agentEnv,
    sessionOptions: args.sessionOptions,
    platform: args.platform,
    shell: args.shell,
    isRemote: args.isRemote,
    allowEmptyPromptLaunch: true
  })
  if (startupPlan && linkedDraftPrompt) {
    startupPlan.draftPrompt = linkedDraftPrompt
  }
  return startupPlan
}

async function preflightFolderWorkspaceAgentTrust(args: {
  agent: TuiAgent | null
  workspacePath: string | null
}): Promise<void> {
  if (!args.agent) {
    return
  }
  const preflight = TUI_AGENT_CONFIG[args.agent].preflightTrust
  if (!preflight || !args.workspacePath) {
    return
  }
  try {
    await markAgentWorkspaceTrusted({
      preset: preflight,
      workspacePath: args.workspacePath
    })
  } catch {
    // Best-effort: the user can still accept the agent trust prompt manually.
  }
}

export async function submitFolderWorkspaceCreate({
  projectGroup,
  name,
  lastAutoName,
  linkedWorkItem,
  note,
  quickAgent,
  autoRenameBranchFromWork,
  agentCmdOverrides,
  agentArgs,
  agentEnv,
  sessionOptions,
  terminalWindowsShell,
  launchSource = 'sidebar',
  runtimeEnvironmentId = null,
  createFolderWorkspace,
  onOpenChange
}: SubmitFolderWorkspaceCreateParams): Promise<boolean> {
  const linkedName = linkedWorkItem ? getLinkedItemDisplayName(linkedWorkItem) : null
  const nameIsAutoManaged = !name.trim() || name === lastAutoName || isWorkItemLookupText(name)
  const workspaceName =
    nameIsAutoManaged && linkedName
      ? linkedName
      : name.trim() || linkedName || `${projectGroup.name} workspace`
  const launchPlatform = getFolderWorkspaceAgentLaunchPlatform(projectGroup)
  // Why: an SSH folder group must use the relay's public CLI command.
  const launchIsRemote = Boolean(projectGroup.connectionId)
  const launchShell = resolveLocalWindowsAgentStartupShell({
    platform: launchPlatform,
    isRemote: launchIsRemote,
    terminalWindowsShell
  })
  const startupPlan =
    quickAgent && linkedWorkItem
      ? buildFolderWorkspaceLinkedStartupPlan({
          agent: quickAgent,
          linkedWorkItem,
          note,
          agentCmdOverrides,
          agentArgs,
          agentEnv,
          sessionOptions,
          platform: launchPlatform,
          shell: launchShell,
          isRemote: launchIsRemote
        })
      : quickAgent
        ? buildAgentStartupPlan({
            agent: quickAgent,
            prompt: note,
            cmdOverrides: agentCmdOverrides ?? {},
            agentArgs,
            agentEnv,
            sessionOptions,
            platform: launchPlatform,
            shell: launchShell,
            isRemote: launchIsRemote,
            allowEmptyPromptLaunch: true
          })
        : null
  // Why: the pending badge should only appear when the submitted prompt can
  // actually produce the first agent message that names the workspace.
  const pendingFirstAgentMessageRename =
    autoRenameBranchFromWork === true &&
    !name.trim() &&
    !linkedWorkItem &&
    Boolean(quickAgent) &&
    note.trim().length > 0

  const workspace = await createFolderWorkspace({
    projectGroupId: projectGroup.id,
    name: workspaceName,
    // Why: SSH folder groups must keep their target provenance even when the
    // focused runtime is local or another host.
    connectionId: projectGroup.connectionId ?? null,
    linkedReview: toFolderWorkspaceLinkedReview(linkedWorkItem),
    ...(quickAgent ? { createdWithAgent: quickAgent } : {}),
    ...(pendingFirstAgentMessageRename ? { pendingFirstAgentMessageRename: true } : {})
  })
  if (!workspace) {
    return false
  }
  await preflightFolderWorkspaceAgentTrust({
    agent: quickAgent,
    workspacePath: workspace.folderPath
  })
  if (startupPlan && !startupPlan.launchToken) {
    // Why: delayed delivery must target the exact pane spawned from this queued
    // startup, so both halves share one renderer-session token.
    startupPlan.launchToken = createBrowserUuid()
  }

  const startup =
    quickAgent && startupPlan
      ? {
          command: startupPlan.launchCommand,
          ...(startupPlan.env ? { env: startupPlan.env } : {}),
          launchConfig: startupPlan.launchConfig,
          ...(startupPlan.launchToken ? { launchToken: startupPlan.launchToken } : {}),
          launchAgent: quickAgent,
          ...(startupPlan.sessionOptions ? { sessionOptions: startupPlan.sessionOptions } : {}),
          ...(startupPlan.draftPrompt ? { draftPrompt: startupPlan.draftPrompt } : {}),
          ...(startupPlan.startupCommandDelivery
            ? { startupCommandDelivery: startupPlan.startupCommandDelivery }
            : {}),
          telemetry: {
            agent_kind: tuiAgentToAgentKind(quickAgent),
            launch_source: launchSource,
            request_kind: 'new' as const
          }
        }
      : undefined
  onOpenChange(false)
  try {
    const activation = activateAndRevealFolderWorkspace(workspace.id, {
      ...(startup ? { startup } : {}),
      runtimeEnvironmentId
    })
    if (
      startupPlan &&
      (startupPlan.followupPrompt || startupPlan.draftPrompt) &&
      activation !== false
    ) {
      void ensureAgentStartupInTerminal({
        worktreeId: folderWorkspaceKey(workspace.id),
        primaryTabId: activation.primaryTabId,
        startup: startupPlan
      })
    }
  } catch (error) {
    // Why: creation already succeeded. Do not leave the completed create modal
    // open if the follow-up reveal/startup path hits a transient issue.
    console.error('Failed to activate folder workspace after create:', error)
  }
  return true
}
