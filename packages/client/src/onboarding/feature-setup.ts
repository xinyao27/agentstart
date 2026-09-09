import type {
  ComputerClient,
  ComputerPermissionSetupResult,
  ComputerPermissionStatusResult
} from '@yiru/protocol'
import type { CliInstallStatus } from '@yiru/protocol/cli-values'
import type { EventProps } from '@yiru/protocol/telemetry/events/catalog'
import {
  COMPUTER_USE_SKILL_NAME,
  YIRU_CLI_SKILL_NAME,
  YIRU_DEBUG_SKILL_NAME,
  ORCHESTRATION_SKILL_NAME,
  buildAgentFeatureSkillInstallCommand
} from '~renderer/agent/feature-install-commands'
import { BROWSER_USE_ENABLED_STORAGE_KEY } from '~renderer/browser/setup-state'
import { translate } from '~renderer/i18n/i18n'
import { installCliCommand, readCliInstallStatus } from '~renderer/runtime/cli-install-client'
import { openComputerTarget } from '~renderer/runtime/computer-target'
import { shellClient } from '~renderer/runtime/shell-client'
import { showYiruCliRegistrationPromptToast } from '~renderer/skills/agent-cli-prerequisite'
import {
  ORCHESTRATION_ENABLED_STORAGE_KEY,
  ORCHESTRATION_SETUP_DISMISSED_STORAGE_KEY,
  notifyOrchestrationSetupStateChanged
} from '~renderer/skills/orchestration-setup-state'

export type OnboardingFeatureSetupId = 'browserUse' | 'computerUse' | 'orchestration'

export type OnboardingFeatureSetupSelection = Record<OnboardingFeatureSetupId, boolean>

export const DEFAULT_ONBOARDING_FEATURE_SETUP_SELECTION: OnboardingFeatureSetupSelection = {
  browserUse: true,
  computerUse: true,
  orchestration: true
}

export const ONBOARDING_FEATURE_SETUP_IDS: readonly OnboardingFeatureSetupId[] = [
  'browserUse',
  'computerUse',
  'orchestration'
]

const ONBOARDING_PROGRESS_FEATURE_SETUP_IDS: readonly OnboardingFeatureSetupId[] = [
  'browserUse',
  'computerUse',
  'orchestration'
]

const FEATURE_SKILL_NAMES: Record<OnboardingFeatureSetupId, string> = {
  browserUse: YIRU_CLI_SKILL_NAME,
  computerUse: COMPUTER_USE_SKILL_NAME,
  orchestration: ORCHESTRATION_SKILL_NAME
}

const FEATURE_TELEMETRY_IDS: Record<
  OnboardingFeatureSetupId,
  EventProps<'onboarding_feature_setup_toggled'>['feature']
> = {
  browserUse: 'browser_use',
  computerUse: 'computer_use',
  orchestration: 'orchestration'
}

export type OnboardingFeatureSetupWarning = {
  featureId: OnboardingFeatureSetupId | 'cli' | 'skills'
  message: string
}

export type OnboardingFeatureSetupResult = {
  selectedIds: OnboardingFeatureSetupId[]
  cliTouched: boolean
  skillCommandsCopied: boolean
  skillInstallCommand: string | null
  computerUsePermissionsOpened: boolean
  warnings: OnboardingFeatureSetupWarning[]
}

export type OnboardingFeatureSetupDeps = {
  getCliStatus: () => Promise<CliInstallStatus>
  showCliRegistrationPrompt?: () => Promise<void>
  installCli: () => Promise<CliInstallStatus>
  writeClipboardText: (text: string) => Promise<void>
  getComputerUsePermissionStatus: () => Promise<ComputerPermissionStatusResult>
  openComputerUsePermissionSetup: () => Promise<ComputerPermissionSetupResult>
  setStorageItem: (key: string, value: string) => void
  removeStorageItem: (key: string) => void
  notifyOrchestrationStateChanged: () => void
}

export function hasSelectedOnboardingFeatureSetup(
  selection: OnboardingFeatureSetupSelection
): boolean {
  return ONBOARDING_FEATURE_SETUP_IDS.some((id) => selection[id])
}

export function selectedOnboardingFeatureSetupIds(
  selection: OnboardingFeatureSetupSelection
): OnboardingFeatureSetupId[] {
  return ONBOARDING_FEATURE_SETUP_IDS.filter((id) => selection[id])
}

export function buildOnboardingFeatureSetupClipboardText(
  selection: OnboardingFeatureSetupSelection
): string | null {
  return buildOnboardingFeatureSetupSkillCommand(selection)
}

export function buildOnboardingFeatureSetupSkillCommand(
  selection: OnboardingFeatureSetupSelection
): string | null {
  const skillNames = selectedOnboardingFeatureSetupIds(selection).map(
    (id) => FEATURE_SKILL_NAMES[id]
  )
  if (skillNames.length === 0) {
    return null
  }
  // Why: debug mode has no feature toggle of its own — it applies to every
  // agent, so it rides along with whichever skills the user chose to install.
  return buildAgentFeatureSkillInstallCommand([...skillNames, YIRU_DEBUG_SKILL_NAME])
}

export function onboardingFeatureSetupTelemetryFeature(
  id: OnboardingFeatureSetupId
): EventProps<'onboarding_feature_setup_toggled'>['feature'] {
  return FEATURE_TELEMETRY_IDS[id]
}

export function onboardingFeatureSetupTelemetrySelection(
  selection: OnboardingFeatureSetupSelection
): EventProps<'onboarding_feature_setup_terminal_opened'> {
  return {
    browser_use: selection.browserUse,
    computer_use: selection.computerUse,
    orchestration: selection.orchestration,
    selected_count: selectedOnboardingProgressFeatureSetupIds(selection).length
  }
}

