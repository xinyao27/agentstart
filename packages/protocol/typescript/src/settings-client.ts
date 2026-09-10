import { create, fromBinary, toBinary } from '@bufbuild/protobuf'

import {
  SettingsService,
  SettingsServiceGetDocumentRequestSchema,
  SettingsServiceGetDocumentResponseSchema,
  SettingsServiceGetRequestSchema,
  SettingsServiceGetResponseSchema,
  SettingsServiceGetTerminalQuickCommandsRequestSchema,
  SettingsServiceListFontsRequestSchema,
  SettingsServiceListFontsResponseSchema,
  SettingsServicePreviewGhosttyImportRequestSchema,
  SettingsServicePreviewWarpThemeImportRequestSchema,
  SettingsServiceSetDocumentRequestSchema,
  SettingsServiceTerminalQuickCommandsResponseSchema,
  SettingsServiceUpdatePRBotAuthorOverrideRequestSchema,
  SettingsServiceUpdateRequestSchema,
  SettingsServiceUpdateTerminalQuickCommandsRequestSchema,
  SettingsAgentEnvSchema,
  SettingsAgentEnvListSchema,
  SettingsAuthorListSchema,
  SettingsGhosttyImportPreviewSchema,
  SettingsStringMapSchema,
  SettingsTuiAgentValueSchema,
  SettingsWarpThemeImportPreviewSchema,
  type SettingsServiceUpdateRequest
} from '../generated/agent_start/runtime/v1/settings_pb.js'
import {
  decodeSettingsDocument,
  encodeSettingsUpdates,
  type SettingsDocumentValue
} from './settings-document-values.js'
import { quickCommandMutation } from './settings-quick-command-values.js'
import {
  decodeGhosttyPreview,
  decodeQuickCommands,
  decodeSettingsSnapshot,
  decodeWarpPreview,
  warpImportKind,
  type GhosttyImportPreviewValue,
  type SettingsSnapshotValue,
  type SettingsUpdatePatch,
  type TerminalQuickCommand,
  type TerminalQuickCommandMutation,
  type WarpImportKindInput,
  type WarpThemeImportPreviewValue
} from './settings-values.js'
import type { RuntimeCallOptions, RuntimeTransport } from './transport.js'

const GET_PROCEDURE = `/${SettingsService.typeName}/${SettingsService.method.get.name}`
const GET_DOCUMENT_PROCEDURE = `/${SettingsService.typeName}/${SettingsService.method.getDocument.name}`
const SET_DOCUMENT_PROCEDURE = `/${SettingsService.typeName}/${SettingsService.method.setDocument.name}`
const UPDATE_PROCEDURE = `/${SettingsService.typeName}/${SettingsService.method.update.name}`
const GET_TERMINAL_QUICK_COMMANDS_PROCEDURE = `/${SettingsService.typeName}/${SettingsService.method.getTerminalQuickCommands.name}`
const UPDATE_TERMINAL_QUICK_COMMANDS_PROCEDURE = `/${SettingsService.typeName}/${SettingsService.method.updateTerminalQuickCommands.name}`
const UPDATE_PR_BOT_AUTHOR_OVERRIDE_PROCEDURE = `/${SettingsService.typeName}/${SettingsService.method.updatePRBotAuthorOverride.name}`
const LIST_FONTS_PROCEDURE = `/${SettingsService.typeName}/${SettingsService.method.listFonts.name}`
const PREVIEW_GHOSTTY_IMPORT_PROCEDURE = `/${SettingsService.typeName}/${SettingsService.method.previewGhosttyImport.name}`
const PREVIEW_WARP_THEME_IMPORT_PROCEDURE = `/${SettingsService.typeName}/${SettingsService.method.previewWarpThemeImport.name}`

export type UpdatePRBotAuthorOverrideInput = Readonly<{
  author: string
  isBot: boolean
}>

export class SettingsClient {
  private readonly transport: RuntimeTransport

