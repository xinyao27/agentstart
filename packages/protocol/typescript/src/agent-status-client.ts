import { create, fromBinary, toBinary } from '@bufbuild/protobuf'

import {
  AgentInterruptIntent,
  AgentStatusService,
  AgentStatusServiceDropByTabPrefixRequestSchema,
  AgentStatusServiceDropByTabPrefixResponseSchema,
  AgentStatusServiceDropRequestSchema,
  AgentStatusServiceDropResponseSchema,
  AgentStatusServiceGetMigrationUnsupportedSnapshotRequestSchema,
  AgentStatusServiceGetMigrationUnsupportedSnapshotResponseSchema,
  AgentStatusServiceGetSnapshotRequestSchema,
  AgentStatusServiceGetSnapshotResponseSchema,
  AgentStatusServiceInferInterruptRequestSchema,
  AgentStatusServiceInferInterruptResponseSchema,
  AgentStatusServiceRetirePaneAuthorityRequestSchema,
  AgentStatusServiceRetirePaneAuthorityResponseSchema,
  AgentStatusServiceSubscribeRequestSchema,
  AgentStatusServiceSubscribeResponseSchema,
  AgentStatusServiceTransferPaneAuthorityRequestSchema,
  AgentStatusServiceTransferPaneAuthorityResponseSchema
} from '../generated/yiru/runtime/v1/agent_status_pb.js'
import {
  agentStatusEntry,
  invalidAgentStatusResponse,
  migrationUnsupportedEntry,
  type AgentStatusSnapshotEntryValue,
  type AgentStatusStreamEventValue,
  type MigrationUnsupportedPtyEntryValue
} from './agent-status-values.js'
import type { RuntimeCallOptions, RuntimeStream, RuntimeTransport } from './transport.js'

const SUBSCRIBE_PROCEDURE = `/${AgentStatusService.typeName}/${AgentStatusService.method.subscribe.name}`
const GET_SNAPSHOT_PROCEDURE = `/${AgentStatusService.typeName}/${AgentStatusService.method.getSnapshot.name}`
const GET_MIGRATION_UNSUPPORTED_SNAPSHOT_PROCEDURE = `/${AgentStatusService.typeName}/${AgentStatusService.method.getMigrationUnsupportedSnapshot.name}`
const INFER_INTERRUPT_PROCEDURE = `/${AgentStatusService.typeName}/${AgentStatusService.method.inferInterrupt.name}`
const DROP_PROCEDURE = `/${AgentStatusService.typeName}/${AgentStatusService.method.drop.name}`
const DROP_BY_TAB_PREFIX_PROCEDURE = `/${AgentStatusService.typeName}/${AgentStatusService.method.dropByTabPrefix.name}`
const RETIRE_PANE_AUTHORITY_PROCEDURE = `/${AgentStatusService.typeName}/${AgentStatusService.method.retirePaneAuthority.name}`
const TRANSFER_PANE_AUTHORITY_PROCEDURE = `/${AgentStatusService.typeName}/${AgentStatusService.method.transferPaneAuthority.name}`

export type AgentStatusInterruptInput = {
  paneKey: string
  baselineUpdatedAt: number
  baselineStateStartedAt: number
  baselinePrompt: string
  baselineAgentType?: string
  intent: 'plain-escape' | 'ctrl-c'
  inputCount?: number
}

export type AgentStatusTransferPaneAuthorityInput = {
  fromPaneKey: string
  toPaneKey: string
  ptyId?: string
}

export type AgentStatusEvents = Readonly<{
  events: AsyncIterable<AgentStatusStreamEventValue>
  cancel: (reason?: string) => Promise<void>
}>

export class AgentStatusClient {
  private readonly transport: RuntimeTransport

  constructor(transport: RuntimeTransport) {
    this.transport = transport
  }

  async getSnapshot(options?: RuntimeCallOptions): Promise<AgentStatusSnapshotEntryValue[]> {
    const response = await this.transport.unary({
      method: GET_SNAPSHOT_PROCEDURE,
      payload: toBinary(
        AgentStatusServiceGetSnapshotRequestSchema,
        create(AgentStatusServiceGetSnapshotRequestSchema)
      ),
      ...(options ? { options } : {})
    })
    return fromBinary(AgentStatusServiceGetSnapshotResponseSchema, response).statuses.map(
      agentStatusEntry
    )
  }

  async getMigrationUnsupportedSnapshot(
    options?: RuntimeCallOptions
  ): Promise<MigrationUnsupportedPtyEntryValue[]> {
    const response = await this.transport.unary({
      method: GET_MIGRATION_UNSUPPORTED_SNAPSHOT_PROCEDURE,
      payload: toBinary(
        AgentStatusServiceGetMigrationUnsupportedSnapshotRequestSchema,
        create(AgentStatusServiceGetMigrationUnsupportedSnapshotRequestSchema)
      ),
      ...(options ? { options } : {})
    })
    return fromBinary(
      AgentStatusServiceGetMigrationUnsupportedSnapshotResponseSchema,
      response
    ).migrationUnsupportedPtys.map(migrationUnsupportedEntry)
  }

