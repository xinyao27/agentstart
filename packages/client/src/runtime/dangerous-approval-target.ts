import {
  DANGEROUS_APPROVAL_PROTOCOL_CAPABILITY,
  DangerousApprovalClient,
  type DangerousApprovalStatusValue
} from '@agentstart/protocol'
import { translate } from '~renderer/i18n/i18n'

import {
  openConfiguredBrowserHostProtocol,
  readConfiguredBrowserHostStatus
} from './browser-host-runtime'

export const DANGEROUS_APPROVAL_STATUS_QUERY_KEY = [
  'extension',
  'dangerous-approval',
  'status'
] as const

async function openDangerousApprovalTarget(): Promise<DangerousApprovalClient | null> {
  const status = await readConfiguredBrowserHostStatus()
  if (!status.capabilities?.includes(DANGEROUS_APPROVAL_PROTOCOL_CAPABILITY)) {
    return null
  }
  return new DangerousApprovalClient(await openConfiguredBrowserHostProtocol())
}

// Why: the dangerous-approval namespace is protobuf-only, so a missing
// capability means the connected daemon predates the cutover — an error, not a
// legacy retry.
export async function requireDangerousApprovalClient(): Promise<DangerousApprovalClient> {
  const client = await openDangerousApprovalTarget()
  if (!client) {
    throw new Error(
      translate(
        'runtime.dangerousApprovalTarget.unavailable',
        'Passkey approval needs a current AgentStart daemon connection.'
      )
    )
  }
  return client
}

export async function readDangerousApprovalStatus(): Promise<DangerousApprovalStatusValue> {
  return (await requireDangerousApprovalClient()).status()
}
