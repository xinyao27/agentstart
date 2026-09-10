import { create, fromBinary, toBinary } from '@bufbuild/protobuf'

import { StatusCode } from '../../generated/agent_start/protocol/v1/errors_pb.js'
import {
  SessionTabsService,
  SessionTabsServiceActivateRequestSchema,
  SessionTabsServiceClosedResponseSchema,
  SessionTabsServiceCreateTerminalRequestSchema,
  SessionTabsServiceCreateTerminalResponseSchema,
  SessionTabsServiceListAllRequestSchema,
  SessionTabsServiceListAllResponseSchema,
  SessionTabsServiceListRequestSchema,
  SessionTabsServiceMoveRequestSchema,
  SessionTabsServiceMovedResponseSchema,
  SessionTabsServiceSetTabPropsRequestSchema,
  SessionTabsServiceTabRequestSchema,
  SessionTabsServiceUnsubscribeAllRequestSchema,
  SessionTabsServiceUnsubscribeRequestSchema,
  SessionTabsServiceUnsubscribedResponseSchema,
  SessionTabsServiceUpdatePaneLayoutRequestSchema,
  SessionTabsServiceUpdatedResponseSchema,
  SessionTabsSnapshotSchema
} from '../../generated/agent_start/runtime/v1/session_tabs_pb.js'
import { RuntimeProtocolError } from '../error.js'
import type { RuntimeCallOptions, RuntimeTransport } from '../transport.js'
import {
  createTerminalRequest,
  moveRequest,
  nullableColor,
  nullableField,
  paneLayoutRoot
} from './request-values.js'
import { sessionTabsSnapshot, sessionTabsTab } from './snapshot-values.js'
import { allStreamEvents, streamEvents } from './stream-values.js'
import type {
  SessionTabsCreateTerminalInput,
  SessionTabsCreateTerminalResultValue,
  SessionTabsMoveInput,
  SessionTabsSetTabPropsInput,
  SessionTabsSnapshotValue,
  SessionTabsUpdatePaneLayoutInput
} from './values.js'
import type { SessionTabsAllStreamEventValue, SessionTabsStreamEventValue } from './values.js'

export type SessionTabsEvents = Readonly<{
  events: AsyncIterable<SessionTabsStreamEventValue>
  cancel: (reason?: string) => Promise<void>
}>

export type SessionTabsAllEvents = Readonly<{
  events: AsyncIterable<SessionTabsAllStreamEventValue>
  cancel: (reason?: string) => Promise<void>
}>

const ACTIVATE_PROCEDURE = `/${SessionTabsService.typeName}/${SessionTabsService.method.activate.name}`
const CLOSE_PROCEDURE = `/${SessionTabsService.typeName}/${SessionTabsService.method.close.name}`
const CREATE_TERMINAL_PROCEDURE = `/${SessionTabsService.typeName}/${SessionTabsService.method.createTerminal.name}`
const LIST_PROCEDURE = `/${SessionTabsService.typeName}/${SessionTabsService.method.list.name}`
const LIST_ALL_PROCEDURE = `/${SessionTabsService.typeName}/${SessionTabsService.method.listAll.name}`
const MOVE_PROCEDURE = `/${SessionTabsService.typeName}/${SessionTabsService.method.move.name}`
const SET_TAB_PROPS_PROCEDURE = `/${SessionTabsService.typeName}/${SessionTabsService.method.setTabProps.name}`
const UPDATE_PANE_LAYOUT_PROCEDURE = `/${SessionTabsService.typeName}/${SessionTabsService.method.updatePaneLayout.name}`
const SUBSCRIBE_PROCEDURE = `/${SessionTabsService.typeName}/${SessionTabsService.method.subscribe.name}`
const SUBSCRIBE_ALL_PROCEDURE = `/${SessionTabsService.typeName}/${SessionTabsService.method.subscribeAll.name}`
const UNSUBSCRIBE_PROCEDURE = `/${SessionTabsService.typeName}/${SessionTabsService.method.unsubscribe.name}`
const UNSUBSCRIBE_ALL_PROCEDURE = `/${SessionTabsService.typeName}/${SessionTabsService.method.unsubscribeAll.name}`

