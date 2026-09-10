import { useState } from 'react'
import { ORCHESTRATION_SKILL_NAME } from '~renderer/agent/feature-install-commands'
import { translate } from '~renderer/i18n/i18n'
import {
  GitMerge,
  ListChecks,
  ArrowsLeftRight as ArrowRightLeft,
  FlowArrow as Workflow
} from '~renderer/icons/hugeicons'
import { readCliInstallStatus, readWslCliInstallStatus } from '~renderer/runtime/cli-install-client'
import {
  AGENT_SKILL_CLI_PREREQUISITE_NOTICE,
  ensureAgentStartCliAvailableForAgentSkillTerminal
} from '~renderer/skills/agent-cli-prerequisite'
import {
  ORCHESTRATION_SKILL_INSTALL_COMMAND,
  ORCHESTRATION_SKILL_UPDATE_COMMAND
} from '~renderer/skills/orchestration-install-command'
import { useActiveProjectSkillRuntime } from '~renderer/skills/use-active-project-runtime'
import {
  GLOBAL_AGENT_SKILL_SOURCE_KINDS,
  useInstalledAgentSkill
} from '~renderer/skills/use-installed-agents'
import { useAppStore } from '~renderer/store/state'
import { Button } from '~renderer/ui/button'

import { AgentSkillSetupPanel } from '../agent/skill-setup-panel'
import {
  buildSkillCommandForRuntime,
  ensureWslCliAvailableForAgentSkillTerminal,
  getWslCliDistroRequest
} from '../cli-skill-runtime-setup'
import { matchesSettingsSearch } from '../search'
import { SearchableSetting } from '../searchable-setting'
import { OrchestrationExampleDialog } from './examples-dialog'
import { getOrchestrationPaneSearchEntries } from './search'
import { OrchestrationSkillAgentCoverage } from './skill-agent-coverage'
import { OrchestrationSkillPromptDialog } from './skill-prompt-dialog'
import { getOrchestrationUsageExamples } from './usage-examples'

const EXAMPLE_ICONS = {
  handoff: ArrowRightLeft,
  'worktree-handoff': ArrowRightLeft,
  'child-sequence': ListChecks,
  'child-parallel': GitMerge,
  'child-worktrees': Workflow
} as const

