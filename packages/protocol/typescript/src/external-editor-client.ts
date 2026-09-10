import { create, fromBinary, toBinary } from '@bufbuild/protobuf'

import {
  ExternalEditorService,
  ExternalEditorServiceOpenRemoteSshRequestSchema,
  ExternalEditorServiceOpenRemoteSshResponseSchema,
  ExternalEditorUnsupportedReason
} from '../generated/agent_start/runtime/v1/external_editor_pb.js'
import type { RuntimeCallOptions, RuntimeTransport } from './transport.js'

export const EXTERNAL_EDITOR_PROTOCOL_CAPABILITY = 'externalEditor.protobuf.v1' as const

const OPEN_REMOTE_SSH_PROCEDURE = `/${ExternalEditorService.typeName}/${ExternalEditorService.method.openRemoteSsh.name}`

export type ExternalEditorOpenRemoteSshInput = Readonly<{
  path: string
  command?: string
  connectionId: string
}>

export type ExternalEditorOpenRemoteSshResult =
  | { ok: true }
  | { ok: false; reason: 'remote-runtime-unsupported' }

export class ExternalEditorClient {
  private readonly transport: RuntimeTransport

  constructor(transport: RuntimeTransport) {
    this.transport = transport
  }

  async openRemoteSsh(
    input: ExternalEditorOpenRemoteSshInput,
    options?: RuntimeCallOptions
  ): Promise<ExternalEditorOpenRemoteSshResult> {
    if (input.path.length === 0 || input.connectionId.length === 0) {
      throw new TypeError('External editor path and connection id must not be empty')
    }
    const response = await this.transport.unary({
      method: OPEN_REMOTE_SSH_PROCEDURE,
      payload: toBinary(
        ExternalEditorServiceOpenRemoteSshRequestSchema,
        create(ExternalEditorServiceOpenRemoteSshRequestSchema, {
          path: input.path,
          connectionId: input.connectionId,
          ...(input.command === undefined ? {} : { command: input.command })
        })
      ),
      ...(options ? { options } : {})
    })
    const decoded = fromBinary(ExternalEditorServiceOpenRemoteSshResponseSchema, response)
    if (decoded.ok) {
      return { ok: true }
    }
    // Why: the portable handler retired Remote-SSH launching and refuses every
    // contract-valid request with the structured unsupported reason.
    return { ok: false, reason: unsupportedReason(decoded.reason) }
  }
}

function unsupportedReason(reason: ExternalEditorUnsupportedReason): 'remote-runtime-unsupported' {
  switch (reason) {
    case ExternalEditorUnsupportedReason.REMOTE_RUNTIME:
      return 'remote-runtime-unsupported'
    case ExternalEditorUnsupportedReason.UNSPECIFIED:
      return 'remote-runtime-unsupported'
  }
}
