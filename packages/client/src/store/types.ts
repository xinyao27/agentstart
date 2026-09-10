import type { DetectedAgentsSlice } from '../agent/detected-state'
import type { AgentStatusSlice } from '../agent/status-state/slice'
import type { AgentStartProfilesSlice } from '../agentstart-profiles/state'
import type { UISlice } from '../application-shell/state/slice'
import type { BrowserSlice } from '../browser-tab-projection/types'
import type { DiffCommentsSlice } from '../diff-comments/state'
import type { EditorSlice } from '../editor/state'
import type { GitHubSlice } from '../github/state'
import type { KeybindingsSlice } from '../keyboard-input/state'
import type { PreflightSlice } from '../preflight/state'
import type { RateLimitResumeSlice } from '../rate-limit-resume/state'
import type { RepoSlice } from '../repo/state/slice'
import type { RuntimeStatusSlice } from '../runtime/status-state'
import type { SshSlice } from '../settings/runtime-environment/ssh-state'
import type { SettingsSlice } from '../settings/state'
import type { HostedReviewSlice } from '../source-control/hosted-review-state/slice'
import type { SparsePresetsSlice } from '../sparse/state'
import type { ClaudeUsageSlice } from '../stats/claude-usage'
import type { CodexUsageSlice } from '../stats/codex-usage'
import type { OpenCodeUsageSlice } from '../stats/opencode-usage'
import type { RateLimitSlice } from '../stats/rate-limit-state'
import type { StatsSlice } from '../stats/state'
import type { MemorySlice } from '../status-bar/memory-state'
import type { RecentlyClosedTabsSlice } from '../tab-bar/state/recently-closed'
import type { TabsSlice } from '../tab-bar/state/slice'
import type { TerminalIdentitySlice } from '../terminal-identity/state'
import type { PaneForegroundAgentSlice } from '../terminal-pane/pane-foreground-agent-state'
import type { PinnedTabCloseConfirmSlice } from '../terminal-pane/pinned-tab-close-confirm-state'
import type { TerminalSlice } from '../terminal/state/slice'
import type { ThemeGradientSlice } from '../theme-gradient/state'
import type { RemoteServerUpdatesSlice } from '../updates/remote-server-state'
import type { WorkspaceCleanupSlice } from '../workspace-cleanup/state'
import type { CommitMessageGenerationSlice } from '../workspace-panel/commit-message-generation-state'
import type { GitGraphSlice } from '../workspace-panel/git-graph/state'
import type { PullRequestGenerationSlice } from '../workspace-panel/pull-request-generation-state'
import type { SourceControlPanelViewSlice } from '../workspace-panel/source-control/workspace-panel/state'
import type { WorkspaceSpaceSlice } from '../workspace-space/state'
import type { WorktreeNavHistorySlice } from '../worktree/state/nav-history'
import type { WorktreeSlice } from '../worktree/state/types'

export type AppState = RepoSlice &
  SparsePresetsSlice &
  WorktreeSlice &
  TerminalSlice &
  TerminalIdentitySlice &
  TabsSlice &
  UISlice &
  SettingsSlice &
  KeybindingsSlice &
  GitHubSlice &
  HostedReviewSlice &
  PreflightSlice &
  EditorSlice &
  StatsSlice &
  MemorySlice &
  WorkspaceSpaceSlice &
  ThemeGradientSlice &
  ClaudeUsageSlice &
  CodexUsageSlice &
  OpenCodeUsageSlice &
  BrowserSlice &
  RateLimitSlice &
  RateLimitResumeSlice &
  RemoteServerUpdatesSlice &
  SshSlice &
  AgentStatusSlice &
  PaneForegroundAgentSlice &
  DiffCommentsSlice &
  DetectedAgentsSlice &
  WorktreeNavHistorySlice &
  WorkspaceCleanupSlice &
  RuntimeStatusSlice &
  PullRequestGenerationSlice &
  CommitMessageGenerationSlice &
  SourceControlPanelViewSlice &
  GitGraphSlice &
  PinnedTabCloseConfirmSlice &
  RecentlyClosedTabsSlice &
  AgentStartProfilesSlice
