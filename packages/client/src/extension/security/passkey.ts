import { requireDangerousApprovalClient } from '~renderer/runtime/dangerous-approval-target'

import { getExtensionBrowserCapabilities } from '../browser-capabilities'

export async function enrollDangerousApproval(): Promise<void> {
  const client = await requireDangerousApprovalClient()
  const begin = await client.beginRegistration()
  const credential = await getExtensionBrowserCapabilities().createDangerousCredential(begin)
  await client.finishRegistration({
    ...credential,
    requestId: begin.requestId
  })
}

type DangerousApprovalOperation =
  | 'ritual.enable-archive'
  | 'security.manage-passkey'
  | `terminal.approve:${string}`

export async function confirmDangerousOperation(
  operation: DangerousApprovalOperation
): Promise<void> {
  const client = await requireDangerousApprovalClient()
  const status = await client.status()
  if (!status.configured || !status.credentialId) {
    return
  }
  const begin = await client.beginApproval(operation)
  const assertion = await getExtensionBrowserCapabilities().requestDangerousAssertion({
    challenge: begin.challenge,
    credentialId: status.credentialId
  })
  await client.finishApproval({
    ...assertion,
    operation,
    requestId: begin.requestId
  })
}

export async function removeDangerousApproval(): Promise<void> {
  await confirmDangerousOperation('security.manage-passkey')
  await (await requireDangerousApprovalClient()).remove()
}
