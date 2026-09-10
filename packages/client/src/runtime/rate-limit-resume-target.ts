import { RATE_LIMIT_RESUME_PROTOCOL_CAPABILITY, RateLimitResumeClient } from '@agentstart/protocol'

import {
  openConfiguredBrowserHostProtocol,
  readConfiguredBrowserHostStatus
} from './browser-host-runtime'

export async function openRateLimitResumeTarget(): Promise<RateLimitResumeClient | null> {
  const status = await readConfiguredBrowserHostStatus()
  if (!status.capabilities?.includes(RATE_LIMIT_RESUME_PROTOCOL_CAPABILITY)) {
    return null
  }
  return new RateLimitResumeClient(await openConfiguredBrowserHostProtocol())
}
