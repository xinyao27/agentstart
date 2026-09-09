import { create, fromBinary, toBinary } from '@bufbuild/protobuf'

import {
  TerminalAgentStatusValue,
  TerminalDisplayModeKind,
  TerminalService,
  TerminalServiceGetAgentStatusRequestSchema,
  TerminalServiceGetAgentStatusResponseSchema,
  TerminalServiceGetDisplayModeRequestSchema,
  TerminalServiceGetDisplayModeResponseSchema,
  TerminalServiceInspectProcessRequestSchema,
  TerminalServiceInspectProcessResponseSchema,
  TerminalServiceIsRunningAgentRequestSchema,
  TerminalServiceIsRunningAgentResponseSchema,
  TerminalServiceSetDisplayModeRequestSchema,
  TerminalServiceSetDisplayModeResponseSchema
} from '../../generated/yiru/runtime/v1/terminal_pb.js'
import type { RuntimeCallOptions } from '../transport.js'
import { clientIdentity, required, safeInteger, viewport } from './request-values.js'
import type { TerminalClientIdentity, TerminalViewport } from './types.js'
import { TerminalViewClient } from './view-client.js'

const GET_DISPLAY_MODE_PROCEDURE = `/${TerminalService.typeName}/${TerminalService.method.getDisplayMode.name}`
const SET_DISPLAY_MODE_PROCEDURE = `/${TerminalService.typeName}/${TerminalService.method.setDisplayMode.name}`
const INSPECT_PROCESS_PROCEDURE = `/${TerminalService.typeName}/${TerminalService.method.inspectProcess.name}`
const IS_RUNNING_AGENT_PROCEDURE = `/${TerminalService.typeName}/${TerminalService.method.isRunningAgent.name}`
const GET_AGENT_STATUS_PROCEDURE = `/${TerminalService.typeName}/${TerminalService.method.getAgentStatus.name}`

export class TerminalAgentClient extends TerminalViewClient {
  async getDisplayMode(
    terminal: string,
    options?: RuntimeCallOptions
  ): Promise<{ mode: 'auto' | 'desktop'; isPhoneFitted: boolean }> {
    const response = fromBinary(
      TerminalServiceGetDisplayModeResponseSchema,
      await this.transport.unary({
        method: GET_DISPLAY_MODE_PROCEDURE,
        payload: toBinary(
          TerminalServiceGetDisplayModeRequestSchema,
          create(TerminalServiceGetDisplayModeRequestSchema, {
            terminal: required(terminal, 'Terminal handle')
          })
        ),
        ...(options ? { options } : {})
      })
    )
    return { mode: displayModeKind(response.mode), isPhoneFitted: response.isPhoneFitted }
  }

  async setDisplayMode(
    input: {
      terminal: string
      mode: 'auto' | 'desktop'
      client?: TerminalClientIdentity
      viewport?: TerminalViewport
    },
    options?: RuntimeCallOptions
  ): Promise<{ mode: 'auto' | 'desktop'; seq: number }> {
    const response = fromBinary(
      TerminalServiceSetDisplayModeResponseSchema,
      await this.transport.unary({
        method: SET_DISPLAY_MODE_PROCEDURE,
        payload: toBinary(
          TerminalServiceSetDisplayModeRequestSchema,
          create(TerminalServiceSetDisplayModeRequestSchema, {
            terminal: required(input.terminal, 'Terminal handle'),
            mode:
              input.mode === 'desktop'
                ? TerminalDisplayModeKind.DESKTOP
                : TerminalDisplayModeKind.AUTO,
            ...(input.client ? { client: clientIdentity(input.client) } : {}),
            ...(input.viewport ? { viewport: viewport(input.viewport) } : {})
          })
        ),
        ...(options ? { options } : {})
      })
    )
    return {
      mode: displayModeKind(response.mode),
      seq: safeInteger(response.seq, 'Terminal display mode revision')
    }
  }

  async inspectProcess(
    terminal: string,
    options?: RuntimeCallOptions
  ): Promise<{ process: { foregroundProcess: string | null; hasChildProcesses: boolean } }> {
    const response = fromBinary(
      TerminalServiceInspectProcessResponseSchema,
      await this.transport.unary({
        method: INSPECT_PROCESS_PROCEDURE,
        payload: toBinary(
          TerminalServiceInspectProcessRequestSchema,
          create(TerminalServiceInspectProcessRequestSchema, {
            terminal: required(terminal, 'Terminal handle')
          })
        ),
        ...(options ? { options } : {})
      })
    )
    return {
      process: {
        foregroundProcess: response.foregroundProcess ?? null,
        hasChildProcesses: response.hasChildProcesses
      }
    }
  }

  async isRunningAgent(
    terminal: string,
    options?: RuntimeCallOptions
  ): Promise<{ isRunningAgent: boolean }> {
    const response = fromBinary(
      TerminalServiceIsRunningAgentResponseSchema,
      await this.transport.unary({
        method: IS_RUNNING_AGENT_PROCEDURE,
        payload: toBinary(
          TerminalServiceIsRunningAgentRequestSchema,
          create(TerminalServiceIsRunningAgentRequestSchema, {
            terminal: required(terminal, 'Terminal handle')
          })
        ),
        ...(options ? { options } : {})
      })
    )
    return { isRunningAgent: response.isRunningAgent }
  }

  async agentStatus(
    terminal: string,
    options?: RuntimeCallOptions
  ): Promise<{
    agentStatus: {
      handle: string
      isRunningAgent: boolean
      status: 'working' | 'permission' | 'idle' | null
    }
  }> {
    const response = fromBinary(
      TerminalServiceGetAgentStatusResponseSchema,
      await this.transport.unary({
        method: GET_AGENT_STATUS_PROCEDURE,
        payload: toBinary(
          TerminalServiceGetAgentStatusRequestSchema,
          create(TerminalServiceGetAgentStatusRequestSchema, {
            terminal: required(terminal, 'Terminal handle')
          })
        ),
        ...(options ? { options } : {})
      })
    )
    return {
      agentStatus: {
        handle: response.handle,
        isRunningAgent: response.isRunningAgent,
        status: agentStatusValue(response.status)
      }
    }
  }
}

function displayModeKind(value: TerminalDisplayModeKind): 'auto' | 'desktop' {
  switch (value) {
    case TerminalDisplayModeKind.AUTO:
      return 'auto'
    case TerminalDisplayModeKind.DESKTOP:
      return 'desktop'
    case TerminalDisplayModeKind.UNSPECIFIED:
      throw new TypeError('Terminal display mode is unspecified')
  }
}

function agentStatusValue(
  value: TerminalAgentStatusValue
): 'working' | 'permission' | 'idle' | null {
  switch (value) {
    case TerminalAgentStatusValue.WORKING:
      return 'working'
    case TerminalAgentStatusValue.PERMISSION:
      return 'permission'
    case TerminalAgentStatusValue.IDLE:
      return 'idle'
    case TerminalAgentStatusValue.UNSPECIFIED:
      return null
  }
}
