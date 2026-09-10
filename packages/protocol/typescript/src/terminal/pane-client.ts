import { create, fromBinary, toBinary } from '@bufbuild/protobuf'

import {
  TerminalService,
  TerminalServiceResolveActiveRequestSchema,
  TerminalServiceResolveActiveResponseSchema,
  TerminalServiceResolvePaneRequestSchema,
  TerminalServiceResolvePaneResponseSchema,
  TerminalServiceRestoreDesktopFitRequestSchema,
  TerminalServiceRestoreDesktopFitResponseSchema,
  TerminalServiceShowRequestSchema,
  TerminalServiceShowResponseSchema,
  TerminalServiceSplitRequestSchema,
  TerminalServiceSplitResponseSchema,
  TerminalServiceStopExactRequestSchema,
  TerminalServiceStopExactResponseSchema,
  TerminalServiceStopRequestSchema,
  TerminalServiceStopResponseSchema,
  TerminalServiceWaitRequestSchema,
  TerminalServiceWaitResponseSchema,
  TerminalSplitDirection,
  TerminalWaitCondition,
  TerminalWaitStatus
} from '../../generated/agent_start/runtime/v1/terminal_pb.js'
import type { RuntimeCallOptions } from '../transport.js'
import {
  paneRuntimeIdOrNone,
  required,
  safeInteger,
  splitTelemetrySource
} from './request-values.js'
import { TerminalSessionClient } from './session-client.js'
import { terminalSummary } from './session-values.js'
import type { TerminalShowResult } from './types.js'

const SHOW_PROCEDURE = `/${TerminalService.typeName}/${TerminalService.method.show.name}`
const SPLIT_PROCEDURE = `/${TerminalService.typeName}/${TerminalService.method.split.name}`
const STOP_PROCEDURE = `/${TerminalService.typeName}/${TerminalService.method.stop.name}`
const STOP_EXACT_PROCEDURE = `/${TerminalService.typeName}/${TerminalService.method.stopExact.name}`
const RESOLVE_ACTIVE_PROCEDURE = `/${TerminalService.typeName}/${TerminalService.method.resolveActive.name}`
const RESOLVE_PANE_PROCEDURE = `/${TerminalService.typeName}/${TerminalService.method.resolvePane.name}`
const WAIT_PROCEDURE = `/${TerminalService.typeName}/${TerminalService.method.wait.name}`
const RESTORE_DESKTOP_FIT_PROCEDURE = `/${TerminalService.typeName}/${TerminalService.method.restoreDesktopFit.name}`

export class TerminalPaneClient extends TerminalSessionClient {
  async show(
    terminal: string,
    options?: RuntimeCallOptions
  ): Promise<{ terminal: TerminalShowResult }> {
    const response = fromBinary(
      TerminalServiceShowResponseSchema,
      await this.transport.unary({
        method: SHOW_PROCEDURE,
        payload: toBinary(
          TerminalServiceShowRequestSchema,
          create(TerminalServiceShowRequestSchema, {
            terminal: required(terminal, 'Terminal handle')
          })
        ),
        ...(options ? { options } : {})
      })
    )
    if (!response.summary) {
      throw new TypeError('Terminal show response is missing the summary')
    }
    return {
      terminal: {
        ...terminalSummary(response.summary),
        paneRuntimeId: paneRuntimeIdOrNone(response.paneRuntimeId, 'Terminal pane runtime ID'),
        rendererGraphEpoch: safeInteger(
          response.rendererGraphEpoch,
          'Terminal renderer graph epoch'
        ),
        transportGeneration: response.transportGeneration
      }
    }
  }

  async split(
    input: {
      terminal: string
      direction?: 'horizontal' | 'vertical'
      command?: string
      env?: Record<string, string>
      telemetrySource?: 'contextual_tour' | 'keyboard' | 'context_menu' | 'command' | 'unknown'
    },
    options?: RuntimeCallOptions
  ): Promise<{ split: { handle: string; paneRuntimeId: number; tabId: string } }> {
    const response = fromBinary(
      TerminalServiceSplitResponseSchema,
      await this.transport.unary({
        method: SPLIT_PROCEDURE,
        payload: toBinary(
          TerminalServiceSplitRequestSchema,
          create(TerminalServiceSplitRequestSchema, {
            terminal: required(input.terminal, 'Terminal handle'),
            direction:
              input.direction === 'vertical'
                ? TerminalSplitDirection.VERTICAL
                : TerminalSplitDirection.HORIZONTAL,
            ...(input.command ? { command: input.command } : {}),
            env: input.env ?? {},
            telemetrySource: splitTelemetrySource(input.telemetrySource)
          })
        ),
        ...(options ? { options } : {})
      })
    )
    return {
      split: {
        handle: response.handle,
        paneRuntimeId: paneRuntimeIdOrNone(
          response.paneRuntimeId,
          'Terminal split pane runtime ID'
        ),
        tabId: response.tabId
      }
    }
  }

  async stop(worktree: string, options?: RuntimeCallOptions): Promise<{ stopped: number }> {
    const response = fromBinary(
      TerminalServiceStopResponseSchema,
      await this.transport.unary({
        method: STOP_PROCEDURE,
        payload: toBinary(
          TerminalServiceStopRequestSchema,
          create(TerminalServiceStopRequestSchema, {
            worktree: required(worktree, 'Terminal worktree selector')
          })
        ),
        ...(options ? { options } : {})
      })
    )
    return { stopped: response.stopped }
  }

