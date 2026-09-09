import { create, fromBinary, toBinary } from '@bufbuild/protobuf'

import {
  TerminalCwdFallback,
  TerminalService,
  TerminalServiceCloseRequestSchema,
  TerminalServiceCloseResponseSchema,
  TerminalServiceCloseTabRequestSchema,
  TerminalServiceCloseTabResponseSchema,
  TerminalServiceCreateRequestSchema,
  TerminalServiceCreateResponseSchema,
  TerminalServiceFocusRequestSchema,
  TerminalServiceFocusResponseSchema,
  TerminalServiceListRequestSchema,
  TerminalServiceListResponseSchema,
  TerminalServiceRenameRequestSchema,
  TerminalServiceRenameResponseSchema
} from '../../generated/yiru/runtime/v1/terminal_pb.js'
import type { RuntimeCallOptions, RuntimeTransport } from '../transport.js'
import { visualLayout } from './layout-values.js'
import { required, safeInteger, viewport, listLimit } from './request-values.js'
import { terminalCreate, terminalSummary, presentation, startupDelivery } from './session-values.js'
import type {
  TerminalCloseResult,
  TerminalCreateInput,
  TerminalCreateResult,
  TerminalFocusResult,
  TerminalListInput,
  TerminalListResult
} from './types.js'

const LIST_PROCEDURE = `/${TerminalService.typeName}/${TerminalService.method.list.name}`
const CREATE_PROCEDURE = `/${TerminalService.typeName}/${TerminalService.method.create.name}`
const CLOSE_PROCEDURE = `/${TerminalService.typeName}/${TerminalService.method.close.name}`
const CLOSE_TAB_PROCEDURE = `/${TerminalService.typeName}/${TerminalService.method.closeTab.name}`
const FOCUS_PROCEDURE = `/${TerminalService.typeName}/${TerminalService.method.focus.name}`
const RENAME_PROCEDURE = `/${TerminalService.typeName}/${TerminalService.method.rename.name}`

export class TerminalSessionClient {
  protected readonly transport: RuntimeTransport

  constructor(transport: RuntimeTransport) {
    this.transport = transport
  }

  async list(
    input: TerminalListInput = {},
    options?: RuntimeCallOptions
  ): Promise<TerminalListResult> {
    const response = fromBinary(
      TerminalServiceListResponseSchema,
      await this.transport.unary({
        method: LIST_PROCEDURE,
        payload: toBinary(
          TerminalServiceListRequestSchema,
          create(TerminalServiceListRequestSchema, {
            ...(input.worktree ? { worktree: input.worktree } : {}),
            ...(input.limit === undefined ? {} : { limit: listLimit(input.limit) }),
            requireFreshPtyLiveness: input.requireFreshPtyLiveness === true
          })
        ),
        ...(options ? { options } : {})
      })
    )
    return {
      terminals: response.terminals.map(terminalSummary),
      visualLayouts: response.visualLayouts.map(visualLayout),
      totalCount: safeInteger(response.totalCount, 'Terminal count'),
      truncated: response.truncated
    }
  }

