import { StatusCode } from '../../generated/agent_start/protocol/v1/errors_pb.js'
import {
  AgentProviderSessionKey,
  AgentStatusState,
  type AgentStatusState as AgentStatusStateValue,
  type AgentProviderSessionKey as AgentProviderSessionKeyValue
} from '../../generated/agent_start/runtime/v1/agent_status_pb.js'
import {
  SessionTabsFileDiffSource,
  SessionTabsFileMode,
  SessionTabsMarkdownMode,
  SessionTabsPaneSplitDirection,
  SessionTabsTabType,
  SessionTabsTerminalStatus,
  type SessionTabsAgentStatus,
  type SessionTabsBrowserTab,
  type SessionTabsFileTab,
  type SessionTabsGroupLayoutNode,
  type SessionTabsMarkdownTab,
  type SessionTabsSnapshot,
  type SessionTabsTab,
  type SessionTabsTabGroup,
  type SessionTabsTerminalTab
} from '../../generated/agent_start/runtime/v1/session_tabs_pb.js'
import { RuntimeProtocolError } from '../error.js'
import type {
  SessionTabsAgentStateValue,
  SessionTabsAgentStatusValue,
  SessionTabsBrowserTabValue,
  SessionTabsFileTabValue,
  SessionTabsGroupLayoutNodeValue,
  SessionTabsLaunchAgentValue,
  SessionTabsMarkdownTabValue,
  SessionTabsSnapshotValue,
  SessionTabsTabGroupValue,
  SessionTabsTabTypeValue,
  SessionTabsTabValue,
  SessionTabsTerminalTabValue
} from './values.js'

export function sessionTabsSnapshot(value: SessionTabsSnapshot): SessionTabsSnapshotValue {
  return {
    worktree: value.worktree,
    publicationEpoch: value.publicationEpoch,
    snapshotVersion: value.snapshotVersion,
    activeGroupId: nullableText(value.activeGroupId),
    activeTabId: nullableText(value.activeTabId),
    activeTabType: tabType(value.activeTabType),
    ...(value.tabGroups.length > 0 ? { tabGroups: value.tabGroups.map(sessionTabsTabGroup) } : {}),
    ...(value.tabGroupLayout ? { tabGroupLayout: groupLayoutNode(value.tabGroupLayout) } : {}),
    tabs: value.tabs.map(sessionTabsTab),
    // Why: only a removal publication carries this flag, and the legacy JSON
    // omits it everywhere else, so presence — not value — is the signal.
    ...(value.removed ? { removed: true as const } : {})
  }
}

export function sessionTabsTab(value: SessionTabsTab): SessionTabsTabValue {
  const tab = value.tab
  switch (tab.case) {
    case 'terminal':
      return terminalTab(tab.value)
    case 'markdown':
      return markdownTab(tab.value)
    case 'file':
      return fileTab(tab.value)
    case 'browser':
      return browserTab(tab.value)
    case undefined:
      throw invalidResponse('Session tab is missing its kind')
  }
}

function terminalTab(value: SessionTabsTerminalTab): SessionTabsTerminalTabValue {
  const base = {
    type: 'terminal' as const,
    id: value.id,
    title: value.title,
    parentTabId: value.parentTabId,
    leafId: value.leafId,
    isActive: value.isActive,
    ...(value.quickCommandLabel === undefined
      ? {}
      : { quickCommandLabel: value.quickCommandLabel }),
    ...(value.ptyId === undefined ? {} : { ptyId: value.ptyId }),
    ...(value.color === undefined ? {} : { color: value.color }),
    ...(value.isPinned === undefined ? {} : { isPinned: value.isPinned }),
    ...(value.launchAgent === undefined
      ? {}
      : // Why: the wire carries the agent preset as a plain string; the
        // renderer's projection narrows it to the known TuiAgent union.
        { launchAgent: value.launchAgent as SessionTabsLaunchAgentValue }),
    ...(value.resolvedAgentType === undefined
      ? {}
      : { resolvedAgentType: value.resolvedAgentType as SessionTabsLaunchAgentValue }),
    ...(value.startupCwd === undefined ? {} : { startupCwd: value.startupCwd }),
    ...(value.agentStatus ? { agentStatus: tabAgentStatus(value.agentStatus) } : {})
  }
  if (value.status === SessionTabsTerminalStatus.READY && value.terminal !== undefined) {
    return {
      ...base,
      status: 'ready',
      terminal: value.terminal,
      ...(value.worktreeInstanceId === undefined
        ? {}
        : { worktreeInstanceId: value.worktreeInstanceId })
    }
  }
  return {
    ...base,
    status: value.status === SessionTabsTerminalStatus.SLEEPING ? 'sleeping' : 'pending-handle',
    terminal: null
  }
}

function markdownTab(value: SessionTabsMarkdownTab): SessionTabsMarkdownTabValue {
  return {
    type: 'markdown',
    id: value.id,
    title: value.title,
    filePath: value.filePath,
    relativePath: value.relativePath,
    language: 'markdown',
    mode: value.mode === SessionTabsMarkdownMode.PREVIEW ? 'markdown-preview' : 'edit',
    isDirty: value.isDirty,
    isActive: value.isActive,
    sourceFileId: value.sourceFileId,
    sourceFilePath: value.sourceFilePath,
    sourceRelativePath: value.sourceRelativePath,
    documentVersion: value.documentVersion,
    ...(value.color === undefined ? {} : { color: value.color }),
    ...(value.isPinned === undefined ? {} : { isPinned: value.isPinned })
  }
}

