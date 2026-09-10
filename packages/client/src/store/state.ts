import { create } from 'zustand'
import {
  registerRendererMemoryProfileContributor,
  summarizeStateCollectionSizes
} from '~renderer/crash-report/memory-profile'
import { registerHttpLinkStoreAccessor } from '~renderer/editor/http-link-store-access'

import { createDetectedAgentsSlice } from '../agent/detected-state'
import { createAgentStatusSlice } from '../agent/status-state/slice'
import { createAgentStartProfilesSlice } from '../agentstart-profiles/state'
import { createUISlice } from '../application-shell/state/slice'
import { createBrowserSlice } from '../browser-tab-projection/state'
import { createDiffCommentsSlice } from '../diff-comments/state'
import { createEditorSlice } from '../editor/state'
import { createGitHubSlice } from '../github/state'
import { createKeybindingsSlice } from '../keyboard-input/state'
import { createPreflightSlice } from '../preflight/state'
import { createRateLimitResumeSlice } from '../rate-limit-resume/state'
import { createRepoSlice } from '../repo/state/slice'
import { createRuntimeStatusSlice } from '../runtime/status-state'
import { createSshSlice } from '../settings/runtime-environment/ssh-state'
import { createSettingsSlice } from '../settings/state'
import { createHostedReviewSlice } from '../source-control/hosted-review-state/slice'
import { createSparsePresetsSlice } from '../sparse/state'
import { createClaudeUsageSlice } from '../stats/claude-usage'
import { createCodexUsageSlice } from '../stats/codex-usage'
import { createOpenCodeUsageSlice } from '../stats/opencode-usage'
import { createRateLimitSlice } from '../stats/rate-limit-state'
import { createStatsSlice } from '../stats/state'
import { createMemorySlice } from '../status-bar/memory-state'
import { createRecentlyClosedTabsSlice } from '../tab-bar/state/recently-closed'
import { createTabsSlice } from '../tab-bar/state/slice'
import { createTerminalIdentitySlice } from '../terminal-identity/state'
import { createPaneForegroundAgentSlice } from '../terminal-pane/pane-foreground-agent-state'
import { createPinnedTabCloseConfirmSlice } from '../terminal-pane/pinned-tab-close-confirm-state'
import { createTerminalSlice } from '../terminal/state/slice'
import { createThemeGradientSlice } from '../theme-gradient/state'
import { createRemoteServerUpdatesSlice } from '../updates/remote-server-state'
import { createWorkspaceCleanupSlice } from '../workspace-cleanup/state'
import { createCommitMessageGenerationSlice } from '../workspace-panel/commit-message-generation-state'
import { createGitGraphSlice } from '../workspace-panel/git-graph/state'
import { createPullRequestGenerationSlice } from '../workspace-panel/pull-request-generation-state'
import { createSourceControlPanelViewSlice } from '../workspace-panel/source-control/workspace-panel/state'
import { createWorkspaceSpaceSlice } from '../workspace-space/state'
import { createWorktreeNavHistorySlice } from '../worktree/state/nav-history'
import { createWorktreeSlice } from '../worktree/state/slice'
import type { AppState } from './types'

export const useAppStore = create<AppState>()((...a) => ({
  ...createRepoSlice(...a),
  ...createSparsePresetsSlice(...a),
  ...createWorktreeSlice(...a),
  ...createTerminalSlice(...a),
  ...createTerminalIdentitySlice(...a),
  ...createTabsSlice(...a),
  ...createUISlice(...a),
  ...createSettingsSlice(...a),
  ...createKeybindingsSlice(...a),
  ...createGitHubSlice(...a),
  ...createHostedReviewSlice(...a),
  ...createPreflightSlice(...a),
  ...createEditorSlice(...a),
  ...createStatsSlice(...a),
  ...createMemorySlice(...a),
  ...createWorkspaceSpaceSlice(...a),
  ...createThemeGradientSlice(...a),
  ...createClaudeUsageSlice(...a),
  ...createCodexUsageSlice(...a),
  ...createOpenCodeUsageSlice(...a),
  ...createBrowserSlice(...a),
  ...createRateLimitSlice(...a),
  ...createRateLimitResumeSlice(...a),
  ...createRemoteServerUpdatesSlice(...a),
  ...createSshSlice(...a),
  ...createAgentStatusSlice(...a),
  ...createPaneForegroundAgentSlice(...a),
  ...createDiffCommentsSlice(...a),
  ...createDetectedAgentsSlice(...a),
  ...createWorktreeNavHistorySlice(...a),
  ...createWorkspaceCleanupSlice(...a),
  ...createRuntimeStatusSlice(...a),
  ...createPullRequestGenerationSlice(...a),
  ...createCommitMessageGenerationSlice(...a),
  ...createSourceControlPanelViewSlice(...a),
  ...createGitGraphSlice(...a),
  ...createPinnedTabCloseConfirmSlice(...a),
  ...createRecentlyClosedTabsSlice(...a),
  ...createAgentStartProfilesSlice(...a)
}))

registerHttpLinkStoreAccessor(() => useAppStore.getState())

// Why: high-water breadcrumbs need to identify the store collections that grew
// without retaining raw state in a crash report.
registerRendererMemoryProfileContributor('store', () =>
  summarizeStateCollectionSizes(useAppStore.getState(), 20)
)

export type { AppState } from './types'

// Why: expose the store for interactive browser development diagnostics.
if (import.meta.env.DEV && typeof window !== 'undefined') {
  ;(window as unknown as Record<string, unknown>).__store = useAppStore
}