export function OrchestrationPane(): React.JSX.Element {
  const searchQuery = useAppStore((s) => s.settingsSearchQuery)
  const showOrchestration = matchesSettingsSearch(searchQuery, getOrchestrationPaneSearchEntries())
  const [selectedExampleId, setSelectedExampleId] = useState<string | null>(null)
  const [skillPromptOpen, setSkillPromptOpen] = useState(false)
  const activeSkillRuntime = useActiveProjectSkillRuntime()
  const orchestrationInstallCommand = !activeSkillRuntime.installDisabledReason
    ? buildSkillCommandForRuntime(
        ORCHESTRATION_SKILL_INSTALL_COMMAND,
        activeSkillRuntime.agentRuntime
      )
    : ORCHESTRATION_SKILL_INSTALL_COMMAND
  const orchestrationUpdateCommand = !activeSkillRuntime.installDisabledReason
    ? buildSkillCommandForRuntime(
        ORCHESTRATION_SKILL_UPDATE_COMMAND,
        activeSkillRuntime.agentRuntime
      )
    : ORCHESTRATION_SKILL_UPDATE_COMMAND

  const {
    installed: orchestrationSkillDetected,
    loading: orchestrationSkillLoading,
    error: orchestrationSkillError,
    skills: discoveredSkills,
    refresh: refreshOrchestrationSkill
  } = useInstalledAgentSkill(ORCHESTRATION_SKILL_NAME, {
    discoveryTarget: activeSkillRuntime.discoveryTarget,
    sourceKinds: GLOBAL_AGENT_SKILL_SOURCE_KINDS
  })

  if (!showOrchestration) {
    return <div />
  }

  return (
    <SearchableSetting
      title={translate(
        'auto.components.settings.OrchestrationPane.191ac34567',
        'Agent Orchestration'
      )}
      description={translate(
        'auto.components.settings.OrchestrationPane.2aacdb0517',
        'Coordinate coding agents across handoffs, worktree handovers, and child-agent work.'
      )}
      keywords={getOrchestrationPaneSearchEntries()[0].keywords}
      className="space-y-5 py-2"
    >
      <AgentSkillSetupPanel
        title={translate(
          'auto.components.settings.OrchestrationPane.07641b9768',
          'Orchestration skill'
        )}
        description={translate(
          'auto.components.settings.OrchestrationPane.9bedd2a6e5',
          'Enables agents to hand off context and coordinate work through AgentStart.'
        )}
        command={orchestrationInstallCommand}
        installedCommand={orchestrationUpdateCommand}
        terminalTitle="Orchestration setup"
        terminalAriaLabel="Orchestration skill install terminal"
        terminalWorktreeId="settings-orchestration-skill-terminal"
        terminalShellOverride={activeSkillRuntime.terminalShellOverride}
        installed={orchestrationSkillDetected}
        loading={orchestrationSkillLoading}
        error={activeSkillRuntime.installDisabledReason ?? orchestrationSkillError}
        installDisabled={Boolean(activeSkillRuntime.installDisabledReason)}
        icon={<Workflow className="size-5" />}
        preInstallNotice={AGENT_SKILL_CLI_PREREQUISITE_NOTICE}
        getPrerequisiteStatus={() =>
          activeSkillRuntime.agentRuntime?.runtime === 'wsl'
            ? readWslCliInstallStatus(getWslCliDistroRequest(activeSkillRuntime.agentRuntime))
            : readCliInstallStatus()
        }
        onBeforeOpenTerminal={async () => {
          useAppStore.getState().recordFeatureInteraction('agent-orchestration-setup')
          await (activeSkillRuntime.agentRuntime?.runtime === 'wsl'
            ? ensureWslCliAvailableForAgentSkillTerminal(activeSkillRuntime.agentRuntime)
            : ensureAgentStartCliAvailableForAgentSkillTerminal())
        }}
        actionHint={
          // Installed updates stay on the primary panel so there is only one update path.
          activeSkillRuntime.installDisabledReason || orchestrationSkillDetected ? null : (
            <p className="text-muted-foreground text-[12px] leading-snug">
              {translate(
                'auto.components.settings.OrchestrationPane.832f1f3ee6',
                'Prefer your own terminal?'
              )}{' '}
              <Button
                variant="ghost"
                size="xs"
                type="button"
                className="text-foreground focus-visible:bg-accent h-auto border-0 p-0 underline-offset-2 hover:underline"
                onClick={() => {
                  setSkillPromptOpen(true)
                }}
              >
                {translate(
                  'auto.components.settings.OrchestrationPane.7bc082f4de',
                  'Copy install command'
                )}
              </Button>
            </p>
          )
        }
        footer={
          <OrchestrationSkillAgentCoverage
            embedded
            skills={discoveredSkills}
            loading={orchestrationSkillLoading}
          />
        }
        onRecheck={refreshOrchestrationSkill}
      />

      <OrchestrationSkillPromptDialog
        command={orchestrationInstallCommand}
        open={skillPromptOpen}
        onOpenChange={setSkillPromptOpen}
      />

      <div className="border-border/60 space-y-4 border-t pt-6">
        <div className="space-y-3">
          <h3 className="text-foreground text-sm font-medium">
            {translate('auto.components.settings.OrchestrationPane.ae79504732', 'How to use it')}
          </h3>
          <p className="text-muted-foreground text-xs">
            {translate(
              'auto.components.settings.OrchestrationPane.52e0634e2c',
              'Ask a coordinator agent to use orchestration for handoffs, worktree handovers, and sequential or parallel child agents.'
            )}
          </p>
        </div>

        <div className="grid gap-2 sm:grid-cols-2">
          {getOrchestrationUsageExamples().map((example) => {
            const Icon = EXAMPLE_ICONS[example.id as keyof typeof EXAMPLE_ICONS] ?? Workflow
            return (
              <Button
                variant="outline"
                size="default"
                key={example.id}
                type="button"
                className="border-border/60 bg-muted/20 hover:bg-muted/35 focus-visible:bg-muted/35 h-auto justify-start gap-0 py-3 text-left font-normal whitespace-normal transition-colors"
                onClick={() => setSelectedExampleId(example.id)}
              >
                <div className="flex items-start gap-3">
                  <div className="border-border bg-background text-muted-foreground mt-0.5 flex size-8 shrink-0 items-center justify-center rounded-md border">
                    <Icon className="size-4" />
                  </div>
                  <div className="min-w-0 space-y-1">
                    <p className="text-foreground text-sm font-medium">{example.title}</p>
                    <p className="text-muted-foreground text-xs leading-relaxed">
                      {example.summary}
                    </p>
                  </div>
                </div>
              </Button>
            )
          })}
        </div>
      </div>

      {getOrchestrationUsageExamples().map((example) => {
        const Icon = EXAMPLE_ICONS[example.id as keyof typeof EXAMPLE_ICONS] ?? Workflow
        return (
          <OrchestrationExampleDialog
            key={`${example.id}-dialog`}
            example={example}
            icon={Icon}
            open={selectedExampleId === example.id}
            onOpenChange={(open) => setSelectedExampleId(open ? example.id : null)}
          />
        )
      })}
    </SearchableSetting>
  )
}
