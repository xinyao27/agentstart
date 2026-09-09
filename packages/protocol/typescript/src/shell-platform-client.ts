import { create, fromBinary, toBinary } from '@bufbuild/protobuf'

import {
  ShellPlatformService,
  ShellPlatformServiceExistsResponseSchema,
  ShellPlatformServiceOpenFileUriRequestSchema,
  ShellPlatformServiceOpenInExternalEditorRequestSchema,
  ShellPlatformServiceOpenPathRequestSchema,
  ShellPlatformServiceOpenedResponseSchema,
  ShellPlatformServiceOutcomeResponseSchema,
  ShellPlatformServicePathRequestSchema,
  ShellPlatformServicePickDirectoryRequestSchema,
  ShellPlatformServicePickRequestSchema,
  ShellPlatformServicePickedResponseSchema,
  ShellPlatformServiceUnitResponseSchema
} from '../generated/yiru/runtime/v1/shell_platform_pb.js'
import {
  shellPlatformOutcome,
  type ShellPlatformOpenExternalEditorInput,
  type ShellPlatformOutcomeValue,
  type ShellPlatformPickDirectoryInput
} from './shell-platform-values.js'
import type { RuntimeCallOptions, RuntimeTransport } from './transport.js'

const OPEN_PATH_PROCEDURE = `/${ShellPlatformService.typeName}/${ShellPlatformService.method.openPath.name}`
const OPEN_FILE_URI_PROCEDURE = `/${ShellPlatformService.typeName}/${ShellPlatformService.method.openFileUri.name}`
const OPEN_IN_EXTERNAL_EDITOR_PROCEDURE = `/${ShellPlatformService.typeName}/${ShellPlatformService.method.openInExternalEditor.name}`
const OPEN_IN_FILE_MANAGER_PROCEDURE = `/${ShellPlatformService.typeName}/${ShellPlatformService.method.openInFileManager.name}`
const OPEN_FILE_PATH_PROCEDURE = `/${ShellPlatformService.typeName}/${ShellPlatformService.method.openFilePath.name}`
const PATH_EXISTS_PROCEDURE = `/${ShellPlatformService.typeName}/${ShellPlatformService.method.pathExists.name}`
const PICK_ATTACHMENT_PROCEDURE = `/${ShellPlatformService.typeName}/${ShellPlatformService.method.pickAttachment.name}`
const PICK_IMAGE_PROCEDURE = `/${ShellPlatformService.typeName}/${ShellPlatformService.method.pickImage.name}`
const PICK_AUDIO_PROCEDURE = `/${ShellPlatformService.typeName}/${ShellPlatformService.method.pickAudio.name}`
const PICK_DIRECTORY_PROCEDURE = `/${ShellPlatformService.typeName}/${ShellPlatformService.method.pickDirectory.name}`

export class ShellPlatformClient {
  private readonly transport: RuntimeTransport

  constructor(transport: RuntimeTransport) {
    this.transport = transport
  }

  async openPath(path: string, options?: RuntimeCallOptions): Promise<void> {
    const payload = await this.transport.unary({
      method: OPEN_PATH_PROCEDURE,
      payload: toBinary(
        ShellPlatformServiceOpenPathRequestSchema,
        create(ShellPlatformServiceOpenPathRequestSchema, { path })
      ),
      ...(options ? { options } : {})
    })
    fromBinary(ShellPlatformServiceUnitResponseSchema, payload)
  }

  async openFileUri(uri: string, options?: RuntimeCallOptions): Promise<void> {
    const payload = await this.transport.unary({
      method: OPEN_FILE_URI_PROCEDURE,
      payload: toBinary(
        ShellPlatformServiceOpenFileUriRequestSchema,
        create(ShellPlatformServiceOpenFileUriRequestSchema, { uri })
      ),
      ...(options ? { options } : {})
    })
    fromBinary(ShellPlatformServiceUnitResponseSchema, payload)
  }

