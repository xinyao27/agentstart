import { translate } from '~renderer/i18n/i18n'
import type { PublicKnownRuntimeEnvironment } from '~renderer/runtime/environment-model'
import type { RuntimeStatus } from '~renderer/runtime/status/model'
import { useAppStore } from '~renderer/store/state'

import {
  LOCAL_RUNTIME_VALUE,
  NO_RUNTIME_VALUE,
  type RuntimeHostDetails
} from './runtime-environment-status'

export function getRuntimeEnvironmentLabel(
  environments: PublicKnownRuntimeEnvironment[],
  value: string
): string {
  if (value === LOCAL_RUNTIME_VALUE) {
    return translate('auto.components.settings.RuntimeEnvironmentsPane.78692becbd', 'Local desktop')
  }
  if (value === NO_RUNTIME_VALUE) {
    return translate(
      'auto.components.settings.RuntimeEnvironmentsPane.b07070ed3c',
      'No remote daemon connected'
    )
  }
  return (
    environments.find((environment) => environment.id === value)?.name ??
    translate(
      'auto.components.settings.RuntimeEnvironmentsPane.remoteDaemonFallback',
      'Remote daemon'
    )
  )
}

export function setRuntimeEnvironmentStatus(
  environmentId: string,
  status: RuntimeStatus | null
): void {
  useAppStore.getState().setRuntimeEnvironmentStatus(environmentId, {
    status,
    checkedAt: Date.now()
  })
}

export function createRuntimeEnvironmentErrorDetails(error: string | null): RuntimeHostDetails {
  return { status: 'error', runtimeStatus: null, compatibility: null, error }
}

export function getRuntimeEnvironmentErrorMessage(error: unknown, fallback: string): string {
  return error instanceof Error ? error.message : fallback
}

export function showRemovedRuntimeEnvironment(
  mountedRef: MutableRefObject<boolean>,
  environment: PublicKnownRuntimeEnvironment
): void {
  if (mountedRef.current) {
    toast.success(
      translate(
        'auto.components.settings.RuntimeEnvironmentsPane.b5b5114cb0',
        'Removed {{value0}}.',
        { value0: environment.name }
      )
    )
  }
}

export function reportRuntimeEnvironmentActionError(
  mountedRef: MutableRefObject<boolean>,
  error: unknown,
  fallback: string,
  setError: React.Dispatch<React.SetStateAction<string | null>>
): false {
  const message = getRuntimeEnvironmentErrorMessage(error, fallback)
  if (mountedRef.current) {
    setError(message)
    toast.error(message)
  }
  return false
}
import type { MutableRefObject } from 'react'
import { toast } from 'sonner'
