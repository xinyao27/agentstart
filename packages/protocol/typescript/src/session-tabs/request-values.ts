import { create } from '@bufbuild/protobuf'

import {
  SessionTabsLaunchConfigSchema,
  SessionTabsMoveKind,
  SessionTabsNullableColorSchema,
  SessionTabsNullableStringFieldSchema,
  SessionTabsPaneLayoutNodeSchema,
  SessionTabsPaneLayoutRootSchema,
  SessionTabsPaneLeafSchema,
  SessionTabsPaneSplitDirection,
  SessionTabsPaneSplitSchema,
  SessionTabsServiceMoveReorderSchema,
  SessionTabsServiceMoveSplitSchema,
  SessionTabsServiceMoveToGroupSchema,
  SessionTabsSplitDirection,
  SessionTabsStartupCommandDeliverySchema,
  type SessionTabsPaneLayoutNode as ProtocolPaneLayoutNode
} from '../../generated/agent_start/runtime/v1/session_tabs_pb.js'
import type {
  SessionTabsCreateTerminalInput,
  SessionTabsMoveInput,
  SessionTabsPaneLayoutNodeValue
} from './values.js'

export function createTerminalRequest(input: SessionTabsCreateTerminalInput) {
  return {
    worktree: input.worktree,
    ...(input.activate === undefined ? {} : { activate: input.activate }),
    ...(input.afterTabId === undefined ? {} : { afterTabId: input.afterTabId }),
    ...(input.agent === undefined ? {} : { agent: input.agent }),
    ...(input.agentPrompt === undefined ? {} : { agentPrompt: input.agentPrompt }),
    ...(input.clientMutationId === undefined ? {} : { clientMutationId: input.clientMutationId }),
    ...(input.command === undefined ? {} : { command: input.command }),
    ...(input.cwd === undefined ? {} : { cwd: input.cwd }),
    ...(input.env ? { env: input.env } : {}),
    ...(input.envToDelete ? { envToDelete: input.envToDelete } : {}),
    ...(input.launchAgent === undefined ? {} : { launchAgent: input.launchAgent }),
    ...(input.launchConfig
      ? {
          launchConfig: create(SessionTabsLaunchConfigSchema, {
            agentArgs: input.launchConfig.agentArgs,
            agentEnv: input.launchConfig.agentEnv,
            ...(input.launchConfig.agentCommand === undefined
              ? {}
              : { agentCommand: input.launchConfig.agentCommand }),
            ...(input.launchConfig.ompResumeFilePath === undefined
              ? {}
              : { ompResumeFilePath: input.launchConfig.ompResumeFilePath })
          })
        }
      : {}),
    ...(input.launchToken === undefined ? {} : { launchToken: input.launchToken }),
    ...(input.startupCommandDelivery
      ? {
          startupCommandDelivery: create(SessionTabsStartupCommandDeliverySchema, {
            delivery:
              input.startupCommandDelivery === 'fast'
                ? { case: 'fast' as const, value: true }
                : { case: 'shellReady' as const, value: true }
          })
        }
      : {}),
    ...(input.targetGroupId === undefined ? {} : { targetGroupId: input.targetGroupId })
  }
}

export function moveRequest(input: SessionTabsMoveInput) {
  const base = {
    worktree: input.worktree,
    tabId: input.tabId,
    targetGroupId: input.targetGroupId
  }
  if (input.kind === 'reorder') {
    return {
      ...base,
      kind: SessionTabsMoveKind.REORDER,
      detail: {
        case: 'reorder' as const,
        value: create(SessionTabsServiceMoveReorderSchema, { tabOrder: input.tabOrder ?? [] })
      }
    }
  }
  if (input.kind === 'move-to-group') {
    return {
      ...base,
      kind: SessionTabsMoveKind.MOVE_TO_GROUP,
      detail: {
        case: 'moveToGroup' as const,
        value: create(
          SessionTabsServiceMoveToGroupSchema,
          input.index === undefined ? {} : { index: input.index }
        )
      }
    }
  }
  return {
    ...base,
    kind: SessionTabsMoveKind.SPLIT,
    detail: {
      case: 'split' as const,
      value: create(SessionTabsServiceMoveSplitSchema, {
        direction: splitDirection(input.splitDirection)
      })
    }
  }
}

function splitDirection(
  direction: SessionTabsMoveInput['splitDirection']
): SessionTabsSplitDirection {
  switch (direction) {
    case 'right':
      return SessionTabsSplitDirection.RIGHT
    case 'up':
      return SessionTabsSplitDirection.UP
    case 'down':
      return SessionTabsSplitDirection.DOWN
    case 'left':
    case undefined:
      return SessionTabsSplitDirection.LEFT
  }
}

export function paneLayoutRoot(root: SessionTabsPaneLayoutNodeValue | null) {
  return create(SessionTabsPaneLayoutRootSchema, {
    value:
      root === null
        ? { case: 'null' as const, value: true }
        : { case: 'node' as const, value: paneLayoutNode(root) }
  })
}

export function nullableField(value: string | null) {
  return create(SessionTabsNullableStringFieldSchema, {
    value:
      value === null ? { case: 'null' as const, value: true } : { case: 'text' as const, value }
  })
}

export function nullableColor(value: string | null) {
  return create(SessionTabsNullableColorSchema, {
    value:
      value === null ? { case: 'null' as const, value: true } : { case: 'text' as const, value }
  })
}

function paneLayoutNode(node: SessionTabsPaneLayoutNodeValue): ProtocolPaneLayoutNode {
  if (node.type === 'leaf') {
    return create(SessionTabsPaneLayoutNodeSchema, {
      node: {
        case: 'leaf' as const,
        value: create(SessionTabsPaneLeafSchema, { leafId: node.leafId })
      }
    })
  }
  return create(SessionTabsPaneLayoutNodeSchema, {
    node: {
      case: 'split' as const,
      value: create(SessionTabsPaneSplitSchema, {
        direction:
          node.direction === 'vertical'
            ? SessionTabsPaneSplitDirection.VERTICAL
            : SessionTabsPaneSplitDirection.HORIZONTAL,
        first: paneLayoutNode(node.first),
        second: paneLayoutNode(node.second),
        ...(node.ratio === undefined ? {} : { ratio: node.ratio })
      })
    }
  })
}
