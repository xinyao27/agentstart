import {
  AppControlClient,
  DiagnosticsClient,
  LocalDownloadClient,
  NotificationsClient,
  StatsClient,
  StatusClient,
  type NotificationSoundLoadResult,
  type RuntimeTransport
} from '@agentstart/protocol'
import type { MemorySnapshot } from '@agentstart/protocol/diagnostics/memory-values'
import type { StatsSummaryInput } from '@agentstart/protocol/stats/client'
import type { StatsSummaryResult } from '@agentstart/protocol/stats/values'
import { mapProtocolMemorySnapshot } from '~renderer/runtime/memory-snapshot'
import { mapProtocolStatus } from '~renderer/runtime/status-mapping'
import type { RuntimeStatusResult } from '~renderer/runtime/status/model'
import { mapProtocolStatsSummary } from '~renderer/stats/protocol-summary'

import { recordRuntimeStartupDiagnostic, restartRuntimeApp } from './app-control'
import { remainingRuntimeConnectTimeout } from './connection-policy'

const NOTIFICATION_SOUND_PROTOCOL_CAPABILITY = 'notifications.customSound.protobuf.v1'

export class ExtensionRuntimeCalls {
  private readonly openTransport: (timeoutMs?: number) => Promise<RuntimeTransport>

  constructor(openTransport: (timeoutMs?: number) => Promise<RuntimeTransport>) {
    this.openTransport = openTransport
  }

  async getStatus(timeoutMs = 12_000): Promise<RuntimeStatusResult> {
    const deadline = performance.now() + timeoutMs
    const transport = await this.openTransport(timeoutMs)
    return mapProtocolStatus(
      await new StatusClient(transport).get({
        timeoutMs: remainingRuntimeConnectTimeout(deadline)
      })
    )
  }

  async restartApp(timeoutMs = 12_000): Promise<void> {
    const deadline = performance.now() + timeoutMs
    const transport = await this.openTransport(timeoutMs)
    await restartRuntimeApp({
      deadline,
      protocolClient: new AppControlClient(transport),
      remainingTimeout: remainingRuntimeConnectTimeout
    })
  }

  async recordStartupDiagnostic(
    event: string,
    details?: Record<string, unknown>,
    timeoutMs = 12_000
  ): Promise<void> {
    const deadline = performance.now() + timeoutMs
    const transport = await this.openTransport(timeoutMs)
    await recordRuntimeStartupDiagnostic({
      deadline,
      details,
      event,
      protocolClient: new AppControlClient(transport),
      remainingTimeout: remainingRuntimeConnectTimeout
    })
  }

  async getMemorySnapshot(timeoutMs = 12_000): Promise<MemorySnapshot> {
    const deadline = performance.now() + timeoutMs
    const transport = await this.openTransport(timeoutMs)
    return mapProtocolMemorySnapshot(
      await new DiagnosticsClient(transport).getMemorySnapshot({
        timeoutMs: remainingRuntimeConnectTimeout(deadline)
      })
    )
  }

  async loadNotificationSound(
    cachedAssetId?: string,
    timeoutMs = 12_000
  ): Promise<NotificationSoundLoadResult> {
    const deadline = performance.now() + timeoutMs
    const transport = await this.openTransport(timeoutMs)
    const status = await new StatusClient(transport).get({
      timeoutMs: remainingRuntimeConnectTimeout(deadline)
    })
    if (!status.capabilities.includes(NOTIFICATION_SOUND_PROTOCOL_CAPABILITY)) {
      return { state: 'unavailable', reason: 'read-failed' }
    }
    return new NotificationsClient(transport).loadCustomSound(cachedAssetId, {
      timeoutMs: remainingRuntimeConnectTimeout(deadline)
    })
  }

  async getLocalDownloadClient(timeoutMs = 12_000): Promise<LocalDownloadClient> {
    return new LocalDownloadClient(await this.openTransport(timeoutMs))
  }

  async getProtocolTransport(timeoutMs = 12_000): Promise<RuntimeTransport> {
    return this.openTransport(timeoutMs)
  }

  async getStatsSummary(input: StatsSummaryInput, timeoutMs = 12_000): Promise<StatsSummaryResult> {
    const deadline = performance.now() + timeoutMs
    const transport = await this.openTransport(timeoutMs)
    const summary = await new StatsClient(transport).getSummary(input, {
      timeoutMs: remainingRuntimeConnectTimeout(deadline)
    })
    return mapProtocolStatsSummary(summary, input.range)
  }
}
