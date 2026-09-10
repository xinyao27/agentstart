import { create, fromBinary, toBinary } from '@bufbuild/protobuf'

import {
  TerminalManagedSessionState,
  TerminalManagedShellState,
  TerminalService,
  TerminalServiceKillAllManagedRequestSchema,
  TerminalServiceKillAllManagedResponseSchema,
  TerminalServiceKillManagedRequestSchema,
  TerminalServiceKillManagedResponseSchema,
  TerminalServiceListManagedSessionsRequestSchema,
  TerminalServiceListManagedSessionsResponseSchema,
  TerminalServiceRestartManagedRequestSchema,
  TerminalServiceRestartManagedResponseSchema,
  type TerminalManagedSession as ProtocolManagedSession
} from '../../generated/agent_start/runtime/v1/terminal_pb.js'
import type { RuntimeCallOptions } from '../transport.js'
import { TerminalAgentClient } from './agent-client.js'
import { required, safeInteger } from './request-values.js'
import type { ManagedSession } from './types.js'

const LIST_MANAGED_SESSIONS_PROCEDURE = `/${TerminalService.typeName}/${TerminalService.method.listManagedSessions.name}`
const KILL_ALL_MANAGED_PROCEDURE = `/${TerminalService.typeName}/${TerminalService.method.killAllManaged.name}`
const KILL_MANAGED_PROCEDURE = `/${TerminalService.typeName}/${TerminalService.method.killManaged.name}`
const RESTART_MANAGED_PROCEDURE = `/${TerminalService.typeName}/${TerminalService.method.restartManaged.name}`

export class TerminalManagedClient extends TerminalAgentClient {
  async listManagedSessions(options?: RuntimeCallOptions): Promise<{
    degraded: boolean
    sessions: ManagedSession[]
  }> {
    const response = fromBinary(
      TerminalServiceListManagedSessionsResponseSchema,
      await this.transport.unary({
        method: LIST_MANAGED_SESSIONS_PROCEDURE,
        payload: toBinary(
          TerminalServiceListManagedSessionsRequestSchema,
          create(TerminalServiceListManagedSessionsRequestSchema, {})
        ),
        ...(options ? { options } : {})
      })
    )
    return {
      degraded: response.degraded,
      sessions: response.sessions.map(managedSession)
    }
  }

  async killAllManaged(options?: RuntimeCallOptions): Promise<{
    killedCount: number
    remainingCount: number
    killedSessionIds: string[]
  }> {
    const response = fromBinary(
      TerminalServiceKillAllManagedResponseSchema,
      await this.transport.unary({
        method: KILL_ALL_MANAGED_PROCEDURE,
        payload: toBinary(
          TerminalServiceKillAllManagedRequestSchema,
          create(TerminalServiceKillAllManagedRequestSchema, {})
        ),
        ...(options ? { options } : {})
      })
    )
    return {
      killedCount: response.killedCount,
      remainingCount: response.remainingCount,
      killedSessionIds: response.killedSessionIds
    }
  }

  async killManaged(
    sessionId: string,
    options?: RuntimeCallOptions
  ): Promise<{ success: boolean }> {
    const response = fromBinary(
      TerminalServiceKillManagedResponseSchema,
      await this.transport.unary({
        method: KILL_MANAGED_PROCEDURE,
        payload: toBinary(
          TerminalServiceKillManagedRequestSchema,
          create(TerminalServiceKillManagedRequestSchema, {
            sessionId: required(sessionId, 'Terminal session ID')
          })
        ),
        ...(options ? { options } : {})
      })
    )
    return { success: response.success }
  }

  async restartManaged(options?: RuntimeCallOptions): Promise<{ success: boolean }> {
    const response = fromBinary(
      TerminalServiceRestartManagedResponseSchema,
      await this.transport.unary({
        method: RESTART_MANAGED_PROCEDURE,
        payload: toBinary(
          TerminalServiceRestartManagedRequestSchema,
          create(TerminalServiceRestartManagedRequestSchema, {})
        ),
        ...(options ? { options } : {})
      })
    )
    return { success: response.success }
  }
}

function managedSession(session: ProtocolManagedSession): ManagedSession {
  return {
    sessionId: session.sessionId,
    state: managedSessionState(session.state),
    shellState: managedShellState(session.shellState),
    isAlive: session.isAlive,
    pid: session.pid ?? null,
    cwd: session.cwd,
    cols: session.cols,
    rows: session.rows,
    createdAt: safeInteger(session.createdAt, 'Terminal managed session created time'),
    protocolVersion: session.protocolVersion
  }
}

function managedSessionState(
  value: TerminalManagedSessionState
): 'created' | 'spawning' | 'running' | 'exiting' | 'exited' {
  switch (value) {
    case TerminalManagedSessionState.CREATED:
      return 'created'
    case TerminalManagedSessionState.SPAWNING:
      return 'spawning'
    case TerminalManagedSessionState.RUNNING:
      return 'running'
    case TerminalManagedSessionState.EXITING:
      return 'exiting'
    case TerminalManagedSessionState.EXITED:
      return 'exited'
    case TerminalManagedSessionState.UNSPECIFIED:
      throw new TypeError('Terminal managed session state is unspecified')
  }
}

function managedShellState(
  value: TerminalManagedShellState
): 'pending' | 'ready' | 'timed_out' | 'unsupported' {
  switch (value) {
    case TerminalManagedShellState.PENDING:
      return 'pending'
    case TerminalManagedShellState.READY:
      return 'ready'
    case TerminalManagedShellState.TIMED_OUT:
      return 'timed_out'
    case TerminalManagedShellState.UNSUPPORTED:
      return 'unsupported'
    case TerminalManagedShellState.UNSPECIFIED:
      throw new TypeError('Terminal managed shell state is unspecified')
  }
}
