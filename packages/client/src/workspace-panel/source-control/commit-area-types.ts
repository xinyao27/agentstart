import type {
  SourceControlActionRecipe,
  SourceControlLaunchActionId
} from '@yiru/protocol/source-control/ai-actions'
import type { SourceControlAiWriteTarget } from '~renderer/source-control/ai-recipe-save'

import type { DropdownActionKind, DropdownEntry } from './dropdown-items'
import type { CreatePrIntentNotice } from './panel-types'
import type { PrimaryAction, RemoteOpKind } from './primary-action'
import type { SourceControlPushRecovery } from './push-recovery'

export type CommitAreaProps = {
  worktreeId: string | null
  groupId: string | null
  connectionId?: string | null
  repoId?: string | null
  launchPlatform?: NodeJS.Platform
  commitMessage: string
  commitError: string | null
  commitFailureRecoveryPrompt: string | null
  pushRecovery: SourceControlPushRecovery | null
  remoteActionError: string | null
  createPrIntentNotice?: CreatePrIntentNotice | null
  isCommitting: boolean
  isFixingCommitFailureWithAI: boolean
  isFixingPushFailureWithAI: boolean
  isCreatingPr?: boolean
  isCreatePrIntentInFlight?: boolean
  showComposer?: boolean
  sourceControlAiActionsVisible: boolean
  aiEnabled: boolean
  aiAgentConfigured: boolean
  isGenerating: boolean
  generateError: string | null
  stagedCount: number
  hasPartiallyStagedChanges: boolean
  hasUnresolvedConflicts: boolean
  isRemoteOperationActive: boolean
  inFlightRemoteOpKind: RemoteOpKind | null
  primaryAction: PrimaryAction
  dropdownItems: DropdownEntry[]
  fixCommitFailureRecipe?: SourceControlActionRecipe
  fixPushFailureRecipe?: SourceControlActionRecipe
  onCommitMessageChange: (message: string) => void
  onGenerate: () => void
  onCancelGenerate: () => void
  onSaveLaunchActionDefault?: (
    target: SourceControlAiWriteTarget,
    actionId: SourceControlLaunchActionId,
    recipe: SourceControlActionRecipe
  ) => void | Promise<void>
  onOpenSourceControlAiSettings?: () => void
  onFixCommitFailureWithAI: (promptOverride?: string) => Promise<boolean> | boolean
  onFixPushFailureWithAI: (promptOverride?: string) => Promise<boolean> | boolean
  onPrimaryAction: () => void
  onDropdownAction: (kind: DropdownActionKind) => void
}
