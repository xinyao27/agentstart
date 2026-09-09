import type { DiscoveredSkill } from '@yiru/protocol'
import { AgentIcon } from '~renderer/agent/catalog'
import { useDetectedAgents } from '~renderer/agent/use-detected'
import { translate } from '~renderer/i18n/i18n'
import { cn } from '~renderer/ui/class-names'

import type { OrchestrationSkillAgentStatus } from './skill-coverage'
import { getOrchestrationSkillAgentStatuses } from './skill-coverage'

function getAgentCoverageSummary(props: {
  loading: boolean
  totalCount: number
  installedCount: number
  fullCoverage: boolean
  noCoverage: boolean
}): string {
  const { loading, totalCount, installedCount, fullCoverage, noCoverage } = props

  if (loading) {
    return 'Checking installed agents and skill paths…'
  }
  if (totalCount === 0) {
    return 'No agent CLIs detected on PATH. Install agents in Settings → Agents, then re-check.'
  }
  if (fullCoverage) {
    return `All ${totalCount} detected agents have the skill.`
  }
  if (noCoverage) {
    return 'Install the skill above, then re-check.'
  }
  return `${installedCount} of ${totalCount} detected agents have the skill.`
}

function AgentCoverageChip({
  status
}: {
  status: OrchestrationSkillAgentStatus
}): React.JSX.Element {
  return (
    <span
      className={cn(
        'inline-flex items-center gap-1.5 border px-2.5 py-1 text-xs',
        status.installed
          ? 'border-green-700/25 bg-green-700/10 text-foreground dark:border-green-300/25 dark:bg-green-300/10'
          : 'border-border/60 bg-muted/20 text-muted-foreground'
      )}
    >
      <AgentIcon agent={status.agent} size={12} />
      <span className="text-foreground font-medium">{status.label}</span>
      <span
        className={cn(
          'text-[10px] font-medium',
          status.installed ? 'text-green-700 dark:text-green-300' : 'text-muted-foreground'
        )}
      >
        {status.installed
          ? translate(
              'auto.components.settings.OrchestrationSkillAgentCoverage.1e8f8d8fae',
              'Ready'
            )
          : translate(
              'auto.components.settings.OrchestrationSkillAgentCoverage.ffe13e36fb',
              'Missing'
            )}
      </span>
    </span>
  )
}

export function OrchestrationSkillAgentCoverage(props: {
  skills: readonly DiscoveredSkill[]
  loading: boolean
  embedded?: boolean
  className?: string
}): React.JSX.Element {
  const { skills, loading: skillsLoading, embedded = false, className } = props
  const { detectedIds, isLoading: agentsLoading } = useDetectedAgents()
  const loading = skillsLoading || agentsLoading || detectedIds === null
  const agentStatuses = getOrchestrationSkillAgentStatuses(skills, detectedIds ?? [])
  const installedCount = agentStatuses.filter((status) => status.installed).length
  const totalCount = agentStatuses.length
  const fullCoverage = !loading && totalCount > 0 && installedCount === totalCount
  const noCoverage = !loading && totalCount > 0 && installedCount === 0
  const showAgentChips = !loading && totalCount > 0 && !fullCoverage
  const summary = getAgentCoverageSummary({
    loading,
    totalCount,
    installedCount,
    fullCoverage,
    noCoverage
  })

  return (
    <div
      className={cn(
        embedded ? 'space-y-2.5' : 'space-y-4 border-t border-border/60 pt-6',
        className
      )}
    >
      <div className="space-y-1">
        <h3 className="text-foreground text-sm font-medium">
          {translate(
            'auto.components.settings.OrchestrationSkillAgentCoverage.6dec5ce2d2',
            'Agent coverage'
          )}
        </h3>
        <p className="text-muted-foreground text-xs leading-relaxed">{summary}</p>
      </div>

      {showAgentChips ? (
        <div className="flex flex-wrap gap-1.5">
          {agentStatuses.map((status) => (
            <AgentCoverageChip key={status.agent} status={status} />
          ))}
        </div>
      ) : null}
    </div>
  )
}
