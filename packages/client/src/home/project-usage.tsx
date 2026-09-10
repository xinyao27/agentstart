import type {
  ProjectUsageValue,
  ProviderUsageValue
} from '@agentstart/protocol/stats/usage-breakdown'
import { useState } from 'react'
import type { TokenValueMetric } from '~renderer/contribution-heatmap/metric'
import { translate } from '~renderer/i18n/i18n'
import { MagnifyingGlass as Search } from '~renderer/icons/hugeicons'
import { Card, CardContent, CardHeader } from '~renderer/ui/card'
import { cn } from '~renderer/ui/class-names'
import { Input } from '~renderer/ui/input'
import { ScrollArea } from '~renderer/ui/scroll-area'

import { ModelUsageChart } from './model-usage-chart'
import { providerClassName, providerLabel } from './provider-presentation'
import type { UsageValue } from './usage-value'

type UsageBreakdownsProps = {
  metric: TokenValueMetric
  usage: Pick<UsageValue, 'models' | 'projects'>
}

type ProjectUsageProps = {
  metric: TokenValueMetric
  projects: ProjectUsageValue[]
}

type ProviderShareProps = {
  metric: TokenValueMetric
  projectValue: number
  usage: ProviderUsageValue
}

export function UsageBreakdowns({ metric, usage }: UsageBreakdownsProps): React.JSX.Element {
  return (
    <>
      <ModelUsageChart metric={metric} models={usage.models} />
      <ProjectUsage metric={metric} projects={usage.projects} />
    </>
  )
}

function ProjectUsage({ metric, projects }: ProjectUsageProps): React.JSX.Element {
  const [query, setQuery] = useState('')
  const normalizedQuery = query.trim().toLocaleLowerCase()
  const visibleProjects = (() =>
    projects
      .filter((project) => project.label.toLocaleLowerCase().includes(normalizedQuery))
      .sort((left, right) => {
        const metricDifference = projectMetric(right, metric) - projectMetric(left, metric)
        return metricDifference === 0 ? right.tokens - left.tokens : metricDifference
      }))()
  const totalTokens = projects.reduce((sum, project) => sum + project.tokens, 0)
  const totalSessions = projects.reduce((sum, project) => sum + project.sessions, 0)
  const knownValueUsd = projects.reduce((sum, project) => sum + (project.valueUsd ?? 0), 0)
  const hasKnownValue = projects.some((project) => project.valueUsd !== null)

  return (
    <Card size="compact">
      <CardHeader className="flex flex-row flex-wrap items-start justify-between gap-4">
        <div>
          <h2 className="text-foreground text-sm font-semibold">
            {translate('auto.components.home.projectUsage.title', 'By project')}
          </h2>
          <p className="text-muted-foreground mt-1 text-xs">
            {metric === 'tokens'
              ? translate(
                  'auto.components.home.projectUsage.tokenSummary',
                  '{{tokens}} · {{projects}} projects · {{sessions}} sessions',
                  {
                    tokens: formatTokens(totalTokens),
                    projects: projects.length.toLocaleString(),
                    sessions: totalSessions.toLocaleString()
                  }
                )
              : translate(
                  'auto.components.home.projectUsage.valueSummary',
                  '{{value}} known API value · {{projects}} projects · {{tokens}}',
                  {
                    value: hasKnownValue ? formatCurrency(knownValueUsd) : '—',
                    projects: projects.length.toLocaleString(),
                    tokens: formatTokens(totalTokens)
                  }
                )}
          </p>
        </div>

        <label className="relative block w-full sm:w-72">
          <span className="sr-only">
            {translate('auto.components.home.projectUsage.filterLabel', 'Filter projects')}
          </span>
          <Search className="text-muted-foreground pointer-events-none absolute top-1/2 left-2 size-3.5 -translate-y-1/2" />
          <Input
            size="sm"
            className="pl-7"
            value={query}
            placeholder={translate(
              'auto.components.home.projectUsage.filterPlaceholder',
              'Filter projects'
            )}
            onChange={(event) => setQuery(event.target.value)}
          />
        </label>
      </CardHeader>

      <CardContent className="mt-4">
        {visibleProjects.length > 0 ? (
          <ScrollArea className="border-border border-y" viewportClassName="max-h-[34rem]">
            {visibleProjects.map((project) => (
              <ProjectUsageRow key={project.key} metric={metric} project={project} />
            ))}
          </ScrollArea>
        ) : (
          <div className="border-border text-muted-foreground border border-dashed px-4 py-8 text-center text-sm">
            {projects.length === 0
              ? translate(
                  'auto.components.home.projectUsage.empty',
                  'No project-attributed usage is available yet.'
                )
              : translate(
                  'auto.components.home.projectUsage.noResults',
                  'No projects match this filter.'
                )}
          </div>
        )}
        {metric === 'value' && projects.some((project) => project.valueUsd === null) ? (
          <p className="text-muted-foreground mt-3 text-xs">
            {translate(
              'auto.components.home.projectUsage.unpriced',
              'Projects containing usage without authoritative pricing show no combined API value.'
            )}
          </p>
        ) : null}
      </CardContent>
    </Card>
  )
}

