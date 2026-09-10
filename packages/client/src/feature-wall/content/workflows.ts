import type { FeatureWallTileIdTelemetry } from '@agentstart/protocol/telemetry/events/foundations'
import type { FeatureWallWorkflowId } from '@agentstart/protocol/telemetry/feature-wall/types'
import { translate } from '~renderer/i18n/i18n'
import { createLocalizedCatalog } from '~renderer/i18n/localized-catalog'

export type FeatureWallWorkflow = {
  id: FeatureWallWorkflowId
  title: string
  lede: string
  telemetryTileId: FeatureWallTileIdTelemetry
}

export const getFeatureWallWorkflows = createLocalizedCatalog(
  (): readonly FeatureWallWorkflow[] => [
    {
      id: 'workspaces',
      title: translate('feature-wall.205b4561ed', 'Workspaces'),
      lede: translate(
        'feature-wall.45cdd75dbe',
        'AgentStart splits each task into an isolated workspace so agents can run in parallel.'
      ),
      telemetryTileId: 'tile-01'
    },
    {
      id: 'agents-orchestration',
      title: translate('feature-wall.64acf7e2a7', 'Agents'),
      lede: translate(
        'feature-wall.28c64edcfe',
        'Run several agents at once and track their progress across independent workspaces.'
      ),
      telemetryTileId: 'tile-04'
    },
    {
      id: 'workbench',
      title: translate('feature-wall.93ef7c6368', 'Workbench'),
      lede: translate(
        'feature-wall.7e39fdc7c6',
        'Bring your terminal setup into AgentStart, then split panes to keep servers, tests, logs, and agents running side by side.'
      ),
      telemetryTileId: 'tile-02'
    },
    {
      id: 'review',
      title: translate('feature-wall.33157d99ae', 'Code Review'),
      lede: translate(
        'feature-wall.3dfbfca0bb',
        'Review what changed, leave focused feedback, and send it back to the agent.'
      ),
      telemetryTileId: 'tile-08'
    }
  ]
)

export const DEFAULT_FEATURE_WALL_WORKFLOW_ID: FeatureWallWorkflowId = 'workspaces'
