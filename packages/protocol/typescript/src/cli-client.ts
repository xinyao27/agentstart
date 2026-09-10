import { create, fromBinary, toBinary } from '@bufbuild/protobuf'

import {
  CliService,
  CliServiceGetInstallStatusRequestSchema,
  CliServiceGetInstallStatusResponseSchema,
  CliServiceInstallRequestSchema,
  CliServiceInstallResponseSchema,
  CliServiceRemoveRequestSchema,
  CliServiceRemoveResponseSchema,
  GetWslInstallStatusRequestSchema,
  GetWslInstallStatusResponseSchema,
  InstallWslRequestSchema,
  InstallWslResponseSchema,
  RemoveWslRequestSchema,
  RemoveWslResponseSchema
} from '../generated/agent_start/runtime/v1/cli_pb.js'
import { cliInstallStatus, localCliInstallStatus, type CliInstallStatus } from './cli-values.js'
import type { RuntimeCallOptions, RuntimeTransport } from './transport.js'

const GET_STATUS_PROCEDURE = `/${CliService.typeName}/${CliService.method.getInstallStatus.name}`
const INSTALL_PROCEDURE = `/${CliService.typeName}/${CliService.method.install.name}`
const REMOVE_PROCEDURE = `/${CliService.typeName}/${CliService.method.remove.name}`
const GET_WSL_STATUS_PROCEDURE = `/${CliService.typeName}/${CliService.method.getWslInstallStatus.name}`
const INSTALL_WSL_PROCEDURE = `/${CliService.typeName}/${CliService.method.installWsl.name}`
const REMOVE_WSL_PROCEDURE = `/${CliService.typeName}/${CliService.method.removeWsl.name}`

export type CliWslInput = {
  distro?: string | null
}

export class CliClient {
  private readonly transport: RuntimeTransport

  constructor(transport: RuntimeTransport) {
    this.transport = transport
  }

  async getInstallStatus(options?: RuntimeCallOptions): Promise<CliInstallStatus> {
    const response = await this.transport.unary({
      method: GET_STATUS_PROCEDURE,
      payload: toBinary(
        CliServiceGetInstallStatusRequestSchema,
        create(CliServiceGetInstallStatusRequestSchema, {})
      ),
      ...(options ? { options } : {})
    })
    return localCliInstallStatus(
      fromBinary(CliServiceGetInstallStatusResponseSchema, response).status
    )
  }

  async install(options?: RuntimeCallOptions): Promise<CliInstallStatus> {
    const response = await this.transport.unary({
      method: INSTALL_PROCEDURE,
      payload: toBinary(CliServiceInstallRequestSchema, create(CliServiceInstallRequestSchema, {})),
      ...(options ? { options } : {})
    })
    return localCliInstallStatus(fromBinary(CliServiceInstallResponseSchema, response).status)
  }

  async remove(options?: RuntimeCallOptions): Promise<CliInstallStatus> {
    const response = await this.transport.unary({
      method: REMOVE_PROCEDURE,
      payload: toBinary(CliServiceRemoveRequestSchema, create(CliServiceRemoveRequestSchema, {})),
      ...(options ? { options } : {})
    })
    return localCliInstallStatus(fromBinary(CliServiceRemoveResponseSchema, response).status)
  }

  async getWslInstallStatus(
    input: CliWslInput = {},
    options?: RuntimeCallOptions
  ): Promise<CliInstallStatus> {
    const response = await this.transport.unary({
      method: GET_WSL_STATUS_PROCEDURE,
      payload: toBinary(
        GetWslInstallStatusRequestSchema,
        create(GetWslInstallStatusRequestSchema, normalizedDistro(input))
      ),
      ...(options ? { options } : {})
    })
    return cliInstallStatus(fromBinary(GetWslInstallStatusResponseSchema, response).status)
  }

  async installWsl(
    input: CliWslInput = {},
    options?: RuntimeCallOptions
  ): Promise<CliInstallStatus> {
    const response = await this.transport.unary({
      method: INSTALL_WSL_PROCEDURE,
      payload: toBinary(
        InstallWslRequestSchema,
        create(InstallWslRequestSchema, normalizedDistro(input))
      ),
      ...(options ? { options } : {})
    })
    return cliInstallStatus(fromBinary(InstallWslResponseSchema, response).status)
  }

  async removeWsl(
    input: CliWslInput = {},
    options?: RuntimeCallOptions
  ): Promise<CliInstallStatus> {
    const response = await this.transport.unary({
      method: REMOVE_WSL_PROCEDURE,
      payload: toBinary(
        RemoveWslRequestSchema,
        create(RemoveWslRequestSchema, normalizedDistro(input))
      ),
      ...(options ? { options } : {})
    })
    return cliInstallStatus(fromBinary(RemoveWslResponseSchema, response).status)
  }
}

function normalizedDistro(input: CliWslInput): { distro: string } | Record<string, never> {
  const distro = input.distro?.trim()
  return distro ? { distro } : {}
}
