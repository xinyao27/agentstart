import { create, fromBinary, toBinary } from '@bufbuild/protobuf'

import {
  TerminalFitServiceGetDriversRequestSchema,
  TerminalFitServiceGetDriversResponseSchema,
  TerminalFitServiceGetOverridesRequestSchema,
  TerminalFitServiceGetOverridesResponseSchema,
  TerminalFitServiceRestoreRequestSchema,
  TerminalFitServiceRestoreResponseSchema,
  TerminalFitService
} from '../generated/yiru/runtime/v1/terminal_fit_pb.js'
import {
  terminalDriver,
  type TerminalDriver,
  terminalFitOverride,
  type TerminalFitOverride
} from './terminal-fit-values.js'
import type { RuntimeCallOptions, RuntimeTransport } from './transport.js'

const GET_DRIVERS_PROCEDURE = `/${TerminalFitService.typeName}/${TerminalFitService.method.getDrivers.name}`
const GET_OVERRIDES_PROCEDURE = `/${TerminalFitService.typeName}/${TerminalFitService.method.getOverrides.name}`
const RESTORE_PROCEDURE = `/${TerminalFitService.typeName}/${TerminalFitService.method.restore.name}`

export class TerminalFitClient {
  private readonly transport: RuntimeTransport

  constructor(transport: RuntimeTransport) {
    this.transport = transport
  }

  async getDrivers(options?: RuntimeCallOptions): Promise<TerminalDriver[]> {
    const response = await this.transport.unary({
      method: GET_DRIVERS_PROCEDURE,
      payload: toBinary(
        TerminalFitServiceGetDriversRequestSchema,
        create(TerminalFitServiceGetDriversRequestSchema)
      ),
      ...(options ? { options } : {})
    })
    return fromBinary(TerminalFitServiceGetDriversResponseSchema, response).drivers.map(
      terminalDriver
    )
  }

  async getOverrides(options?: RuntimeCallOptions): Promise<TerminalFitOverride[]> {
    const response = await this.transport.unary({
      method: GET_OVERRIDES_PROCEDURE,
      payload: toBinary(
        TerminalFitServiceGetOverridesRequestSchema,
        create(TerminalFitServiceGetOverridesRequestSchema)
      ),
      ...(options ? { options } : {})
    })
    return fromBinary(TerminalFitServiceGetOverridesResponseSchema, response).overrides.map(
      terminalFitOverride
    )
  }

  async restore(ptyId: string, options?: RuntimeCallOptions): Promise<boolean> {
    const response = await this.transport.unary({
      method: RESTORE_PROCEDURE,
      payload: toBinary(
        TerminalFitServiceRestoreRequestSchema,
        create(TerminalFitServiceRestoreRequestSchema, { ptyId })
      ),
      ...(options ? { options } : {})
    })
    return fromBinary(TerminalFitServiceRestoreResponseSchema, response).restored
  }
}
