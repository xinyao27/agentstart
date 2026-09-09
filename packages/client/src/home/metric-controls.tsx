import type { StatsUsageBoundedRange } from '@yiru/protocol/stats/range'
import type { TokenValueMetric } from '~renderer/contribution-heatmap/metric'
import { translate } from '~renderer/i18n/i18n'
import { ToggleGroup, ToggleGroupItem } from '~renderer/ui/toggle-group'

type MetricControlsProps = {
  metric: TokenValueMetric
  range: StatsUsageBoundedRange
  onMetricChange: (metric: TokenValueMetric) => void
  onRangeChange: (range: StatsUsageBoundedRange) => void
}

export function MetricControls({
  metric,
  range,
  onMetricChange,
  onRangeChange
}: MetricControlsProps): React.JSX.Element {
  return (
    <div className="flex flex-wrap items-center justify-end gap-3">
      <ToggleGroup
        variant="outline"
        size="sm"
        value={[metric]}
        aria-label={translate('auto.components.home.metricControls.metricLabel', 'Statistic')}
        onValueChange={(values) => {
          const nextMetric = values[0]
          if (nextMetric === 'tokens' || nextMetric === 'value') {
            onMetricChange(nextMetric)
          }
        }}
      >
        <ToggleGroupItem value="value">
          {translate('auto.components.home.page.apiValue', 'API value')}
        </ToggleGroupItem>
        <ToggleGroupItem value="tokens">
          {translate('auto.components.home.page.tokens', 'Tokens')}
        </ToggleGroupItem>
      </ToggleGroup>

      <ToggleGroup
        variant="outline"
        size="sm"
        value={[range]}
        aria-label={translate('auto.components.home.metricControls.rangeLabel', 'Usage range')}
        onValueChange={(values) => {
          const nextRange = values[0]
          if (nextRange === '7d' || nextRange === '30d' || nextRange === '90d') {
            onRangeChange(nextRange)
          }
        }}
      >
        <ToggleGroupItem value="7d">
          {translate('auto.components.home.metricControls.sevenDays', '7 days')}
        </ToggleGroupItem>
        <ToggleGroupItem value="30d">
          {translate('auto.components.home.metricControls.thirtyDays', '30 days')}
        </ToggleGroupItem>
        <ToggleGroupItem value="90d">
          {translate('auto.components.home.metricControls.ninetyDays', '90 days')}
        </ToggleGroupItem>
      </ToggleGroup>
    </div>
  )
}
