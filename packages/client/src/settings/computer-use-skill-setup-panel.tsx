import {
  COMPUTER_USE_SKILL_INSTALL_COMMAND,
  COMPUTER_USE_SKILL_NAME,
  COMPUTER_USE_SKILL_UPDATE_COMMAND
} from '~renderer/agent/feature-install-commands'
import { translate } from '~renderer/i18n/i18n'
import { Monitor as MonitorCog } from '~renderer/icons/hugeicons'
import { readCliInstallStatus, readWslCliInstallStatus } from '~renderer/runtime/cli-install-client'
import {
  AGENT_SKILL_CLI_PREREQUISITE_NOTICE,
  ensureAgentStartCliAvailableForAgentSkillTerminal
} from '~renderer/skills/agent-cli-prerequisite'
import { useActiveProjectSkillRuntime } from '~renderer/skills/use-active-project-runtime'
import {
  GLOBAL_AGENT_SKILL_SOURCE_KINDS,
  useInstalledAgentSkill
} from '~renderer/skills/use-installed-agents'
import { useAppStore } from '~renderer/store/state'

import { AgentSkillSetupPanel } from './agent/skill-setup-panel'
import {
  buildSkillCommandForRuntime,
  ensureWslCliAvailableForAgentSkillTerminal,
  getWslCliDistroRequest
} from './cli-skill-runtime-setup'

export function ComputerUseSkillSetupPanel(): React.JSX.Element {
  const activeSkillRuntime = useActiveProjectSkillRuntime()
  const installCommand = !activeSkillRuntime.installDisabledReason
    ? buildSkillCommandForRuntime(
        COMPUTER_USE_SKILL_INSTALL_COMMAND,
        activeSkillRuntime.agentRuntime
      )
    : COMPUTER_USE_SKILL_INSTALL_COMMAND
  const updateCommand = !activeSkillRuntime.installDisabledReason
    ? buildSkillCommandForRuntime(
        COMPUTER_USE_SKILL_UPDATE_COMMAND,
        activeSkillRuntime.agentRuntime
      )
    : COMPUTER_USE_SKILL_UPDATE_COMMAND
  const {
    installed: computerUseSkillDetected,
    loading: computerUseSkillLoading,
    error: computerUseSkillError,
    refresh: refreshComputerUseSkill
  } = useInstalledAgentSkill(COMPUTER_USE_SKILL_NAME, {
    discoveryTarget: activeSkillRuntime.discoveryTarget,
    sourceKinds: GLOBAL_AGENT_SKILL_SOURCE_KINDS
  })

  return (
    <AgentSkillSetupPanel
      title={translate('auto.components.settings.ComputerUsePane.93255aaf18', 'Computer Use skill')}
      description={translate(
        'auto.components.settings.ComputerUsePane.1735461723',
        'Enables agents to inspect and operate local desktop apps.'
      )}
      command={installCommand}
      installedCommand={updateCommand}
      terminalTitle="Computer Use setup"
      terminalAriaLabel="Computer Use skill install terminal"
      terminalWorktreeId="settings-computer-use-skill-terminal"
      terminalShellOverride={activeSkillRuntime.terminalShellOverride}
      installed={computerUseSkillDetected}
      loading={computerUseSkillLoading}
      error={activeSkillRuntime.installDisabledReason ?? computerUseSkillError}
      installDisabled={Boolean(activeSkillRuntime.installDisabledReason)}
      icon={<MonitorCog className="size-5" />}
      preInstallNotice={AGENT_SKILL_CLI_PREREQUISITE_NOTICE}
      getPrerequisiteStatus={() =>
        activeSkillRuntime.agentRuntime?.runtime === 'wsl'
          ? readWslCliInstallStatus(getWslCliDistroRequest(activeSkillRuntime.agentRuntime))
          : readCliInstallStatus()
      }
      onBeforeOpenTerminal={async () => {
        useAppStore.getState().recordFeatureInteraction('computer-use-setup')
        await (activeSkillRuntime.agentRuntime?.runtime === 'wsl'
          ? ensureWslCliAvailableForAgentSkillTerminal(activeSkillRuntime.agentRuntime)
          : ensureAgentStartCliAvailableForAgentSkillTerminal())
      }}
      onRecheck={refreshComputerUseSkill}
      freshnessSkillName={
        activeSkillRuntime.agentRuntime?.runtime === 'wsl' ? undefined : COMPUTER_USE_SKILL_NAME
      }
    />
  )
}
