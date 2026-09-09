import { create, fromBinary, toBinary } from '@bufbuild/protobuf'

import {
  WindowsFirewallServiceGetStatusRequestSchema,
  WindowsFirewallServiceGetStatusResponseSchema,
  WindowsFirewallServiceOpenNetworkSettingsRequestSchema,
  WindowsFirewallServiceOpenNetworkSettingsResponseSchema,
  WindowsFirewallServiceRepairRequestSchema,
  WindowsFirewallServiceRepairResponseSchema,
  WindowsFirewallService
} from '../generated/yiru/runtime/v1/windows_firewall_pb.js'
import type { RuntimeCallOptions, RuntimeTransport } from './transport.js'
import {
  windowsFirewallRepairResult,
  type WindowsMobileFirewallRepairResult,
  windowsFirewallStatus,
  type WindowsMobileFirewallStatus
} from './windows-firewall-values.js'

const GET_STATUS_PROCEDURE = `/${WindowsFirewallService.typeName}/${WindowsFirewallService.method.getStatus.name}`
const REPAIR_PROCEDURE = `/${WindowsFirewallService.typeName}/${WindowsFirewallService.method.repair.name}`
const OPEN_NETWORK_SETTINGS_PROCEDURE = `/${WindowsFirewallService.typeName}/${WindowsFirewallService.method.openNetworkSettings.name}`

export class WindowsFirewallClient {
  private readonly transport: RuntimeTransport

  constructor(transport: RuntimeTransport) {
    this.transport = transport
  }

  async getStatus(
    input: { address?: string } = {},
    options?: RuntimeCallOptions
  ): Promise<WindowsMobileFirewallStatus> {
    const response = await this.transport.unary({
      method: GET_STATUS_PROCEDURE,
      payload: toBinary(
        WindowsFirewallServiceGetStatusRequestSchema,
        create(
          WindowsFirewallServiceGetStatusRequestSchema,
          input.address ? { address: input.address } : {}
        )
      ),
      ...(options ? { options } : {})
    })
    return windowsFirewallStatus(
      fromBinary(WindowsFirewallServiceGetStatusResponseSchema, response).status
    )
  }

  async repair(options?: RuntimeCallOptions): Promise<WindowsMobileFirewallRepairResult> {
    const response = await this.transport.unary({
      method: REPAIR_PROCEDURE,
      payload: toBinary(
        WindowsFirewallServiceRepairRequestSchema,
        create(WindowsFirewallServiceRepairRequestSchema)
      ),
      ...(options ? { options } : {})
    })
    return windowsFirewallRepairResult(
      fromBinary(WindowsFirewallServiceRepairResponseSchema, response)
    )
  }

  async openNetworkSettings(options?: RuntimeCallOptions): Promise<boolean> {
    const response = await this.transport.unary({
      method: OPEN_NETWORK_SETTINGS_PROCEDURE,
      payload: toBinary(
        WindowsFirewallServiceOpenNetworkSettingsRequestSchema,
        create(WindowsFirewallServiceOpenNetworkSettingsRequestSchema)
      ),
      ...(options ? { options } : {})
    })
    return fromBinary(WindowsFirewallServiceOpenNetworkSettingsResponseSchema, response).opened
  }
}