function ProjectUsageRow({
  metric,
  project
}: {
  metric: TokenValueMetric
  project: ProjectUsageValue
}): React.JSX.Element {
  const value = metric === 'tokens' ? project.tokens : project.valueUsd
  const providerTotal = project.providers.reduce(
    (sum, usage) => sum + providerMetric(usage, metric),
    0
  )

  return (
    <section className="border-border border-b px-1 py-4 last:border-b-0">
      <div className="flex min-w-0 items-baseline justify-between gap-4">
        <h3 className="text-foreground truncate text-sm font-medium">{project.label}</h3>
        <span className="text-foreground shrink-0 text-sm font-semibold tabular-nums">
          {value === null ? '—' : formatMetric(value, metric)}
        </span>
      </div>
      <p className="text-muted-foreground mt-1 text-xs">
        {translate(
          'auto.components.home.projectUsage.projectDetail',
          '{{tokens}} · {{sessions}} sessions',
          {
            tokens: formatTokens(project.tokens),
            sessions: project.sessions.toLocaleString()
          }
        )}
      </p>

      <div className="mt-3 flex flex-wrap gap-x-4 gap-y-1">
        {project.providers.map((usage) => (
          <ProviderShare
            key={usage.provider}
            metric={metric}
            projectValue={providerTotal}
            usage={usage}
          />
        ))}
      </div>
    </section>
  )
}

function ProviderShare({ metric, projectValue, usage }: ProviderShareProps): React.JSX.Element {
  const value = metric === 'tokens' ? usage.tokens : usage.valueUsd
  const share = providerMetric(usage, metric)
  return (
    <span className="text-muted-foreground flex items-center gap-1.5 text-xs">
      <span className={cn('size-2 shrink-0', providerClassName(usage.provider))} />
      <span>{providerLabel(usage.provider)}</span>
      <span className="text-foreground tabular-nums">
        {value === null ? '—' : formatMetric(value, metric)}
      </span>
      {projectValue > 0 && share > 0 ? (
        <span className="tabular-nums">{formatPercent(share / projectValue)}</span>
      ) : null}
    </span>
  )
}

function projectMetric(project: ProjectUsageValue, metric: TokenValueMetric): number {
  return metric === 'tokens' ? project.tokens : (project.valueUsd ?? 0)
}

function providerMetric(usage: ProviderUsageValue, metric: TokenValueMetric): number {
  return metric === 'tokens' ? usage.tokens : (usage.valueUsd ?? 0)
}

function formatMetric(value: number, metric: TokenValueMetric): string {
  return metric === 'tokens' ? formatTokens(value) : formatCurrency(value)
}

function formatTokens(value: number): string {
  return Intl.NumberFormat(undefined, {
    notation: 'compact',
    maximumFractionDigits: 2
  }).format(value)
}

function formatCurrency(value: number): string {
  return Intl.NumberFormat(undefined, {
    style: 'currency',
    currency: 'USD',
    maximumFractionDigits: 2
  }).format(value)
}

function formatPercent(value: number): string {
  return Intl.NumberFormat(undefined, {
    style: 'percent',
    maximumFractionDigits: 1
  }).format(value)
}
