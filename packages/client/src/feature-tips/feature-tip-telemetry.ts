import type { EventProps } from '@agentstart/protocol/telemetry/events/catalog'
import { track } from '~renderer/telemetry/client'

export type AgentStartCliFeatureTipSource = EventProps<'agentstart_cli_feature_tip_shown'>['source']
export type AgentStartCliFeatureTipSetupResult =
  EventProps<'agentstart_cli_feature_tip_setup_result'>['result']
export type CommandPaletteFeatureTipSource =
  EventProps<'command_palette_feature_tip_shown'>['source']

export function getAgentStartCliFeatureTipTelemetrySource(
  value: unknown
): AgentStartCliFeatureTipSource {
  return value === 'app_open' ? 'app_open' : 'manual'
}

export function trackAgentStartCliFeatureTipShown(source: AgentStartCliFeatureTipSource): void {
  track('agentstart_cli_feature_tip_shown', { source })
}

export function trackAgentStartCliFeatureTipSetupClicked(
  source: AgentStartCliFeatureTipSource
): void {
  track('agentstart_cli_feature_tip_setup_clicked', { source })
}

export function trackAgentStartCliFeatureTipSetupResult(
  source: AgentStartCliFeatureTipSource,
  result: AgentStartCliFeatureTipSetupResult
): void {
  track('agentstart_cli_feature_tip_setup_result', { source, result })
}

export function trackCommandPaletteFeatureTipShown(source: CommandPaletteFeatureTipSource): void {
  track('command_palette_feature_tip_shown', { source })
}

export function trackCommandPaletteFeatureTipAcknowledged(
  source: CommandPaletteFeatureTipSource
): void {
  track('command_palette_feature_tip_acknowledged', { source })
}
