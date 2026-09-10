import { create, fromBinary, toBinary } from '@bufbuild/protobuf'

import {
  MobilePairingService,
  MobilePairingServiceGetPairingQrRequestSchema,
  MobilePairingServiceGetPairingQrResponseSchema,
  MobilePairingServiceListDevicesRequestSchema,
  MobilePairingServiceListDevicesResponseSchema,
  MobilePairingServiceListNetworkInterfacesRequestSchema,
  MobilePairingServiceListNetworkInterfacesResponseSchema,
  MobilePairingServiceRevokeDeviceRequestSchema,
  MobilePairingServiceRevokeDeviceResponseSchema
} from '../generated/agent_start/runtime/v1/mobile_pairing_pb.js'
import type { RuntimeCallOptions, RuntimeTransport } from './transport.js'

const GET_PAIRING_QR_PROCEDURE = `/${MobilePairingService.typeName}/${MobilePairingService.method.getPairingQr.name}`
const LIST_DEVICES_PROCEDURE = `/${MobilePairingService.typeName}/${MobilePairingService.method.listDevices.name}`
const LIST_NETWORK_INTERFACES_PROCEDURE = `/${MobilePairingService.typeName}/${MobilePairingService.method.listNetworkInterfaces.name}`
const REVOKE_DEVICE_PROCEDURE = `/${MobilePairingService.typeName}/${MobilePairingService.method.revokeDevice.name}`

export type MobileNetworkInterfaceValue = Readonly<{ address: string; name: string }>
export type MobilePairingQrValue =
  | Readonly<{ available: false }>
  | Readonly<{
      available: true
      deviceId: string
      endpoint: string
      pairingUrl: string
      qrDataUrl: string
    }>
export type MobilePairedDeviceValue = Readonly<{
  deviceId: string
  lastSeenAt: number
  name: string
  pairedAt: number
}>

export class MobilePairingClient {
  private readonly transport: RuntimeTransport

  constructor(transport: RuntimeTransport) {
    this.transport = transport
  }

  async listNetworkInterfaces(
    options?: RuntimeCallOptions
  ): Promise<readonly MobileNetworkInterfaceValue[]> {
    const response = await this.transport.unary({
      method: LIST_NETWORK_INTERFACES_PROCEDURE,
      payload: toBinary(
        MobilePairingServiceListNetworkInterfacesRequestSchema,
        create(MobilePairingServiceListNetworkInterfacesRequestSchema)
      ),
      ...(options ? { options } : {})
    })
    return fromBinary(MobilePairingServiceListNetworkInterfacesResponseSchema, response).interfaces
  }

  async getPairingQr(
    input: Readonly<{ address?: string; rotate?: boolean }>,
    options?: RuntimeCallOptions
  ): Promise<MobilePairingQrValue> {
    const response = fromBinary(
      MobilePairingServiceGetPairingQrResponseSchema,
      await this.transport.unary({
        method: GET_PAIRING_QR_PROCEDURE,
        payload: toBinary(
          MobilePairingServiceGetPairingQrRequestSchema,
          create(MobilePairingServiceGetPairingQrRequestSchema, {
            address: input.address,
            rotate: input.rotate ?? false
          })
        ),
        ...(options ? { options } : {})
      })
    )
    if (!response.available) {
      return { available: false }
    }
    return {
      available: true,
      deviceId: required(response.deviceId, 'device_id'),
      endpoint: required(response.endpoint, 'endpoint'),
      pairingUrl: required(response.pairingUrl, 'pairing_url'),
      qrDataUrl: required(response.qrDataUrl, 'qr_data_url')
    }
  }

  async listDevices(options?: RuntimeCallOptions): Promise<readonly MobilePairedDeviceValue[]> {
    const response = await this.transport.unary({
      method: LIST_DEVICES_PROCEDURE,
      payload: toBinary(
        MobilePairingServiceListDevicesRequestSchema,
        create(MobilePairingServiceListDevicesRequestSchema)
      ),
      ...(options ? { options } : {})
    })
    return fromBinary(MobilePairingServiceListDevicesResponseSchema, response).devices.map(
      (device) => ({
        deviceId: required(device.deviceId, 'device_id'),
        lastSeenAt: safeTimestamp(device.lastSeenAtUnixMs, 'last_seen_at_unix_ms'),
        name: device.name,
        pairedAt: safeTimestamp(device.pairedAtUnixMs, 'paired_at_unix_ms')
      })
    )
  }

  async revokeDevice(deviceId: string, options?: RuntimeCallOptions): Promise<boolean> {
    const response = await this.transport.unary({
      method: REVOKE_DEVICE_PROCEDURE,
      payload: toBinary(
        MobilePairingServiceRevokeDeviceRequestSchema,
        create(MobilePairingServiceRevokeDeviceRequestSchema, { deviceId })
      ),
      ...(options ? { options } : {})
    })
    return fromBinary(MobilePairingServiceRevokeDeviceResponseSchema, response).revoked
  }
}

function required(value: string | undefined, field: string): string {
  if (!value) {
    throw new Error(`Mobile pairing response is missing ${field}.`)
  }
  return value
}

function safeTimestamp(value: bigint, field: string): number {
  const timestamp = Number(value)
  if (!Number.isSafeInteger(timestamp) || timestamp < 0) {
    throw new Error(`Mobile pairing ${field} is outside the valid integer range.`)
  }
  return timestamp
}