function fileTab(value: SessionTabsFileTab): SessionTabsFileTabValue {
  return {
    type: 'file',
    id: value.id,
    title: value.title,
    filePath: value.filePath,
    relativePath: value.relativePath,
    language: value.language,
    ...(fileMode(value.mode) === undefined ? {} : { mode: fileMode(value.mode) }),
    ...(fileDiffSource(value.diffSource) === undefined
      ? {}
      : { diffSource: fileDiffSource(value.diffSource) }),
    isDirty: value.isDirty,
    isActive: value.isActive,
    ...(value.color === undefined ? {} : { color: value.color }),
    ...(value.isPinned === undefined ? {} : { isPinned: value.isPinned })
  }
}

function browserTab(value: SessionTabsBrowserTab): SessionTabsBrowserTabValue {
  return {
    type: 'browser',
    id: value.id,
    title: value.title,
    browserWorkspaceId: value.browserWorkspaceId,
    browserPageId: value.browserPageId ?? null,
    url: value.url,
    loading: value.loading,
    canGoBack: value.canGoBack,
    canGoForward: value.canGoForward,
    isActive: value.isActive,
    ...(value.color === undefined ? {} : { color: value.color }),
    ...(value.isPinned === undefined ? {} : { isPinned: value.isPinned })
  }
}

function tabAgentStatus(value: SessionTabsAgentStatus): SessionTabsAgentStatusValue {
  return {
    state: agentState(value.state),
    paneKey: value.paneKey ?? '',
    prompt: value.prompt ?? '',
    updatedAt: value.updatedAt ?? 0,
    stateStartedAt: value.stateStartedAt ?? 0,
    // Why: the tab projection carries the live status only; the renderer's
    // AgentStatusEntry requires an (empty) history roll to stay assignable.
    stateHistory: [],
    ...(value.agentType === undefined ? {} : { agentType: value.agentType }),
    ...(value.interactivePrompt === undefined
      ? {}
      : { interactivePrompt: value.interactivePrompt }),
    ...(value.lastAssistantMessage === undefined
      ? {}
      : { lastAssistantMessage: value.lastAssistantMessage }),
    ...(value.toolName === undefined ? {} : { toolName: value.toolName }),
    ...(value.toolInput === undefined ? {} : { toolInput: value.toolInput }),
    ...(value.interrupted === undefined ? {} : { interrupted: value.interrupted }),
    ...(value.providerSession
      ? {
          providerSession: {
            key: providerSessionKey(value.providerSession.key),
            id: value.providerSession.id,
            ...(value.providerSession.transcriptPath === undefined
              ? {}
              : { transcriptPath: value.providerSession.transcriptPath })
          }
        }
      : {})
  }
}

function sessionTabsTabGroup(value: SessionTabsTabGroup): SessionTabsTabGroupValue {
  return {
    id: value.id,
    activeTabId: nullableText(value.activeTabId),
    tabOrder: [...value.tabOrder],
    ...(value.recentTabIds.length > 0 ? { recentTabIds: [...value.recentTabIds] } : {})
  }
}

function groupLayoutNode(value: SessionTabsGroupLayoutNode): SessionTabsGroupLayoutNodeValue {
  const node = value.node
  switch (node.case) {
    case 'leaf':
      return { type: 'leaf', groupId: node.value.groupId }
    case 'split': {
      if (!node.value.first || !node.value.second) {
        throw invalidResponse('Group layout split is missing a child')
      }
      return {
        type: 'split',
        direction: paneSplitDirection(node.value.direction),
        first: groupLayoutNode(node.value.first),
        second: groupLayoutNode(node.value.second),
        ...(node.value.ratio === undefined ? {} : { ratio: node.value.ratio })
      }
    }
    case undefined:
      throw invalidResponse('Group layout node is missing its kind')
  }
}

// Why: the tab type enum is open at runtime — a future daemon can send a value
// this client does not know — so unknown values fall to the default arm.
function tabType(value: SessionTabsTabType): SessionTabsTabTypeValue | null {
  switch (value) {
    case SessionTabsTabType.TERMINAL:
      return 'terminal'
    case SessionTabsTabType.MARKDOWN:
      return 'markdown'
    case SessionTabsTabType.FILE:
      return 'file'
    case SessionTabsTabType.BROWSER:
      return 'browser'
    default:
      return null
  }
}

function agentState(value: AgentStatusStateValue): SessionTabsAgentStateValue {
  switch (value) {
    case AgentStatusState.WORKING:
      return 'working'
    case AgentStatusState.BLOCKED:
      return 'blocked'
    case AgentStatusState.WAITING:
      return 'waiting'
    case AgentStatusState.DONE:
      return 'done'
    default:
      return 'working'
  }
}

function providerSessionKey(value: AgentProviderSessionKeyValue): 'session_id' | 'conversation_id' {
  return value === AgentProviderSessionKey.CONVERSATION_ID ? 'conversation_id' : 'session_id'
}

function fileMode(value: SessionTabsFileMode): 'edit' | 'diff' | undefined {
  if (value === SessionTabsFileMode.DIFF) {
    return 'diff'
  }
  return value === SessionTabsFileMode.EDIT ? 'edit' : undefined
}

function fileDiffSource(value: SessionTabsFileDiffSource): 'staged' | 'unstaged' | undefined {
  if (value === SessionTabsFileDiffSource.STAGED) {
    return 'staged'
  }
  return value === SessionTabsFileDiffSource.UNSTAGED ? 'unstaged' : undefined
}

function paneSplitDirection(value: SessionTabsPaneSplitDirection): 'horizontal' | 'vertical' {
  return value === SessionTabsPaneSplitDirection.VERTICAL ? 'vertical' : 'horizontal'
}

function nullableText(value: string | undefined): string | null {
  return value === undefined ? null : value
}

function invalidResponse(message: string): RuntimeProtocolError {
  return new RuntimeProtocolError(StatusCode.DATA_LOSS, message)
}