export class SessionTabsClient {
  private readonly transport: RuntimeTransport

  constructor(transport: RuntimeTransport) {
    this.transport = transport
  }

  async list(worktree: string, options?: RuntimeCallOptions): Promise<SessionTabsSnapshotValue> {
    const response = await this.transport.unary({
      method: LIST_PROCEDURE,
      payload: toBinary(
        SessionTabsServiceListRequestSchema,
        create(SessionTabsServiceListRequestSchema, { worktree })
      ),
      ...(options ? { options } : {})
    })
    return sessionTabsSnapshot(fromBinary(SessionTabsSnapshotSchema, response))
  }

  async listAll(options?: RuntimeCallOptions): Promise<SessionTabsSnapshotValue[]> {
    const response = await this.transport.unary({
      method: LIST_ALL_PROCEDURE,
      payload: toBinary(
        SessionTabsServiceListAllRequestSchema,
        create(SessionTabsServiceListAllRequestSchema)
      ),
      ...(options ? { options } : {})
    })
    return fromBinary(SessionTabsServiceListAllResponseSchema, response).snapshots.map(
      sessionTabsSnapshot
    )
  }

  async activate(
    input: { worktree: string; tabId: string; leafId?: string; notifyClients?: boolean },
    options?: RuntimeCallOptions
  ): Promise<SessionTabsSnapshotValue> {
    const response = await this.transport.unary({
      method: ACTIVATE_PROCEDURE,
      payload: toBinary(
        SessionTabsServiceActivateRequestSchema,
        create(SessionTabsServiceActivateRequestSchema, {
          worktree: input.worktree,
          tabId: input.tabId,
          ...(input.leafId === undefined ? {} : { leafId: input.leafId }),
          ...(input.notifyClients === undefined ? {} : { notifyClients: input.notifyClients })
        })
      ),
      ...(options ? { options } : {})
    })
    return sessionTabsSnapshot(fromBinary(SessionTabsSnapshotSchema, response))
  }

  async close(
    input: { worktree: string; tabId: string },
    options?: RuntimeCallOptions
  ): Promise<{ closed: boolean }> {
    const response = await this.transport.unary({
      method: CLOSE_PROCEDURE,
      payload: toBinary(
        SessionTabsServiceTabRequestSchema,
        create(SessionTabsServiceTabRequestSchema, input)
      ),
      ...(options ? { options } : {})
    })
    return { closed: fromBinary(SessionTabsServiceClosedResponseSchema, response).closed }
  }

  async createTerminal(
    input: SessionTabsCreateTerminalInput,
    options?: RuntimeCallOptions
  ): Promise<SessionTabsCreateTerminalResultValue> {
    const response = await this.transport.unary({
      method: CREATE_TERMINAL_PROCEDURE,
      payload: toBinary(
        SessionTabsServiceCreateTerminalRequestSchema,
        create(SessionTabsServiceCreateTerminalRequestSchema, createTerminalRequest(input))
      ),
      ...(options ? { options } : {})
    })
    const decoded = fromBinary(SessionTabsServiceCreateTerminalResponseSchema, response)
    if (!decoded.tab) {
      throw invalidResponse('Create-terminal response is missing its tab')
    }
    return {
      // Why: the daemon answers createTerminal with the created terminal tab
      // only, so narrowing the decoded tab union to its terminal member is
      // backed by the service contract.
      tab: sessionTabsTab(decoded.tab) as SessionTabsCreateTerminalResultValue['tab'],
      publicationEpoch: decoded.publicationEpoch,
      snapshotVersion: decoded.snapshotVersion
    }
  }

  async move(
    input: SessionTabsMoveInput,
    options?: RuntimeCallOptions
  ): Promise<{ moved: boolean }> {
    const response = await this.transport.unary({
      method: MOVE_PROCEDURE,
      payload: toBinary(
        SessionTabsServiceMoveRequestSchema,
        create(SessionTabsServiceMoveRequestSchema, moveRequest(input))
      ),
      ...(options ? { options } : {})
    })
    return { moved: fromBinary(SessionTabsServiceMovedResponseSchema, response).moved }
  }

