import type { JSX } from 'react'
import { ORCHESTRATION_SKILL_NAME } from '~renderer/agent/feature-install-commands'
import { translate } from '~renderer/i18n/i18n'
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
import type { InstalledAgentSkillState } from '~renderer/skills/use-installed-agents'
import { useAppStore } from '~renderer/store/state'

import { AgentSkillSetupPanel } from '../agent/skill-setup-panel'
import {
  buildSkillCommandForRuntime,
  ensureWslCliAvailableForAgentSkillTerminal,
  getWslCliDistroRequest
} from '../cli-skill-runtime-setup'

export function OrchestrationSetupCard(props: {
  compact?: boolean
  terminalHeightPx?: number
  skill: InstalledAgentSkillState
}): JSX.Element {
  const { compact, terminalHeightPx, skill } = props
  const activeSkillRuntime = useActiveProjectSkillRuntime()
  const installCommand = !activeSkillRuntime.installDisabledReason
    ? buildSkillCommandForRuntime(
        ORCHESTRATION_SKILL_INSTALL_COMMAND,
        activeSkillRuntime.agentRuntime
      )
    : ORCHESTRATION_SKILL_INSTALL_COMMAND
  const updateCommand = !activeSkillRuntime.installDisabledReason
    ? buildSkillCommandForRuntime(
        ORCHESTRATION_SKILL_UPDATE_COMMAND,
        activeSkillRuntime.agentRuntime
      )
    : ORCHESTRATION_SKILL_UPDATE_COMMAND

  const setupPanel = (
    <AgentSkillSetupPanel
      className={compact ? 'w-full max-w-[520px]' : undefined}
      title={translate(
        'auto.components.settings.OrchestrationSetupCard.2777ff0fdc',
        'Orchestration skill'
      )}
      description={translate(
        'auto.components.settings.OrchestrationSetupCard.e7d2a5146c',
        'Enables agents to hand off context and coordinate work through AgentStart.'
      )}
      command={installCommand}
      installedCommand={updateCommand}
      terminalTitle="Orchestration setup"
      terminalAriaLabel="Orchestration skill install terminal"
      terminalWorktreeId="feature-wall-orchestration-skill-terminal"
      terminalShellOverride={activeSkillRuntime.terminalShellOverride}
      installed={skill.installed}
      loading={skill.loading}
      error={activeSkillRuntime.installDisabledReason ?? skill.error}
      installDisabled={Boolean(activeSkillRuntime.installDisabledReason)}
      terminalHeightPx={terminalHeightPx}
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
      onRecheck={skill.refresh}
      freshnessSkillName={
        activeSkillRuntime.agentRuntime?.runtime === 'wsl' ? undefined : ORCHESTRATION_SKILL_NAME
      }
    />
  )

  if (compact) {
    return <div className="flex min-h-24 flex-1 items-center justify-center">{setupPanel}</div>
  }
  return <div className="flex">{setupPanel}</div>
}
