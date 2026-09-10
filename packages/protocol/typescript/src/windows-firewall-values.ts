import { StatusCode } from '../generated/agent_start/protocol/v1/errors_pb.js'
import {
  WindowsFirewallRepairFailureReason as ProtocolRepairFailureReason,
  WindowsNetworkCategory as ProtocolNetworkCategory,
  type WindowsFirewallServiceRepairResponse,
  type WindowsMobileFirewallStatus as ProtocolFirewallStatus
} from '../generated/agent_start/runtime/v1/windows_firewall_pb.js'
import { RuntimeProtocolError } from './error.js'

export const WINDOWS_FIREWALL_PROTOCOL_CAPABILITY = 'mobile.windowsFirewall.protobuf.v1' as const

export type WindowsNetworkCategory = 'private' | 'public' | 'domain' | 'unknown'

export type WindowsMobileFirewallStatus =
  | { supported: false }
  | {
      supported: true
      port: number
      ruleAllowed: boolean
      blockingRuleDetected: boolean
      privateFirewallEnabled: boolean
      networkCategory: WindowsNetworkCategory
      inspectionAvailable: boolean
    }

export type WindowsMobileFirewallRepairResult =
  | { ok: true }
  | { ok: false; reason: 'cancelled' | 'failed' | 'unsupported' }

export function windowsFirewallStatus(
  status: ProtocolFirewallStatus | undefined
): WindowsMobileFirewallStatus {
  if (!status) {
    throw invalidResponse('Windows firewall status is missing')
  }
  if (!status.supported) {
    return { supported: false }
  }
  const details = status.details
  if (!details || details.port < 1 || details.port > 65_535) {
    throw invalidResponse('Windows firewall status details are invalid')
  }
  return {
    supported: true,
    port: details.port,
    ruleAllowed: details.ruleAllowed,
    blockingRuleDetected: details.blockingRuleDetected,
    privateFirewallEnabled: details.privateFirewallEnabled,
    networkCategory: networkCategory(details.networkCategory),
    inspectionAvailable: details.inspectionAvailable
  }
}

export function windowsFirewallRepairResult(
  response: WindowsFirewallServiceRepairResponse
): WindowsMobileFirewallRepairResult {
  if (response.ok) {
    if (response.reason !== undefined) {
      throw invalidResponse('Successful Windows firewall repair includes a failure reason')
    }
    return { ok: true }
  }
  switch (response.reason) {
    case ProtocolRepairFailureReason.CANCELLED:
      return { ok: false, reason: 'cancelled' }
    case ProtocolRepairFailureReason.FAILED:
      return { ok: false, reason: 'failed' }
    case ProtocolRepairFailureReason.UNSUPPORTED:
      return { ok: false, reason: 'unsupported' }
    case ProtocolRepairFailureReason.UNSPECIFIED:
    case undefined:
      throw invalidResponse('Windows firewall repair failure reason is missing')
  }
  throw invalidResponse('Windows firewall repair failure reason is unknown')
}

function networkCategory(category: ProtocolNetworkCategory): WindowsNetworkCategory {
  switch (category) {
    case ProtocolNetworkCategory.PRIVATE:
      return 'private'
    case ProtocolNetworkCategory.PUBLIC:
      return 'public'
    case ProtocolNetworkCategory.DOMAIN:
      return 'domain'
    case ProtocolNetworkCategory.UNKNOWN:
      return 'unknown'
    case ProtocolNetworkCategory.UNSPECIFIED:
      throw invalidResponse('Windows network category is unspecified')
  }
  throw invalidResponse('Windows network category is unknown')
}

function invalidResponse(message: string): RuntimeProtocolError {
  return new RuntimeProtocolError(StatusCode.DATA_LOSS, message)
}