  async openInExternalEditor(
    input: ShellPlatformOpenExternalEditorInput,
    options?: RuntimeCallOptions
  ): Promise<ShellPlatformOutcomeValue> {
    const response = await this.transport.unary({
      method: OPEN_IN_EXTERNAL_EDITOR_PROCEDURE,
      payload: toBinary(
        ShellPlatformServiceOpenInExternalEditorRequestSchema,
        create(ShellPlatformServiceOpenInExternalEditorRequestSchema, {
          path: input.path,
          ...(input.command === undefined ? {} : { command: input.command }),
          ...(input.connectionId === undefined ? {} : { connectionId: input.connectionId })
        })
      ),
      ...(options ? { options } : {})
    })
    return shellPlatformOutcome(fromBinary(ShellPlatformServiceOutcomeResponseSchema, response))
  }

  async openInFileManager(
    path: string,
    options?: RuntimeCallOptions
  ): Promise<ShellPlatformOutcomeValue> {
    const response = await this.transport.unary({
      method: OPEN_IN_FILE_MANAGER_PROCEDURE,
      payload: toBinary(
        ShellPlatformServicePathRequestSchema,
        create(ShellPlatformServicePathRequestSchema, { path })
      ),
      ...(options ? { options } : {})
    })
    return shellPlatformOutcome(fromBinary(ShellPlatformServiceOutcomeResponseSchema, response))
  }

  async openFilePath(path: string, options?: RuntimeCallOptions): Promise<boolean> {
    const response = await this.transport.unary({
      method: OPEN_FILE_PATH_PROCEDURE,
      payload: toBinary(
        ShellPlatformServicePathRequestSchema,
        create(ShellPlatformServicePathRequestSchema, { path })
      ),
      ...(options ? { options } : {})
    })
    return fromBinary(ShellPlatformServiceOpenedResponseSchema, response).opened
  }

  async pathExists(path: string, options?: RuntimeCallOptions): Promise<boolean> {
    const response = await this.transport.unary({
      method: PATH_EXISTS_PROCEDURE,
      payload: toBinary(
        ShellPlatformServicePathRequestSchema,
        create(ShellPlatformServicePathRequestSchema, { path })
      ),
      ...(options ? { options } : {})
    })
    return fromBinary(ShellPlatformServiceExistsResponseSchema, response).exists
  }

  async pickAttachment(options?: RuntimeCallOptions): Promise<string | null> {
    return this.pick(PICK_ATTACHMENT_PROCEDURE, options)
  }

  async pickImage(options?: RuntimeCallOptions): Promise<string | null> {
    return this.pick(PICK_IMAGE_PROCEDURE, options)
  }

  async pickAudio(options?: RuntimeCallOptions): Promise<string | null> {
    return this.pick(PICK_AUDIO_PROCEDURE, options)
  }

  async pickDirectory(
    input: ShellPlatformPickDirectoryInput,
    options?: RuntimeCallOptions
  ): Promise<string | null> {
    const response = await this.transport.unary({
      method: PICK_DIRECTORY_PROCEDURE,
      payload: toBinary(
        ShellPlatformServicePickDirectoryRequestSchema,
        create(
          ShellPlatformServicePickDirectoryRequestSchema,
          input.defaultPath === undefined ? {} : { defaultPath: input.defaultPath }
        )
      ),
      ...(options ? { options } : {})
    })
    return pickedPath(response)
  }

  private async pick(procedure: string, options?: RuntimeCallOptions): Promise<string | null> {
    const response = await this.transport.unary({
      method: procedure,
      payload: toBinary(
        ShellPlatformServicePickRequestSchema,
        create(ShellPlatformServicePickRequestSchema)
      ),
      ...(options ? { options } : {})
    })
    return pickedPath(response)
  }
}

function pickedPath(payload: Uint8Array): string | null {
  const response = fromBinary(ShellPlatformServicePickedResponseSchema, payload)
  // Why: an absent path is the user cancelling the native picker, so it stays
  // distinguishable from an empty selection.
  return response.path ?? null
}
