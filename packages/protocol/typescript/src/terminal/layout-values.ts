import {
  TerminalSplitDirection,
  type TerminalVisualLayout as ProtocolVisualLayout,
  type TerminalVisualLayoutNode as ProtocolVisualLayoutNode,
  type TerminalVisualPaneNode as ProtocolVisualPaneNode
} from '../../generated/agent_start/runtime/v1/terminal_pb.js'
import type {
  TerminalVisualLayout,
  TerminalVisualLayoutNode,
  TerminalVisualPaneNode
} from './types.js'

export function visualLayout(layout: ProtocolVisualLayout): TerminalVisualLayout {
  if (!layout.root) {
    throw new TypeError('Terminal visual layout is missing its root')
  }
  return {
    worktreeId: layout.worktreeId,
    worktreePath: layout.worktreePath,
    root: visualLayoutNode(layout.root)
  }
}

function visualLayoutNode(node: ProtocolVisualLayoutNode): TerminalVisualLayoutNode {
  switch (node.node.case) {
    case 'group':
      return {
        type: 'group',
        groupId: node.node.value.groupId ?? null,
        activeTabId: node.node.value.activeTabId ?? null,
        tabs: node.node.value.tabs.map((tab) => {
          if (!tab.panes) {
            throw new TypeError('Terminal visual tab is missing its panes')
          }
          return {
            tabId: tab.tabId,
            title: tab.title ?? null,
            activeLeafId: tab.activeLeafId ?? null,
            panes: visualPaneNode(tab.panes)
          }
        })
      }
    case 'split': {
      const { first, second } = node.node.value
      if (!first || !second) {
        throw new TypeError('Terminal visual split is incomplete')
      }
      return {
        type: 'split',
        direction: splitDirection(node.node.value.direction),
        first: visualLayoutNode(first),
        second: visualLayoutNode(second)
      }
    }
    case undefined:
      throw new TypeError('Terminal visual layout node is empty')
  }
}

function visualPaneNode(node: ProtocolVisualPaneNode): TerminalVisualPaneNode {
  switch (node.node.case) {
    case 'terminal':
      return {
        type: 'terminal',
        handle: node.node.value.handle,
        tabId: node.node.value.tabId,
        leafId: node.node.value.leafId,
        title: node.node.value.title ?? null,
        connected: node.node.value.connected,
        active: node.node.value.active
      }
    case 'split': {
      const { first, second } = node.node.value
      if (!first || !second) {
        throw new TypeError('Terminal visual pane split is incomplete')
      }
      return {
        type: 'pane-split',
        direction: splitDirection(node.node.value.direction),
        first: visualPaneNode(first),
        second: visualPaneNode(second)
      }
    }
    case undefined:
      throw new TypeError('Terminal visual pane node is empty')
  }
}

export function splitDirection(value: TerminalSplitDirection): 'horizontal' | 'vertical' {
  switch (value) {
    case TerminalSplitDirection.HORIZONTAL:
      return 'horizontal'
    case TerminalSplitDirection.VERTICAL:
      return 'vertical'
    case TerminalSplitDirection.UNSPECIFIED:
      throw new TypeError('Terminal split direction is unspecified')
  }
}
