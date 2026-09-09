import { create, fromBinary, toBinary } from '@bufbuild/protobuf'

import {
  ShellKeybindingsBindingListSchema,
  ShellKeybindingsService,
  ShellKeybindingsServiceEnsureFileRequestSchema,
  ShellKeybindingsServiceGetRequestSchema,
  ShellKeybindingsServiceOpenFileRequestSchema,
  ShellKeybindingsServiceReloadRequestSchema,
  ShellKeybindingsServiceRevealFileRequestSchema,
  ShellKeybindingsServiceSetActionRequestSchema,
  ShellKeybindingsSnapshotSchema
} from '../generated/yiru/runtime/v1/shell_keybindings_pb.js'
import {
  shellKeybindingsSnapshot,
  type ShellKeybindingsSnapshotValue
} from './shell-keybindings-values.js'
import type { RuntimeCallOptions, RuntimeTransport } from './transport.js'

const GET_PROCEDURE = `/${ShellKeybindingsService.typeName}/${ShellKeybindingsService.method.get.name}`
const ENSURE_FILE_PROCEDURE = `/${ShellKeybindingsService.typeName}/${ShellKeybindingsService.method.ensureFile.name}`
const RELOAD_PROCEDURE = `/${ShellKeybindingsService.typeName}/${ShellKeybindingsService.method.reload.name}`
const OPEN_FILE_PROCEDURE = `/${ShellKeybindingsService.typeName}/${ShellKeybindingsService.method.openFile.name}`
const REVEAL_FILE_PROCEDURE = `/${ShellKeybindingsService.typeName}/${ShellKeybindingsService.method.revealFile.name}`
const SET_ACTION_PROCEDURE = `/${ShellKeybindingsService.typeName}/${ShellKeybindingsService.method.setAction.name}`

export type ShellKeybindingsSetActionInput = {
  actionId: string
  bindings: string[] | null
}

export class ShellKeybindingsClient {
  private readonly transport: RuntimeTransport

  constructor(transport: RuntimeTransport) {
    this.transport = transport
  }

  async get(options?: RuntimeCallOptions): Promise<ShellKeybindingsSnapshotValue> {
    return this.unary(
      GET_PROCEDURE,
      toBinary(
        ShellKeybindingsServiceGetRequestSchema,
        create(ShellKeybindingsServiceGetRequestSchema)
      ),
      options
    )
  }

  async ensureFile(options?: RuntimeCallOptions): Promise<ShellKeybindingsSnapshotValue> {
    return this.unary(
      ENSURE_FILE_PROCEDURE,
      toBinary(
        ShellKeybindingsServiceEnsureFileRequestSchema,
        create(ShellKeybindingsServiceEnsureFileRequestSchema)
      ),
      options
    )
  }

  async reload(options?: RuntimeCallOptions): Promise<ShellKeybindingsSnapshotValue> {
    return this.unary(
      RELOAD_PROCEDURE,
      toBinary(
        ShellKeybindingsServiceReloadRequestSchema,
        create(ShellKeybindingsServiceReloadRequestSchema)
      ),
      options
    )
  }

  async openFile(options?: RuntimeCallOptions): Promise<ShellKeybindingsSnapshotValue> {
    return this.unary(
      OPEN_FILE_PROCEDURE,
      toBinary(
        ShellKeybindingsServiceOpenFileRequestSchema,
        create(ShellKeybindingsServiceOpenFileRequestSchema)
      ),
      options
    )
  }

  async revealFile(options?: RuntimeCallOptions): Promise<ShellKeybindingsSnapshotValue> {
    return this.unary(
      REVEAL_FILE_PROCEDURE,
      toBinary(
        ShellKeybindingsServiceRevealFileRequestSchema,
        create(ShellKeybindingsServiceRevealFileRequestSchema)
      ),
      options
    )
  }

  async setAction(
    input: ShellKeybindingsSetActionInput,
    options?: RuntimeCallOptions
  ): Promise<ShellKeybindingsSnapshotValue> {
    const request = create(ShellKeybindingsServiceSetActionRequestSchema, {
      actionId: input.actionId,
      // Why: the daemon distinguishes "clear the override" from "set an empty
      // list", so null and [] must encode to different oneof cases.
      bindings:
        input.bindings === null
          ? { case: 'clear', value: true }
          : {
              case: 'set',
              value: create(ShellKeybindingsBindingListSchema, { bindings: input.bindings })
            }
    })
    return this.unary(
      SET_ACTION_PROCEDURE,
      toBinary(ShellKeybindingsServiceSetActionRequestSchema, request),
      options
    )
  }

  private async unary(
    method: string,
    payload: Uint8Array,
    options?: RuntimeCallOptions
  ): Promise<ShellKeybindingsSnapshotValue> {
    const response = await this.transport.unary({
      method,
      payload,
      ...(options ? { options } : {})
    })
    return shellKeybindingsSnapshot(fromBinary(ShellKeybindingsSnapshotSchema, response))
  }
}
