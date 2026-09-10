import type { JSX } from 'react'
import {
  AGENTSTART_CLI_SKILL_INSTALL_COMMAND,
  AGENTSTART_CLI_SKILL_UPDATE_COMMAND
} from '~renderer/agent/feature-install-commands'
import { BROWSER_USE_ENABLED_STORAGE_KEY } from '~renderer/browser/setup-state'
import { translate } from '~renderer/i18n/i18n'
import { readCliInstallStatus, readWslCliInstallStatus } from '~renderer/runtime/cli-install-client'
import {
  buildSkillCommandForRuntime,
  ensureWslCliAvailableForAgentSkillTerminal,
  getWslCliDistroRequest
} from '~renderer/settings/cli-skill-runtime-setup'
import {
  AGENT_SKILL_CLI_PREREQUISITE_NOTICE,
  ensureAgentStartCliAvailableForAgentSkillTerminal
} from '~renderer/skills/agent-cli-prerequisite'
import { useActiveProjectSkillRuntime } from '~renderer/skills/use-active-project-runtime'
import type { InstalledAgentSkillState } from '~renderer/skills/use-installed-agents'
import { useAppStore } from '~renderer/store/state'

import { AgentSkillSetupPanel } from '../settings/agent/skill-setup-panel'

export function BrowserUseSkillSetupCard(props: {
  compact?: boolean
  terminalHeightPx?: number
  skill: InstalledAgentSkillState
}): JSX.Element {
  const { compact, terminalHeightPx, skill } = props
  const activeSkillRuntime = useActiveProjectSkillRuntime()
  const installCommand = !activeSkillRuntime.installDisabledReason
    ? buildSkillCommandForRuntime(
        AGENTSTART_CLI_SKILL_INSTALL_COMMAND,
        activeSkillRuntime.agentRuntime
      )
    : AGENTSTART_CLI_SKILL_INSTALL_COMMAND
  const updateCommand = !activeSkillRuntime.installDisabledReason
    ? buildSkillCommandForRuntime(
        AGENTSTART_CLI_SKILL_UPDATE_COMMAND,
        activeSkillRuntime.agentRuntime
      )
    : AGENTSTART_CLI_SKILL_UPDATE_COMMAND

  const handleBeforeOpenTerminal = async (): Promise<void> => {
    useAppStore.getState().recordFeatureInteraction('agent-browser-setup')
    await (activeSkillRuntime.agentRuntime?.runtime === 'wsl'
      ? ensureWslCliAvailableForAgentSkillTerminal(activeSkillRuntime.agentRuntime)
      : ensureAgentStartCliAvailableForAgentSkillTerminal())
    localStorage.setItem(BROWSER_USE_ENABLED_STORAGE_KEY, '1')
  }

  const setupPanel = (
    <AgentSkillSetupPanel
      className={compact ? 'w-full max-w-[520px]' : undefined}
      title={translate(
        'auto.components.feature.wall.BrowserUseSkillSetupCard.d5bb1cd4ba',
        'Browser Use skill'
      )}
      description={translate(
        'auto.components.feature.wall.BrowserUseSkillSetupCard.cbc45022d4',
        "Enables agents to navigate and verify pages in AgentStart's browser."
      )}
      command={installCommand}
      installedCommand={updateCommand}
      terminalTitle="Browser Use setup"
      terminalAriaLabel="Browser Use skill install terminal"
      terminalWorktreeId="feature-wall-browser-use-skill-terminal"
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
      onBeforeOpenTerminal={handleBeforeOpenTerminal}
      showRecheckWhenInstalled={false}
      onRecheck={skill.refresh}
    />
  )

  if (compact) {
    return <div className="flex min-h-24 flex-1 items-center justify-center pt-3">{setupPanel}</div>
  }
  return <div className="flex">{setupPanel}</div>
}
