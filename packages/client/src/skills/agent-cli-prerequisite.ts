import type { CliInstallStatus } from '@yiru/protocol/cli-values'
import { toast } from 'sonner'
import { translate } from '~renderer/i18n/i18n'
import { installCliCommand, readCliInstallStatus } from '~renderer/runtime/cli-install-client'

type EnsureYiruCliAvailableOptions = {
  onStatusChange?: (status: CliInstallStatus) => void
  registrationPromptDelayMs?: number
}

export const AGENT_SKILL_CLI_PREREQUISITE_NOTICE =
  'Before opening setup, Yiru may show a system prompt to register the Yiru CLI command on PATH.'

export const CLI_PREREQUISITE_REGISTRATION_TOAST = 'Yiru needs to register its CLI on PATH.'
export const CLI_PREREQUISITE_REGISTRATION_TOAST_DESCRIPTION =
  'Approve the system prompt so skill setup can use the Yiru CLI command.'

export function isYiruCliAvailableOnPath(status: CliInstallStatus | null | undefined): boolean {
  return status?.state === 'installed' && status.pathConfigured
}

export async function ensureYiruCliAvailableForAgentSkillTerminal({
  onStatusChange,
  registrationPromptDelayMs = 700
}: EnsureYiruCliAvailableOptions = {}): Promise<CliInstallStatus | null> {
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
      await showYiruCliRegistrationPromptToast(registrationPromptDelayMs)
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
            'Failed to register the Yiru CLI in PATH.'
          )
    )
    return null
  }
}

export async function showYiruCliRegistrationPromptToast(delayMs = 700): Promise<void> {
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
        'Yiru CLI registration is unavailable'
      ),
      {
        description:
          status.detail ??
          translate(
            'auto.lib.agent.skill.cli.prerequisite.15cbedc3e3',
            'Install the Yiru CLI before running agent skill setup.'
          )
      }
    )
    return
  }

  if (status.state !== 'installed') {
    toast.warning(
      translate(
        'auto.lib.agent.skill.cli.prerequisite.e99d7dc36f',
        'Yiru CLI registration needs attention'
      ),
      {
        description:
          status.detail ??
          translate(
            'auto.lib.agent.skill.cli.prerequisite.15cbedc3e3',
            'Install the Yiru CLI before running agent skill setup.'
          )
      }
    )
    return
  }

  if (!status.pathConfigured) {
    // Why: the skill installer opens a real shell; agents only get the expected
    // Yiru affordances when that shell can resolve the Yiru CLI command.
    toast.warning(
      translate(
        'auto.lib.agent.skill.cli.prerequisite.79371593b0',
        'Yiru CLI is not visible on PATH yet'
      ),
      {
        description:
          status.detail ??
          translate(
            'auto.lib.agent.skill.cli.prerequisite.0f116999f1',
            'Restart your shell or add the Yiru CLI directory to PATH before setup.'
          )
      }
    )
  }
}
