import type { CliInstallStatus } from '@agentstart/protocol/cli-values'
import { toast } from 'sonner'
import { translate } from '~renderer/i18n/i18n'
import { installCliCommand, readCliInstallStatus } from '~renderer/runtime/cli-install-client'

type EnsureAgentStartCliAvailableOptions = {
  onStatusChange?: (status: CliInstallStatus) => void
  registrationPromptDelayMs?: number
}

export const AGENT_SKILL_CLI_PREREQUISITE_NOTICE =
  'Before opening setup, AgentStart may show a system prompt to register the AgentStart CLI command on PATH.'

const CLI_PREREQUISITE_REGISTRATION_TOAST = 'AgentStart needs to register its CLI on PATH.'
const CLI_PREREQUISITE_REGISTRATION_TOAST_DESCRIPTION =
  'Approve the system prompt so skill setup can use the AgentStart CLI command.'

export function isAgentStartCliAvailableOnPath(
  status: CliInstallStatus | null | undefined
): boolean {
  return status?.state === 'installed' && status.pathConfigured
}

export async function ensureAgentStartCliAvailableForAgentSkillTerminal({
  onStatusChange,
  registrationPromptDelayMs = 700
}: EnsureAgentStartCliAvailableOptions = {}): Promise<CliInstallStatus | null> {
  try {
    const status = await readCliInstallStatus()
    onStatusChange?.(status)

    if (!status.supported) {
      showCliPrerequisiteWarning(status)
      return status
    }

    if (status.state !== 'installed' || !status.pathConfigured) {
      // Why: macOS may immediately show a native authorization prompt, so the
      // user needs app-level context before that OS dialog appears.
      await showAgentStartCliRegistrationPromptToast(registrationPromptDelayMs)
      const next = await installCliCommand()
      onStatusChange?.(next)
      showCliPrerequisiteWarning(next)
      return next
    }

    return status
  } catch (error) {
    toast.error(
      error instanceof Error
        ? error.message
        : translate(
            'auto.lib.agent.skill.cli.prerequisite.8d6eedf97e',
            'Failed to register the AgentStart CLI in PATH.'
          )
    )
    return null
  }
}

export async function showAgentStartCliRegistrationPromptToast(delayMs = 700): Promise<void> {
  toast.message(CLI_PREREQUISITE_REGISTRATION_TOAST, {
    description: CLI_PREREQUISITE_REGISTRATION_TOAST_DESCRIPTION
  })
  await delay(delayMs)
}

function delay(ms: number): Promise<void> {
  if (ms <= 0) {
    return Promise.resolve()
  }
  return new Promise((resolve) => window.setTimeout(resolve, ms))
}

function showCliPrerequisiteWarning(status: CliInstallStatus): void {
  if (!status.supported) {
    toast.warning(
      translate(
        'auto.lib.agent.skill.cli.prerequisite.2db0bd7515',
        'AgentStart CLI registration is unavailable'
      ),
      {
        description:
          status.detail ??
          translate(
            'auto.lib.agent.skill.cli.prerequisite.15cbedc3e3',
            'Install the AgentStart CLI before running agent skill setup.'
          )
      }
    )
    return
  }

  if (status.state !== 'installed') {
    toast.warning(
      translate(
        'auto.lib.agent.skill.cli.prerequisite.e99d7dc36f',
        'AgentStart CLI registration needs attention'
      ),
      {
        description:
          status.detail ??
          translate(
            'auto.lib.agent.skill.cli.prerequisite.15cbedc3e3',
            'Install the AgentStart CLI before running agent skill setup.'
          )
      }
    )
    return
  }

  if (!status.pathConfigured) {
    // Why: the skill installer opens a real shell; agents only get the expected
    // AgentStart affordances when that shell can resolve the AgentStart CLI command.
    toast.warning(
      translate(
        'auto.lib.agent.skill.cli.prerequisite.79371593b0',
        'AgentStart CLI is not visible on PATH yet'
      ),
      {
        description:
          status.detail ??
          translate(
            'auto.lib.agent.skill.cli.prerequisite.0f116999f1',
            'Restart your shell or add the AgentStart CLI directory to PATH before setup.'
          )
      }
    )
  }
}
