import type { GlobalSettings } from '@agentstart/protocol/settings/global/model'
import { useQueryClient } from '@tanstack/react-query'
import { useState } from 'react'
import { toast } from 'sonner'
import { translate } from '~renderer/i18n/i18n'
import type { PublicKnownRuntimeEnvironment } from '~renderer/runtime/environment-model'
import { runtimeEnvironmentsClient } from '~renderer/runtime/runtime-environments-client'

import {
  createRuntimeEnvironmentErrorDetails,
  getRuntimeEnvironmentLabel,
  reportRuntimeEnvironmentActionError,
  showRemovedRuntimeEnvironment,
  setRuntimeEnvironmentStatus
} from './runtime-environment-action-model'
import { connectRuntimeEnvironment } from './runtime-environment-connection'
import { LOCAL_RUNTIME_VALUE, NO_RUNTIME_VALUE } from './runtime-environment-status'
import type { RuntimeEnvironmentList } from './use-runtime-environment-list'

type RuntimeEnvironmentActionsOptions = Pick<
  RuntimeEnvironmentList,
  'environments' | 'loadEnvironments' | 'mountedRef' | 'setDetailsByEnvironmentId'
> & {
  settings: GlobalSettings
  allowLocalRuntime: boolean
  switchRuntimeEnvironment: (environmentId: string | null) => Promise<boolean>
}

export type RuntimeEnvironmentActions = {
  connectingId: string | null
  switchingValue: string | null
  removingId: string | null
  disconnectingId: string | null
  switchError: string | null
  removeError: string | null
  setSwitchError: React.Dispatch<React.SetStateAction<string | null>>
  setRemoveError: React.Dispatch<React.SetStateAction<string | null>>
  isBusy: boolean
  connectEnvironment: (environment: PublicKnownRuntimeEnvironment) => Promise<boolean>
  disconnectEnvironment: (environment: PublicKnownRuntimeEnvironment) => Promise<boolean>
  removeEnvironment: (environment: PublicKnownRuntimeEnvironment) => Promise<boolean>
  switchToValue: (value: string) => Promise<boolean>
  getEnvironmentLabel: (value: string) => string
}

