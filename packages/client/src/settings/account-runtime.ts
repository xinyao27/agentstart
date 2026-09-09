import type { GlobalSettings } from '@yiru/protocol/settings/global/model'
import type {
  ClaudeRateLimitAccountsState,
  CodexRateLimitAccountsState,
  CodexSystemDefaultIdentity
} from '@yiru/protocol/settings/managed-accounts'
import { translate } from '~renderer/i18n/i18n'

export type AccountRuntime = {
  runtime: 'host' | 'wsl'
  wslDistro?: string | null
  label: string
}

export function getHostRuntimeLabel(): string {
  return navigator.userAgent.includes('Windows')
    ? 'Windows'
    : translate('auto.components.settings.AccountsPane.9baf45d071', 'This device')
}

export function getSelectedAccountRuntime(
  settings: GlobalSettings,
  wslSupportedPlatform: boolean,
  wslAvailable: boolean,
  wslDistros: string[],
  wslCapabilitiesLoading: boolean
): AccountRuntime {
  if (wslSupportedPlatform && settings.localAccountRuntime === 'wsl') {
    if (!wslAvailable && !wslCapabilitiesLoading) {
      return {
        runtime: 'wsl',
        label: translate('auto.components.settings.AccountsPane.8619f9afa9', 'WSL')
      }
    }
    const configuredDistro = settings.localAccountWslDistro?.trim() || null
    const selectedDistro =
      configuredDistro && (wslCapabilitiesLoading || wslDistros.includes(configuredDistro))
        ? configuredDistro
        : null
    return {
      runtime: 'wsl',
      wslDistro: selectedDistro,
      label: selectedDistro
        ? `WSL ${selectedDistro}`
        : translate('auto.components.settings.AccountsPane.2358ac71d2', 'WSL default')
    }
  }
  return { runtime: 'host', label: getHostRuntimeLabel() }
}

export function getAccountRuntimeSentenceLabel(runtime: AccountRuntime): string {
  if (runtime.runtime !== 'host' || navigator.userAgent.includes('Windows')) {
    return runtime.label
  }
  return `${runtime.label.charAt(0).toLocaleLowerCase()}${runtime.label.slice(1)}`
}

export function getCodexAccountLabel(
  state: CodexRateLimitAccountsState,
  accountId: string | null | undefined
): string {
  if (accountId == null) {
    return translate('auto.components.settings.AccountsPane.f2a265f8c7', 'System default')
  }
  return (
    state.accounts.find((account) => account.id === accountId)?.email ??
    translate('auto.components.settings.AccountsPane.codexAccountFallback', 'Codex account')
  )
}

export function getClaudeAccountLabel(
  state: ClaudeRateLimitAccountsState,
  accountId: string | null | undefined
): string {
  if (accountId == null) {
    return translate('auto.components.settings.AccountsPane.f2a265f8c7', 'System default')
  }
  return (
    state.accounts.find((account) => account.id === accountId)?.email ??
    translate('auto.components.settings.AccountsPane.claudeAccountFallback', 'Claude account')
  )
}

export function getCodexSystemDefaultSubtitle(
  identity: CodexSystemDefaultIdentity | undefined,
  runtimeSentenceLabel: string
): string {
  if (identity?.authKind === 'oauth' && identity.email) {
    return identity.email
  }
  if (identity?.authKind === 'api-key') {
    return translate(
      'auto.components.settings.AccountsPane.codexSystemDefaultCustomProvider',
      'Custom provider — no usage tracked.'
    )
  }
  return translate(
    'auto.components.settings.AccountsPane.fcc4093fc1',
    'Use your current {{value0}} Codex login.',
    { value0: runtimeSentenceLabel }
  )
}

export function getCodexAccountRuntimeLabel(
  account: CodexRateLimitAccountsState['accounts'][number],
  hostLabel = getHostRuntimeLabel()
): string {
  if (account.managedHomeRuntime === 'wsl') {
    return account.wslDistro ? `WSL ${account.wslDistro}` : 'WSL'
  }
  return hostLabel
}

export function getClaudeAccountRuntimeLabel(
  account: ClaudeRateLimitAccountsState['accounts'][number],
  hostLabel = getHostRuntimeLabel()
): string {
  if (account.managedAuthRuntime === 'wsl') {
    return account.wslDistro ? `WSL ${account.wslDistro}` : 'WSL'
  }
  return hostLabel
}

export function formatAccountTimestamp(timestamp: number): string {
  return new Date(timestamp).toLocaleString(undefined, {
    month: 'short',
    day: 'numeric',
    hour: 'numeric',
    minute: '2-digit'
  })
}

export function getCodexAccountErrorDescription(error: unknown): string {
  const message = String((error as Error)?.message ?? error)
    .replace(/^Error occurred in handler for 'codexAccounts:[^']+':\s*/i, '')
    .replace(/^Error invoking remote method 'codexAccounts:[^']+':\s*/i, '')
    .replace(/^Error:\s*/i, '')
    .trim()
  const normalizedMessage = message.toLowerCase()
  if (
    normalizedMessage.includes('timed out waiting for codex login to finish') ||
    normalizedMessage.includes('codex sign-in took too long to finish')
  ) {
    return translate(
      'auto.components.settings.AccountsPane.codexSignInTimeout',
      'Codex sign-in took too long to finish. Please try again.'
    )
  }
  if (
    normalizedMessage.includes('auth error 502') ||
    normalizedMessage.includes('gateway') ||
    normalizedMessage.includes('bad gateway')
  ) {
    return translate(
      'auto.components.settings.AccountsPane.codexSignInUnavailable',
      'Codex sign-in is temporarily unavailable. Please try again in a minute.'
    )
  }
  if (normalizedMessage.startsWith('codex login failed:')) {
    const loginMessage = message.slice('Codex login failed:'.length).trim()
    return (
      loginMessage ||
      translate(
        'auto.components.settings.AccountsPane.codexSignInFailed',
        'Codex sign-in failed. Please try again.'
      )
    )
  }
  return (
    message ||
    translate(
      'auto.components.settings.AccountsPane.codexSignInFailed',
      'Codex sign-in failed. Please try again.'
    )
  )
}

export function getClaudeAccountErrorDescription(error: unknown): string {
  return (
    String((error as Error)?.message ?? error)
      .replace(/^Error occurred in handler for 'claudeAccounts:[^']+':\s*/i, '')
      .replace(/^Error invoking remote method 'claudeAccounts:[^']+':\s*/i, '')
      .replace(/^Error:\s*/i, '')
      .trim() ||
    translate(
      'auto.components.settings.AccountsPane.claudeSignInFailed',
      'Claude sign-in failed. Please try again.'
    )
  )
}

export function isClaudeAccountCancellation(error: unknown): boolean {
  return getClaudeAccountErrorDescription(error).toLowerCase() === 'claude sign-in was cancelled.'
}
