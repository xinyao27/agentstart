import { isTuiAgent } from '@yiru/protocol/agent/identity'
import { translate } from '~renderer/i18n/i18n'

export function choice<const T extends string>(value: string, values: readonly T[]): T {
  const match = values.find((candidate) => candidate === value)
  if (match === undefined) {
    throw new Error(
      translate('runtime.shellHost.invalidCommandValue', 'Invalid shell command value')
    )
  }
  return match
}

export function optionalChoice<const T extends string>(
  value: string | undefined,
  values: readonly T[]
): T | undefined {
  return value === undefined ? undefined : choice(value, values)
}

export function launchAgent(value: string | undefined) {
  if (value === undefined) {
    return undefined
  }
  if (!isTuiAgent(value)) {
    throw new Error(translate('runtime.shellHost.invalidLaunchAgent', 'Invalid launch agent'))
  }
  return value
}

export function splitSource(value: string | undefined) {
  return optionalChoice(value, [
    'contextual_tour',
    'keyboard',
    'context_menu',
    'command',
    'unknown'
  ])
}

export function delivery(value: string | undefined) {
  return optionalChoice(value, ['fast', 'shell-ready'])
}