  constructor(transport: RuntimeTransport) {
    this.transport = transport
  }

  async get(options?: RuntimeCallOptions): Promise<SettingsSnapshotValue> {
    const response = await this.transport.unary({
      method: GET_PROCEDURE,
      payload: toBinary(SettingsServiceGetRequestSchema, create(SettingsServiceGetRequestSchema)),
      ...(options ? { options } : {})
    })
    return decodeSettingsSnapshot(fromBinary(SettingsServiceGetResponseSchema, response).settings)
  }

  async getDocument(options?: RuntimeCallOptions): Promise<SettingsDocumentValue> {
    const response = await this.transport.unary({
      method: GET_DOCUMENT_PROCEDURE,
      payload: toBinary(
        SettingsServiceGetDocumentRequestSchema,
        create(SettingsServiceGetDocumentRequestSchema)
      ),
      ...(options ? { options } : {})
    })
    return decodeSettingsDocument(
      fromBinary(SettingsServiceGetDocumentResponseSchema, response).document
    )
  }

  async setDocument(
    updates: Record<string, unknown>,
    options?: RuntimeCallOptions
  ): Promise<SettingsDocumentValue> {
    const response = await this.transport.unary({
      method: SET_DOCUMENT_PROCEDURE,
      payload: toBinary(
        SettingsServiceSetDocumentRequestSchema,
        create(SettingsServiceSetDocumentRequestSchema, { updates: encodeSettingsUpdates(updates) })
      ),
      ...(options ? { options } : {})
    })
    return decodeSettingsDocument(
      fromBinary(SettingsServiceGetDocumentResponseSchema, response).document
    )
  }

  async update(
    patch: SettingsUpdatePatch,
    options?: RuntimeCallOptions
  ): Promise<SettingsSnapshotValue> {
    const response = await this.transport.unary({
      method: UPDATE_PROCEDURE,
      payload: toBinary(
        SettingsServiceUpdateRequestSchema,
        create(SettingsServiceUpdateRequestSchema, updateRequest(patch))
      ),
      ...(options ? { options } : {})
    })
    return decodeSettingsSnapshot(fromBinary(SettingsServiceGetResponseSchema, response).settings)
  }

  async getTerminalQuickCommands(options?: RuntimeCallOptions): Promise<TerminalQuickCommand[]> {
    const response = await this.transport.unary({
      method: GET_TERMINAL_QUICK_COMMANDS_PROCEDURE,
      payload: toBinary(
        SettingsServiceGetTerminalQuickCommandsRequestSchema,
        create(SettingsServiceGetTerminalQuickCommandsRequestSchema)
      ),
      ...(options ? { options } : {})
    })
    return decodeQuickCommands(
      fromBinary(SettingsServiceTerminalQuickCommandsResponseSchema, response).terminalQuickCommands
    )
  }

  async updateTerminalQuickCommands(
    mutation: TerminalQuickCommandMutation,
    options?: RuntimeCallOptions
  ): Promise<TerminalQuickCommand[]> {
    const response = await this.transport.unary({
      method: UPDATE_TERMINAL_QUICK_COMMANDS_PROCEDURE,
      payload: toBinary(
        SettingsServiceUpdateTerminalQuickCommandsRequestSchema,
        create(SettingsServiceUpdateTerminalQuickCommandsRequestSchema, {
          mutation: quickCommandMutation(mutation)
        })
      ),
      ...(options ? { options } : {})
    })
    return decodeQuickCommands(
      fromBinary(SettingsServiceTerminalQuickCommandsResponseSchema, response).terminalQuickCommands
    )
  }

  async updatePRBotAuthorOverride(
    input: UpdatePRBotAuthorOverrideInput,
    options?: RuntimeCallOptions
  ): Promise<SettingsSnapshotValue> {
    const response = await this.transport.unary({
      method: UPDATE_PR_BOT_AUTHOR_OVERRIDE_PROCEDURE,
      payload: toBinary(
        SettingsServiceUpdatePRBotAuthorOverrideRequestSchema,
        create(SettingsServiceUpdatePRBotAuthorOverrideRequestSchema, {
          author: input.author,
          isBot: input.isBot
        })
      ),
      ...(options ? { options } : {})
    })
    return decodeSettingsSnapshot(fromBinary(SettingsServiceGetResponseSchema, response).settings)
  }