  async stopExact(
    input: { worktree: string; expectedPtyIds: string[]; targetOnly?: boolean },
    options?: RuntimeCallOptions
  ): Promise<{
    stopped: number
    stoppedPtyIds: string[]
    livePtyIds: string[]
    postStopVerified: boolean
    postStopFailure?: string
    remainingLivePtyIds: string[]
  }> {
    const response = fromBinary(
      TerminalServiceStopExactResponseSchema,
      await this.transport.unary({
        method: STOP_EXACT_PROCEDURE,
        payload: toBinary(
          TerminalServiceStopExactRequestSchema,
          create(TerminalServiceStopExactRequestSchema, {
            worktree: required(input.worktree, 'Terminal worktree selector'),
            expectedPtyIds: input.expectedPtyIds,
            targetOnly: input.targetOnly === true
          })
        ),
        ...(options ? { options } : {})
      })
    )
    return {
      stopped: response.stopped,
      stoppedPtyIds: response.stoppedPtyIds,
      livePtyIds: response.livePtyIds,
      postStopVerified: response.postStopVerified,
      ...(response.postStopFailure ? { postStopFailure: response.postStopFailure } : {}),
      remainingLivePtyIds: response.remainingLivePtyIds
    }
  }

  async resolveActive(
    worktree?: string,
    options?: RuntimeCallOptions
  ): Promise<{ handle: string }> {
    const response = fromBinary(
      TerminalServiceResolveActiveResponseSchema,
      await this.transport.unary({
        method: RESOLVE_ACTIVE_PROCEDURE,
        payload: toBinary(
          TerminalServiceResolveActiveRequestSchema,
          create(TerminalServiceResolveActiveRequestSchema, worktree ? { worktree } : {})
        ),
        ...(options ? { options } : {})
      })
    )
    return { handle: response.handle }
  }

  async resolvePane(
    paneKey: string,
    options?: RuntimeCallOptions
  ): Promise<{
    terminal: { handle: string; leafId: string; ptyId: string | null; tabId: string }
  }> {
    const response = fromBinary(
      TerminalServiceResolvePaneResponseSchema,
      await this.transport.unary({
        method: RESOLVE_PANE_PROCEDURE,
        payload: toBinary(
          TerminalServiceResolvePaneRequestSchema,
          create(TerminalServiceResolvePaneRequestSchema, {
            paneKey: required(paneKey, 'Terminal pane key')
          })
        ),
        ...(options ? { options } : {})
      })
    )
    return {
      terminal: {
        handle: response.handle,
        leafId: response.leafId,
        ptyId: response.ptyId ?? null,
        tabId: response.tabId
      }
    }
  }

  async wait(
    input: { terminal: string; for: 'exit' | 'tui-idle'; timeoutMs?: number },
    options?: RuntimeCallOptions
  ): Promise<{
    wait: {
      handle: string
      condition: 'exit' | 'tui-idle'
      satisfied: boolean
      status: 'running' | 'exited' | 'unknown'
      exitCode: number | null
      blockedReason?: string
    }
  }> {
    const response = fromBinary(
      TerminalServiceWaitResponseSchema,
      await this.transport.unary({
        method: WAIT_PROCEDURE,
        payload: toBinary(
          TerminalServiceWaitRequestSchema,
          create(TerminalServiceWaitRequestSchema, {
            terminal: required(input.terminal, 'Terminal handle'),
            condition:
              input.for === 'exit' ? TerminalWaitCondition.EXIT : TerminalWaitCondition.TUI_IDLE,
            ...(input.timeoutMs === undefined
              ? {}
              : { timeoutMs: BigInt(Math.max(1, Math.floor(input.timeoutMs))) })
          })
        ),
        ...(options ? { options } : {})
      })
    )
    return {
      wait: {
        handle: response.handle,
        condition: input.for,
        satisfied: response.satisfied,
        status: waitStatus(response.status),
        exitCode: response.exitCode ?? null,
        ...(response.blockedReason ? { blockedReason: response.blockedReason } : {})
      }
    }
  }

  async restoreFit(terminal: string, options?: RuntimeCallOptions): Promise<{ restored: boolean }> {
    const response = fromBinary(
      TerminalServiceRestoreDesktopFitResponseSchema,
      await this.transport.unary({
        method: RESTORE_DESKTOP_FIT_PROCEDURE,
        payload: toBinary(
          TerminalServiceRestoreDesktopFitRequestSchema,
          create(TerminalServiceRestoreDesktopFitRequestSchema, {
            terminal: required(terminal, 'Terminal handle')
          })
        ),
        ...(options ? { options } : {})
      })
    )
    return { restored: response.restored }
  }
}

function waitStatus(value: TerminalWaitStatus): 'running' | 'exited' | 'unknown' {
  switch (value) {
    case TerminalWaitStatus.RUNNING:
      return 'running'
    case TerminalWaitStatus.EXITED:
      return 'exited'
    case TerminalWaitStatus.UNSPECIFIED:
      return 'unknown'
  }
}
