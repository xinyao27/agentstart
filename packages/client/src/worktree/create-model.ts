import type { StartupCommandDelivery } from '@agentstart/protocol/agent/launch/startup-delivery'
import type { SleepingAgentLaunchConfig } from '@agentstart/protocol/agent/session-resume'
import type { TuiAgent } from '@agentstart/protocol/agent/types'
import type { GitPushTarget } from '@agentstart/protocol/git/worktree-source'
import type {
  AgentKind,
  LaunchSource,
  RequestKind
} from '@agentstart/protocol/telemetry/events/foundations'
import type { WorkspaceKey } from '@agentstart/protocol/workspace/identity'
import type { WorkspaceSource } from '@agentstart/protocol/workspace/source'
import type { WorkspaceStatus } from '@agentstart/protocol/workspace/status/model'
import type { SetupDecision } from '@agentstart/protocol/worktree/hooks'
import type { CreateSparseCheckoutRequest } from '@agentstart/protocol/worktree/sparse'

export type WorktreeStartupLaunch = {
  command: string
  env?: Record<string, string>
  launchConfig?: SleepingAgentLaunchConfig
  launchToken?: string
  launchAgent?: TuiAgent
  startupCommandDelivery?: StartupCommandDelivery
  telemetry?: { agent_kind: AgentKind; launch_source: LaunchSource; request_kind: RequestKind }
}

export type CreateWorktreeArgs = {
  expectedRevision: number
  repoId: string
  name: string

  displayName?: string
  baseBranch?: string

  compareBaseRef?: string

  branchNameOverride?: string
  setupDecision?: SetupDecision
  sparseCheckout?: CreateSparseCheckoutRequest
  linkedPR?: number
  pushTarget?: GitPushTarget
  workspaceStatus?: WorkspaceStatus
  manualOrder?: number

  parentWorkspace?: WorkspaceKey

  createdWithAgent?: TuiAgent

  pendingFirstAgentMessageRename?: boolean

  telemetrySource?: WorkspaceSource

  startup?: WorktreeStartupLaunch

  creationId?: string
}