  async listFonts(options?: RuntimeCallOptions): Promise<string[]> {
    const response = await this.transport.unary({
      method: LIST_FONTS_PROCEDURE,
      payload: toBinary(
        SettingsServiceListFontsRequestSchema,
        create(SettingsServiceListFontsRequestSchema)
      ),
      ...(options ? { options } : {})
    })
    return [...fromBinary(SettingsServiceListFontsResponseSchema, response).fonts]
  }

  async previewGhosttyImport(options?: RuntimeCallOptions): Promise<GhosttyImportPreviewValue> {
    const response = await this.transport.unary({
      method: PREVIEW_GHOSTTY_IMPORT_PROCEDURE,
      payload: toBinary(
        SettingsServicePreviewGhosttyImportRequestSchema,
        create(SettingsServicePreviewGhosttyImportRequestSchema)
      ),
      ...(options ? { options } : {})
    })
    return decodeGhosttyPreview(fromBinary(SettingsGhosttyImportPreviewSchema, response))
  }

  async previewWarpThemeImport(
    kind: WarpImportKindInput,
    options?: RuntimeCallOptions
  ): Promise<WarpThemeImportPreviewValue> {
    const response = await this.transport.unary({
      method: PREVIEW_WARP_THEME_IMPORT_PROCEDURE,
      payload: toBinary(
        SettingsServicePreviewWarpThemeImportRequestSchema,
        create(SettingsServicePreviewWarpThemeImportRequestSchema, {
          kind: warpImportKind(kind)
        })
      ),
      ...(options ? { options } : {})
    })
    return decodeWarpPreview(fromBinary(SettingsWarpThemeImportPreviewSchema, response))
  }
}

function updateRequest(patch: SettingsUpdatePatch): SettingsServiceUpdateRequest {
  return create(SettingsServiceUpdateRequestSchema, {
    ...(patch.defaultTuiAgent === undefined
      ? {}
      : {
          defaultTuiAgent: create(
            SettingsTuiAgentValueSchema,
            patch.defaultTuiAgent === null
              ? { value: { case: 'null', value: true } }
              : { value: { case: 'agent', value: patch.defaultTuiAgent } }
          )
        }),
    ...(patch.disabledTuiAgents ? { disabledTuiAgents: [...patch.disabledTuiAgents] } : {}),
    ...(patch.agentDefaultArgs
      ? { agentDefaultArgs: create(SettingsStringMapSchema, { values: patch.agentDefaultArgs }) }
      : {}),
    ...(patch.agentDefaultEnv
      ? {
          agentDefaultEnv: create(SettingsAgentEnvListSchema, {
            entries: Object.entries(patch.agentDefaultEnv).map(([agent, vars]) =>
              create(SettingsAgentEnvSchema, { agent, vars })
            )
          })
        }
      : {}),
    ...(patch.agentStatusHooksEnabled !== undefined
      ? { agentStatusHooksEnabled: patch.agentStatusHooksEnabled }
      : {}),
    // Why: proto presence, not truthiness, decides which fields the daemon
    // overwrites — an empty string is a value, not an omission.
    ...(patch.minimaxGroupId !== undefined ? { minimaxGroupId: patch.minimaxGroupId } : {}),
    ...(patch.minimaxUsageModels !== undefined
      ? { minimaxUsageModels: patch.minimaxUsageModels }
      : {}),
    ...(patch.prBotAuthorOverrides
      ? {
          prBotAuthorOverrides: create(SettingsAuthorListSchema, {
            authors: [...patch.prBotAuthorOverrides]
          })
        }
      : {})
  })
}
