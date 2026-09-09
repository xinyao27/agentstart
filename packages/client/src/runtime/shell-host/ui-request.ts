import type {
  WorktreeDefaultTabsLaunch,
  WorktreeSetupLaunch
} from '@yiru/protocol/worktree/create-result'
import type { WorktreeStartupLaunch } from '~renderer/worktree/create-model'

type SessionTabMove =
  | {
      kind: 'reorder'
      tabId: string
      targetGroupId: string
      tabOrder: string[]
    }
  | {
      kind: 'move-to-group'
      tabId: string
      targetGroupId: string
      index?: number
    }
  | {
      kind: 'split'
      tabId: string
      targetGroupId: string
      splitDirection: 'left' | 'right' | 'up' | 'down'
    }

type TerminalSplitSource = 'contextual_tour' | 'keyboard' | 'context_menu' | 'command' | 'unknown'

// Why: these commands mutate renderer-owned navigation, tab, and sleeping-agent
// state after the runtime has already completed its authoritative operation.
// They travel on the reverse link so the runtime retains only an opaque shell
// connection id, never a browser-page callback closure.
export type UiCommandRequest =
  | {
      type: 'activateWorktree'
      repoId: string
      worktreeId: string
      setup?: WorktreeSetupLaunch
      startup?: WorktreeStartupLaunch
      defaultTabs?: WorktreeDefaultTabsLaunch
    }
  | {
      type: 'splitTerminal'
      tabId: string
      paneRuntimeId: number
      direction: 'horizontal' | 'vertical'
      command?: string
      telemetrySource?: TerminalSplitSource
    }
  | { type: 'renameTerminal'; tabId: string; title: string | null }
  | {
      type: 'focusTerminal'
      tabId: string
      worktreeId: string
      leafId?: string | null
      ackPaneKeyOnSuccess?: string
      flashFocusedPane?: boolean
      scrollToBottomIfOutputSinceLastView?: boolean
    }
  | { type: 'focusEditorTab'; tabId: string; worktreeId: string }
  | { type: 'closeSessionTab'; tabId: string; worktreeId: string }
  | ({ type: 'moveSessionTab'; worktreeId: string } & SessionTabMove)
  | {
      type: 'openFile'
      worktreeId: string
      filePath: string
      relativePath: string
      runtimeEnvironmentId?: string | null
    }
  | {
      type: 'openDiff'
      worktreeId: string
      filePath: string
      relativePath: string
      staged: boolean
      runtimeEnvironmentId?: string | null
    }
  | { type: 'closeTerminal'; tabId: string; paneRuntimeId?: number }
  | { type: 'sleepWorktree'; worktreeId: string }
  | { type: 'resumeSleepingAgents'; worktreeId: string }

export type UiCommandResult = { accepted: true }
