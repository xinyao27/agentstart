import { create, fromBinary, toBinary } from '@bufbuild/protobuf'

import {
  TerminalAgentRequirement,
  TerminalInputKind,
  TerminalResizeForClientFitSchema,
  TerminalResizeForClientRestoreSchema,
  TerminalResizeMode,
  TerminalSendRefusedReason,
  TerminalService,
  TerminalServiceApproveRequestSchema,
  TerminalServiceApproveResponseSchema,
  TerminalServiceClearBufferRequestSchema,
  TerminalServiceClearBufferResponseSchema,
  TerminalServiceReadRequestSchema,
  TerminalServiceReadResponseSchema,
  TerminalServiceResizeForClientRequestSchema,
  TerminalServiceResizeForClientResponseSchema,
  TerminalServiceSendRequestSchema,
  TerminalServiceSendResponseSchema
} from '../../generated/yiru/runtime/v1/terminal_pb.js'
import type { RuntimeCallOptions } from '../transport.js'
import { TerminalPaneClient } from './pane-client.js'
import {
  clientIdentity,
  cursor,
  readLimit,
  required,
  safeInteger,
  viewport
} from './request-values.js'
import { terminalState } from './session-values.js'
import type {
  TerminalReadInput,
  TerminalReadResult,
  TerminalSendInput,
  TerminalSendResult
} from './types.js'

const READ_PROCEDURE = `/${TerminalService.typeName}/${TerminalService.method.read.name}`
const SEND_PROCEDURE = `/${TerminalService.typeName}/${TerminalService.method.send.name}`
const APPROVE_PROCEDURE = `/${TerminalService.typeName}/${TerminalService.method.approve.name}`
const CLEAR_BUFFER_PROCEDURE = `/${TerminalService.typeName}/${TerminalService.method.clearBuffer.name}`
const RESIZE_FOR_CLIENT_PROCEDURE = `/${TerminalService.typeName}/${TerminalService.method.resizeForClient.name}`

export class TerminalIoClient extends TerminalPaneClient {
  async read(input: TerminalReadInput, options?: RuntimeCallOptions): Promise<TerminalReadResult> {
    const response = fromBinary(
      TerminalServiceReadResponseSchema,
      await this.transport.unary({
        method: READ_PROCEDURE,
        payload: toBinary(
          TerminalServiceReadRequestSchema,
          create(TerminalServiceReadRequestSchema, {
            terminal: required(input.terminal, 'Terminal handle'),
            ...(input.cursor === undefined ? {} : { cursor: cursor(input.cursor) }),
            ...(readLimit(input.limit) === undefined ? {} : { limit: readLimit(input.limit) })
          })
        ),
        ...(options ? { options } : {})
      })
    )
    if (!response.terminal) {
      throw new TypeError('Terminal read response is missing the terminal')
    }
    const terminal = response.terminal
    return {
      terminal: {
        handle: terminal.handle,
        status: terminalState(terminal.status),
        tail: terminal.tail,
        truncated: terminal.truncated,
        limited: terminal.limited,
        oldestCursor: terminal.oldestCursor,
        nextCursor: terminal.nextCursor || null,
        latestCursor: terminal.latestCursor,
        returnedLineCount: terminal.returnedLineCount
      }
    }
  }

  async send(input: TerminalSendInput, options?: RuntimeCallOptions): Promise<TerminalSendResult> {
    const response = fromBinary(
      TerminalServiceSendResponseSchema,
      await this.transport.unary({
        method: SEND_PROCEDURE,
        payload: toBinary(
          TerminalServiceSendRequestSchema,
          create(TerminalServiceSendRequestSchema, {
            terminal: required(input.terminal, 'Terminal handle'),
            ...(input.text ? { text: input.text } : {}),
            enter: input.enter === true,
            interrupt: input.interrupt === true,
            requireAgentStatus:
              input.requireAgentStatus === 'sendable'
                ? TerminalAgentRequirement.SENDABLE
                : TerminalAgentRequirement.UNSPECIFIED,
            inputKind:
              input.inputKind === 'query-reply'
                ? TerminalInputKind.QUERY_REPLY
                : TerminalInputKind.UNSPECIFIED,
            ...(input.client ? { client: clientIdentity(input.client) } : {}),
            ...(input.viewport ? { viewport: viewport(input.viewport) } : {}),
            claimViewport: input.claimViewport === true
          })
        ),
        ...(options ? { options } : {})
      })
    )
    if (!response.send) {
      throw new TypeError('Terminal send response is missing the result')
    }
    return {
      send: {
        handle: response.send.handle,
        accepted: response.send.accepted,
        bytesWritten: safeInteger(response.send.bytesWritten, 'Terminal bytes written'),
        ...(response.send.refusedReason === TerminalSendRefusedReason.NO_AGENT
          ? { refusedReason: 'no-agent' as const }
          : {}),
        ...(response.send.refusedReason === TerminalSendRefusedReason.PERMISSION
          ? { refusedReason: 'permission' as const }
          : {})
      }
    }
  }