export function useRuntimeEnvironmentActions(
  options: RuntimeEnvironmentActionsOptions
): RuntimeEnvironmentActions {
  const queryClient = useQueryClient()
  const [connectingId, setConnectingId] = useState<string | null>(null)
  const [switchingValue, setSwitchingValue] = useState<string | null>(null)
  const [removingId, setRemovingId] = useState<string | null>(null)
  const [disconnectingId, setDisconnectingId] = useState<string | null>(null)
  const [switchError, setSwitchError] = useState<string | null>(null)
  const [removeError, setRemoveError] = useState<string | null>(null)
  const { mountedRef } = options

  const removeEnvironment = async (
    environment: PublicKnownRuntimeEnvironment
  ): Promise<boolean> => {
    setRemovingId(environment.id)
    setRemoveError(null)
    try {
      if (options.settings.activeRuntimeEnvironmentId === environment.id) {
        if (!options.allowLocalRuntime) {
          await runtimeEnvironmentsClient.remove({ selector: environment.id })
        }
        if (!(await options.switchRuntimeEnvironment(null))) {
          if (mountedRef.current) {
            setRemoveError(
              options.allowLocalRuntime
                ? translate(
                    'auto.components.settings.RuntimeEnvironmentsPane.switchLocalFailed',
                    'Could not switch to Local desktop. Fix the issue and try again.'
                  )
                : translate(
                    'auto.components.settings.RuntimeEnvironmentsPane.disconnectFailed',
                    'Could not disconnect from this remote daemon. Fix the issue and try again.'
                  )
            )
          }
          return false
        }
        if (!options.allowLocalRuntime) {
          await options.loadEnvironments()
          showRemovedRuntimeEnvironment(mountedRef, environment)
          return true
        }
      }
      await runtimeEnvironmentsClient.remove({ selector: environment.id })
      await options.loadEnvironments()
      showRemovedRuntimeEnvironment(mountedRef, environment)
      return true
    } catch (error) {
      return reportRuntimeEnvironmentActionError(
        mountedRef,
        error,
        translate(
          'auto.components.settings.RuntimeEnvironmentsPane.removeFailed',
          'Failed to remove runtime environment.'
        ),
        setRemoveError
      )
    } finally {
      if (mountedRef.current) {
        setRemovingId(null)
      }
    }
  }

  const disconnectEnvironment = async (
    environment: PublicKnownRuntimeEnvironment
  ): Promise<boolean> => {
    setDisconnectingId(environment.id)
    setSwitchError(null)
    try {
      if (
        options.settings.activeRuntimeEnvironmentId === environment.id &&
        !(await options.switchRuntimeEnvironment(null))
      ) {
        if (mountedRef.current) {
          setSwitchError(
            options.allowLocalRuntime
              ? translate(
                  'auto.components.settings.RuntimeEnvironmentsPane.switchLocalFailed',
                  'Could not switch to Local desktop. Fix the issue and try again.'
                )
              : translate(
                  'auto.components.settings.RuntimeEnvironmentsPane.disconnectFailed',
                  'Could not disconnect from this remote daemon. Fix the issue and try again.'
                )
          )
        }
        return false
      }
      await runtimeEnvironmentsClient.disconnect({ selector: environment.id })
      setRuntimeEnvironmentStatus(environment.id, null)
      if (mountedRef.current) {
        options.setDetailsByEnvironmentId((current) => ({
          ...current,
          [environment.id]: createRuntimeEnvironmentErrorDetails(null)
        }))
        toast.success(
          translate(
            'auto.components.settings.RuntimeEnvironmentsPane.disconnectedServer',
            'Disconnected from {{value0}}.',
            { value0: environment.name }
          )
        )
      }
      return true
    } catch (error) {
      return reportRuntimeEnvironmentActionError(
        mountedRef,
        error,
        translate(
          'auto.components.settings.RuntimeEnvironmentsPane.hostDisconnectFailed',
          'Failed to disconnect host.'
        ),
        setSwitchError
      )
    } finally {
      if (mountedRef.current) {
        setDisconnectingId(null)
      }
    }
  }

  const connectEnvironment = async (
    environment: PublicKnownRuntimeEnvironment
  ): Promise<boolean> => {
    setConnectingId(environment.id)
    setSwitchError(null)
    try {
      return await connectRuntimeEnvironment({
        environment,
        queryClient,
        mountedRef,
        setDetailsByEnvironmentId: options.setDetailsByEnvironmentId,
        setError: setSwitchError
      })
    } finally {
      if (mountedRef.current) {
        setConnectingId(null)
      }
    }
  }

  const switchToValue = async (value: string): Promise<boolean> => {
    if (value === NO_RUNTIME_VALUE) {
      return false
    }
    setSwitchingValue(value)
    setSwitchError(null)
    try {
      const environmentId =
        options.allowLocalRuntime && value === LOCAL_RUNTIME_VALUE ? null : value
      if (await options.switchRuntimeEnvironment(environmentId)) {
        if (mountedRef.current) {
          toast.success(
            translate(
              'auto.components.settings.RuntimeEnvironmentsPane.99ac81fb43',
              'Switched to {{value0}}.',
              { value0: getRuntimeEnvironmentLabel(options.environments, value) }
            )
          )
        }
        return true
      }
      if (mountedRef.current) {
        setSwitchError(
          translate(
            'auto.components.settings.RuntimeEnvironmentsPane.hostSwitchFailed',
            'Could not switch hosts. Fix the issue and try again.'
          )
        )
      }
      return false
    } catch (error) {
      return reportRuntimeEnvironmentActionError(
        mountedRef,
        error,
        translate(
          'auto.components.settings.RuntimeEnvironmentsPane.hostSwitchError',
          'Failed to switch hosts.'
        ),
        setSwitchError
      )
    } finally {
      if (mountedRef.current) {
        setSwitchingValue(null)
      }
    }
  }

  return {
    connectingId,
    switchingValue,
    removingId,
    disconnectingId,
    switchError,
    removeError,
    setSwitchError,
    setRemoveError,
    isBusy:
      connectingId !== null ||
      switchingValue !== null ||
      removingId !== null ||
      disconnectingId !== null,
    connectEnvironment,
    disconnectEnvironment,
    removeEnvironment,
    switchToValue,
    getEnvironmentLabel: (value) => getRuntimeEnvironmentLabel(options.environments, value)
  }
}
