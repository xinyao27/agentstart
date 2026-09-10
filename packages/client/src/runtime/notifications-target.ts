import { NOTIFICATIONS_PROTOCOL_CAPABILITY, NotificationsClient } from '@agentstart/protocol'

import { openRuntimeProtocolTarget } from './protocol-target'
import type { RuntimeClientTarget } from './runtime-target'
import { readRuntimeStatus } from './status-client'

async function openNotificationsTarget(
  target: RuntimeClientTarget
): Promise<NotificationsClient | null> {
  const status = await readRuntimeStatus(target)
  if (!status.capabilities?.includes(NOTIFICATIONS_PROTOCOL_CAPABILITY)) {
    return null
  }
  return new NotificationsClient(await openRuntimeProtocolTarget(target))
}

export async function requireNotificationsTarget(
  target: RuntimeClientTarget
): Promise<NotificationsClient> {
  const client = await openNotificationsTarget(target)
  if (!client) {
    throw new Error('notifications.protobuf.v1 capability is not available on this runtime host')
  }
  return client
}