  async create(
    input: TerminalCreateInput,
    options?: RuntimeCallOptions
  ): Promise<TerminalCreateResult> {
    const response = fromBinary(
      TerminalServiceCreateResponseSchema,
      await this.transport.unary({
        method: CREATE_PROCEDURE,
        payload: toBinary(
          TerminalServiceCreateRequestSchema,
          create(TerminalServiceCreateRequestSchema, {
            ...(input.worktree ? { worktree: input.worktree } : {}),
            ...(input.viewport ? { viewport: viewport(input.viewport) } : {}),
            ...(input.command ? { command: input.command } : {}),
            ...(input.cwd ? { cwd: input.cwd } : {}),
            cwdFallback:
              input.cwdFallback === 'worktree'
                ? TerminalCwdFallback.WORKTREE
                : TerminalCwdFallback.UNSPECIFIED,
            startupCommandDelivery: startupDelivery(input.startupCommandDelivery),
            env: input.env ?? {},
            envToDelete: input.envToDelete ?? [],
            ...(input.launchConfig
              ? {
                  launchConfig: {
                    ...(input.launchConfig.agentCommand === undefined
                      ? {}
                      : { agentCommand: input.launchConfig.agentCommand }),
                    agentArgs: input.launchConfig.agentArgs,
                    agentEnv: input.launchConfig.agentEnv,
                    ompResumeFilePath: input.launchConfig.ompResumeFilePath
                  }
                }
              : {}),
            ...(input.launchToken ? { launchToken: input.launchToken } : {}),
            ...(input.launchAgent ? { launchAgent: input.launchAgent } : {}),
            ...(input.title ? { title: input.title } : {}),
            focus: input.focus === true,
            rendererBacked: input.rendererBacked === true,
            activate: input.activate === true,
            presentation: presentation(input.presentation),
            ...(input.tabId ? { tabId: input.tabId } : {}),
            ...(input.leafId ? { leafId: input.leafId } : {})
          })
        ),
        ...(options ? { options } : {})
      })
    )
    if (!response.terminal) {
      throw new TypeError('Terminal creation response is missing the terminal')
    }
    return { terminal: terminalCreate(response.terminal) }
  }

  async close(terminal: string, options?: RuntimeCallOptions): Promise<TerminalCloseResult> {
    const response = fromBinary(
      TerminalServiceCloseResponseSchema,
      await this.transport.unary({
        method: CLOSE_PROCEDURE,
        payload: toBinary(
          TerminalServiceCloseRequestSchema,
          create(TerminalServiceCloseRequestSchema, {
            terminal: required(terminal, 'Terminal handle')
          })
        ),
        ...(options ? { options } : {})
      })
    )
    if (!response.close) {
      throw new TypeError('Terminal close response is missing the result')
    }
    return { close: response.close }
  }

  async closeTab(terminal: string, options?: RuntimeCallOptions): Promise<TerminalCloseResult> {
    const response = fromBinary(
      TerminalServiceCloseTabResponseSchema,
      await this.transport.unary({
        method: CLOSE_TAB_PROCEDURE,
        payload: toBinary(
          TerminalServiceCloseTabRequestSchema,
          create(TerminalServiceCloseTabRequestSchema, {
            terminal: required(terminal, 'Terminal handle')
          })
        ),
        ...(options ? { options } : {})
      })
    )
    if (!response.close) {
      throw new TypeError('Terminal close tab response is missing the result')
    }
    return { close: response.close }
  }

  async focus(terminal: string, options?: RuntimeCallOptions): Promise<TerminalFocusResult> {
    const response = fromBinary(
      TerminalServiceFocusResponseSchema,
      await this.transport.unary({
        method: FOCUS_PROCEDURE,
        payload: toBinary(
          TerminalServiceFocusRequestSchema,
          create(TerminalServiceFocusRequestSchema, {
            terminal: required(terminal, 'Terminal handle')
          })
        ),
        ...(options ? { options } : {})
      })
    )
    if (!response.focus) {
      throw new TypeError('Terminal focus response is missing the result')
    }
    return { focus: response.focus }
  }

  async rename(
    input: { terminal: string; title?: string | null },
    options?: RuntimeCallOptions
  ): Promise<{ rename: { handle: string; tabId: string; title: string | null } }> {
    const response = fromBinary(
      TerminalServiceRenameResponseSchema,
      await this.transport.unary({
        method: RENAME_PROCEDURE,
        payload: toBinary(
          TerminalServiceRenameRequestSchema,
          create(TerminalServiceRenameRequestSchema, {
            terminal: required(input.terminal, 'Terminal handle'),
            ...(input.title ? { title: input.title } : {})
          })
        ),
        ...(options ? { options } : {})
      })
    )
    return {
      rename: { handle: response.handle, tabId: response.tabId, title: response.title ?? null }
    }
  }
}