  async approve(terminal: string, options?: RuntimeCallOptions): Promise<{ accepted: boolean }> {
    const response = fromBinary(
      TerminalServiceApproveResponseSchema,
      await this.transport.unary({
        method: APPROVE_PROCEDURE,
        payload: toBinary(
          TerminalServiceApproveRequestSchema,
          create(TerminalServiceApproveRequestSchema, {
            terminal: required(terminal, 'Terminal handle')
          })
        ),
        ...(options ? { options } : {})
      })
    )
    return { accepted: response.accepted }
  }

  async clearBuffer(
    terminal: string,
    options?: RuntimeCallOptions
  ): Promise<{ clear: { handle: string; cleared: boolean } }> {
    const response = fromBinary(
      TerminalServiceClearBufferResponseSchema,
      await this.transport.unary({
        method: CLEAR_BUFFER_PROCEDURE,
        payload: toBinary(
          TerminalServiceClearBufferRequestSchema,
          create(TerminalServiceClearBufferRequestSchema, {
            terminal: required(terminal, 'Terminal handle')
          })
        ),
        ...(options ? { options } : {})
      })
    )
    return { clear: { handle: response.handle, cleared: response.cleared } }
  }

  async resizeForClient(
    input: {
      terminal: string
      clientId: string
      fit?: { cols: number; rows: number }
      restore?: true
    },
    options?: RuntimeCallOptions
  ): Promise<{
    terminal: {
      handle: string
      cols: number
      rows: number
      previousCols: number | null
      previousRows: number | null
      mode: 'mobile-fit' | 'desktop-fit'
    }
  }> {
    const mode = input.restore
      ? { case: 'restore' as const, value: create(TerminalResizeForClientRestoreSchema) }
      : input.fit
        ? {
            case: 'fit' as const,
            value: create(TerminalResizeForClientFitSchema, {
              cols: input.fit.cols,
              rows: input.fit.rows
            })
          }
        : undefined
    if (!mode) {
      throw new TypeError('Terminal resize requires either fit dimensions or restore')
    }
    const response = fromBinary(
      TerminalServiceResizeForClientResponseSchema,
      await this.transport.unary({
        method: RESIZE_FOR_CLIENT_PROCEDURE,
        payload: toBinary(
          TerminalServiceResizeForClientRequestSchema,
          create(TerminalServiceResizeForClientRequestSchema, {
            terminal: required(input.terminal, 'Terminal handle'),
            clientId: required(input.clientId, 'Terminal client ID'),
            mode
          })
        ),
        ...(options ? { options } : {})
      })
    )
    if (!response.terminal) {
      throw new TypeError('Terminal resize response is missing the result')
    }
    return { terminal: resizeForClientResult(response.terminal) }
  }
}

function resizeForClientResult(result: {
  handle: string
  cols: number
  rows: number
  previousCols?: number
  previousRows?: number
  mode: TerminalResizeMode
}): {
  handle: string
  cols: number
  rows: number
  previousCols: number | null
  previousRows: number | null
  mode: 'mobile-fit' | 'desktop-fit'
} {
  const mode = (() => {
    switch (result.mode) {
      case TerminalResizeMode.MOBILE_FIT:
        return 'mobile-fit' as const
      case TerminalResizeMode.DESKTOP_FIT:
        return 'desktop-fit' as const
      case TerminalResizeMode.UNSPECIFIED:
        throw new TypeError('Terminal resize mode is unspecified')
    }
  })()
  return {
    handle: result.handle,
    cols: result.cols,
    rows: result.rows,
    previousCols: result.previousCols ?? null,
    previousRows: result.previousRows ?? null,
    mode
  }
}