  async setTabProps(
    input: SessionTabsSetTabPropsInput,
    options?: RuntimeCallOptions
  ): Promise<{ updated: boolean }> {
    const response = await this.transport.unary({
      method: SET_TAB_PROPS_PROCEDURE,
      payload: toBinary(
        SessionTabsServiceSetTabPropsRequestSchema,
        create(SessionTabsServiceSetTabPropsRequestSchema, {
          worktree: input.worktree,
          tabId: input.tabId,
          ...(input.color === undefined ? {} : { color: nullableColor(input.color) }),
          ...(input.isPinned === undefined ? {} : { isPinned: input.isPinned })
        })
      ),
      ...(options ? { options } : {})
    })
    return { updated: fromBinary(SessionTabsServiceUpdatedResponseSchema, response).updated }
  }

  async updatePaneLayout(
    input: SessionTabsUpdatePaneLayoutInput,
    options?: RuntimeCallOptions
  ): Promise<{ updated: boolean }> {
    const response = await this.transport.unary({
      method: UPDATE_PANE_LAYOUT_PROCEDURE,
      payload: toBinary(
        SessionTabsServiceUpdatePaneLayoutRequestSchema,
        create(SessionTabsServiceUpdatePaneLayoutRequestSchema, {
          worktree: input.worktree,
          tabId: input.tabId,
          root: paneLayoutRoot(input.root),
          expandedLeafId: nullableField(input.expandedLeafId),
          ...(input.titlesByLeafId ? { titlesByLeafId: input.titlesByLeafId } : {})
        })
      ),
      ...(options ? { options } : {})
    })
    return { updated: fromBinary(SessionTabsServiceUpdatedResponseSchema, response).updated }
  }

  async subscribe(worktree: string, options?: RuntimeCallOptions): Promise<SessionTabsEvents> {
    const stream = await this.transport.subscribe({
      method: SUBSCRIBE_PROCEDURE,
      payload: toBinary(
        SessionTabsServiceListRequestSchema,
        create(SessionTabsServiceListRequestSchema, { worktree })
      ),
      ...(options ? { options } : {})
    })
    return { events: streamEvents(stream), cancel: stream.cancel }
  }

  async subscribeAll(options?: RuntimeCallOptions): Promise<SessionTabsAllEvents> {
    const stream = await this.transport.subscribe({
      method: SUBSCRIBE_ALL_PROCEDURE,
      payload: toBinary(
        SessionTabsServiceListAllRequestSchema,
        create(SessionTabsServiceListAllRequestSchema)
      ),
      ...(options ? { options } : {})
    })
    return { events: allStreamEvents(stream), cancel: stream.cancel }
  }

  async unsubscribe(
    input: { worktree: string; subscriptionId?: string },
    options?: RuntimeCallOptions
  ): Promise<{ unsubscribed: boolean }> {
    const response = await this.transport.unary({
      method: UNSUBSCRIBE_PROCEDURE,
      payload: toBinary(
        SessionTabsServiceUnsubscribeRequestSchema,
        create(SessionTabsServiceUnsubscribeRequestSchema, {
          worktree: input.worktree,
          ...(input.subscriptionId === undefined ? {} : { subscriptionId: input.subscriptionId })
        })
      ),
      ...(options ? { options } : {})
    })
    return {
      unsubscribed: fromBinary(SessionTabsServiceUnsubscribedResponseSchema, response).unsubscribed
    }
  }

  async unsubscribeAll(
    input: { subscriptionId?: string },
    options?: RuntimeCallOptions
  ): Promise<{ unsubscribed: boolean }> {
    const response = await this.transport.unary({
      method: UNSUBSCRIBE_ALL_PROCEDURE,
      payload: toBinary(
        SessionTabsServiceUnsubscribeAllRequestSchema,
        create(
          SessionTabsServiceUnsubscribeAllRequestSchema,
          input.subscriptionId === undefined ? {} : { subscriptionId: input.subscriptionId }
        )
      ),
      ...(options ? { options } : {})
    })
    return {
      unsubscribed: fromBinary(SessionTabsServiceUnsubscribedResponseSchema, response).unsubscribed
    }
  }
}

function invalidResponse(message: string): RuntimeProtocolError {
  return new RuntimeProtocolError(StatusCode.DATA_LOSS, message)
}