  async inferInterrupt(
    input: AgentStatusInterruptInput,
    options?: RuntimeCallOptions
  ): Promise<boolean> {
    const response = await this.transport.unary({
      method: INFER_INTERRUPT_PROCEDURE,
      payload: toBinary(
        AgentStatusServiceInferInterruptRequestSchema,
        create(AgentStatusServiceInferInterruptRequestSchema, {
          paneKey: input.paneKey,
          baselineUpdatedAt: input.baselineUpdatedAt,
          baselineStateStartedAt: input.baselineStateStartedAt,
          baselinePrompt: input.baselinePrompt,
          ...(input.baselineAgentType === undefined
            ? {}
            : { baselineAgentType: input.baselineAgentType }),
          intent:
            input.intent === 'ctrl-c'
              ? AgentInterruptIntent.CTRL_C
              : AgentInterruptIntent.PLAIN_ESCAPE,
          ...(input.inputCount === undefined ? {} : { inputCount: input.inputCount })
        })
      ),
      ...(options ? { options } : {})
    })
    return fromBinary(AgentStatusServiceInferInterruptResponseSchema, response).inferred
  }

  async drop(paneKey: string, options?: RuntimeCallOptions): Promise<void> {
    // Why: these mutation responses are empty, but each must still decode so a
    // server-side failure surfaces instead of reading as success.
    const response = await this.transport.unary({
      method: DROP_PROCEDURE,
      payload: toBinary(
        AgentStatusServiceDropRequestSchema,
        create(AgentStatusServiceDropRequestSchema, { paneKey })
      ),
      ...(options ? { options } : {})
    })
    fromBinary(AgentStatusServiceDropResponseSchema, response)
  }

  async dropByTabPrefix(tabId: string, options?: RuntimeCallOptions): Promise<void> {
    const response = await this.transport.unary({
      method: DROP_BY_TAB_PREFIX_PROCEDURE,
      payload: toBinary(
        AgentStatusServiceDropByTabPrefixRequestSchema,
        create(AgentStatusServiceDropByTabPrefixRequestSchema, { tabId })
      ),
      ...(options ? { options } : {})
    })
    fromBinary(AgentStatusServiceDropByTabPrefixResponseSchema, response)
  }

  async retirePaneAuthority(paneKey: string, options?: RuntimeCallOptions): Promise<void> {
    const response = await this.transport.unary({
      method: RETIRE_PANE_AUTHORITY_PROCEDURE,
      payload: toBinary(
        AgentStatusServiceRetirePaneAuthorityRequestSchema,
        create(AgentStatusServiceRetirePaneAuthorityRequestSchema, { paneKey })
      ),
      ...(options ? { options } : {})
    })
    fromBinary(AgentStatusServiceRetirePaneAuthorityResponseSchema, response)
  }

  async transferPaneAuthority(
    input: AgentStatusTransferPaneAuthorityInput,
    options?: RuntimeCallOptions
  ): Promise<void> {
    const response = await this.transport.unary({
      method: TRANSFER_PANE_AUTHORITY_PROCEDURE,
      payload: toBinary(
        AgentStatusServiceTransferPaneAuthorityRequestSchema,
        create(AgentStatusServiceTransferPaneAuthorityRequestSchema, {
          fromPaneKey: input.fromPaneKey,
          toPaneKey: input.toPaneKey,
          ...(input.ptyId === undefined ? {} : { ptyId: input.ptyId })
        })
      ),
      ...(options ? { options } : {})
    })
    fromBinary(AgentStatusServiceTransferPaneAuthorityResponseSchema, response)
  }

  async subscribe(options?: RuntimeCallOptions): Promise<AgentStatusEvents> {
    const stream = await this.transport.subscribe({
      method: SUBSCRIBE_PROCEDURE,
      payload: toBinary(
        AgentStatusServiceSubscribeRequestSchema,
        create(AgentStatusServiceSubscribeRequestSchema)
      ),
      ...(options ? { options } : {})
    })
    return { events: streamEvents(stream), cancel: stream.cancel }
  }
}

async function* streamEvents(stream: RuntimeStream): AsyncIterable<AgentStatusStreamEventValue> {
  for await (const payload of stream.events) {
    const message = fromBinary(AgentStatusServiceSubscribeResponseSchema, payload).event
    switch (message.case) {
      case 'ready': {
        const snapshot = message.value.snapshot
        if (!snapshot) {
          throw invalidAgentStatusResponse('Agent-status ready event is missing its snapshot')
        }
        yield {
          type: 'ready',
          subscriptionId: message.value.subscriptionId,
          snapshot: {
            statuses: snapshot.statuses.map(agentStatusEntry),
            migrationUnsupportedPtys:
              snapshot.migrationUnsupportedPtys.map(migrationUnsupportedEntry)
          }
        }
        break
      }
      case 'set':
        yield { type: 'set', status: agentStatusEntry(message.value) }
        break
      case 'clear':
        yield { type: 'clear', paneKey: message.value.paneKey }
        break
      case 'migrationUnsupported':
        yield { type: 'migrationUnsupported', entry: migrationUnsupportedEntry(message.value) }
        break
      case 'migrationUnsupportedClear':
        yield { type: 'migrationUnsupportedClear', ptyId: message.value.ptyId }
        break
      case undefined:
        break
    }
  }
}