function selectedOnboardingProgressFeatureSetupIds(
  selection: OnboardingFeatureSetupSelection
): OnboardingFeatureSetupId[] {
  return ONBOARDING_PROGRESS_FEATURE_SETUP_IDS.filter((id) => selection[id])
}

export function onboardingFeatureSetupRunTelemetry(
  selection: OnboardingFeatureSetupSelection,
  result: OnboardingFeatureSetupResult
): EventProps<'onboarding_feature_setup_run'> {
  return {
    ...onboardingFeatureSetupTelemetrySelection(selection),
    cli_touched: result.cliTouched,
    skill_commands_copied: result.skillCommandsCopied,
    skill_install_command_prepared: result.skillInstallCommand !== null,
    computer_use_permissions_opened: result.computerUsePermissionsOpened,
    warning_count: result.warnings.length
  }
}

// Why: Computer Use permissions belong to the local browser host.
async function requireComputerClient(): Promise<ComputerClient> {
  const client = await openComputerTarget()
  if (!client) {
    throw new Error(
      translate(
        'onboarding.featureSetup.computerUseUnavailable',
        'Computer Use requires a local Yiru daemon connection'
      )
    )
  }
  return client
}

export function createOnboardingFeatureSetupDeps(): OnboardingFeatureSetupDeps {
  return {
    getCliStatus: () => readCliInstallStatus(),
    showCliRegistrationPrompt: showYiruCliRegistrationPromptToast,
    installCli: () => installCliCommand(),
    writeClipboardText: (text) => shellClient.ui.writeClipboardText(text),
    getComputerUsePermissionStatus: () =>
      requireComputerClient().then((client) => client.permissionsStatus()),
    openComputerUsePermissionSetup: () =>
      requireComputerClient().then((client) => client.permissions()),
    setStorageItem: (key, value) => localStorage.setItem(key, value),
    removeStorageItem: (key) => localStorage.removeItem(key),
    notifyOrchestrationStateChanged: notifyOrchestrationSetupStateChanged
  }
}

export async function runOnboardingFeatureSetup(
  selection: OnboardingFeatureSetupSelection,
  deps: OnboardingFeatureSetupDeps = createOnboardingFeatureSetupDeps()
): Promise<OnboardingFeatureSetupResult> {
  const selectedIds = selectedOnboardingFeatureSetupIds(selection)
  const warnings: OnboardingFeatureSetupWarning[] = []
  let cliTouched = false
  let skillCommandsCopied = false
  const skillInstallCommand = buildOnboardingFeatureSetupSkillCommand(selection)
  let computerUsePermissionsOpened = false

  deps.setStorageItem(BROWSER_USE_ENABLED_STORAGE_KEY, selection.browserUse ? '1' : '0')
  deps.setStorageItem(ORCHESTRATION_ENABLED_STORAGE_KEY, selection.orchestration ? '1' : '0')
  if (selection.orchestration) {
    deps.removeStorageItem(ORCHESTRATION_SETUP_DISMISSED_STORAGE_KEY)
  }
  deps.notifyOrchestrationStateChanged()

  if (selectedIds.length === 0) {
    return {
      selectedIds,
      cliTouched,
      skillCommandsCopied,
      skillInstallCommand,
      computerUsePermissionsOpened,
      warnings
    }
  }

  try {
    const status = await deps.getCliStatus()
    if (!status.supported) {
      warnings.push({
        featureId: 'cli',
        message: status.detail ?? 'Yiru CLI registration is not available on this platform.'
      })
    } else if (status.state !== 'installed' || !status.pathConfigured) {
      await deps.showCliRegistrationPrompt?.()
      const next = await deps.installCli()
      cliTouched = true
      if (next.state !== 'installed') {
        warnings.push({
          featureId: 'cli',
          message: next.detail ?? 'Yiru CLI registration needs attention.'
        })
      } else if (!next.pathConfigured && next.detail) {
        warnings.push({ featureId: 'cli', message: next.detail })
      }
    }
  } catch (error) {
    warnings.push({ featureId: 'cli', message: formatFeatureSetupError(error) })
  }

  if (selection.computerUse) {
    try {
      const status = await deps.getComputerUsePermissionStatus()
      const needsMacPermissions =
        status.platform === 'darwin' &&
        status.permissions.some((permission) => permission.status !== 'granted')
      if (needsMacPermissions) {
        await deps.openComputerUsePermissionSetup()
        computerUsePermissionsOpened = true
      }
    } catch (error) {
      warnings.push({
        featureId: 'computerUse',
        message: formatFeatureSetupError(error)
      })
    }
  }

  skillCommandsCopied = await copySkillCommands(selection, deps, warnings)

  return {
    selectedIds,
    cliTouched,
    skillCommandsCopied,
    skillInstallCommand,
    computerUsePermissionsOpened,
    warnings
  }
}

function formatFeatureSetupError(error: unknown): string {
  return error instanceof Error ? error.message : String(error)
}

async function copySkillCommands(
  selection: OnboardingFeatureSetupSelection,
  deps: OnboardingFeatureSetupDeps,
  warnings: OnboardingFeatureSetupWarning[]
): Promise<boolean> {
  const clipboardText = buildOnboardingFeatureSetupClipboardText(selection)
  if (!clipboardText) {
    return false
  }
  try {
    await deps.writeClipboardText(clipboardText)
    return true
  } catch (error) {
    warnings.push({ featureId: 'skills', message: formatFeatureSetupError(error) })
    return false
  }
}
