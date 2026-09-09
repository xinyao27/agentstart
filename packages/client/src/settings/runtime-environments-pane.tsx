import type { GlobalSettings } from '@yiru/protocol/settings/global/model'
import { useEffect, useState } from 'react'
import type { PublicKnownRuntimeEnvironment } from '~renderer/runtime/environment-model'
import { useAppStore } from '~renderer/store/state'
import {
  getUpdateCheckClickOptions,
  getUpdateCheckHint
} from '~renderer/updates/check-click-options'

import { RuntimeEnvironmentAdvanced } from './runtime-environment-advanced'
import { RuntimeEnvironmentDialogs } from './runtime-environment-dialogs'
import { RuntimeEnvironmentList } from './runtime-environment-list'
import { LOCAL_RUNTIME_VALUE, NO_RUNTIME_VALUE } from './runtime-environment-status'
import { getRuntimeEnvironmentsSearchEntry } from './runtime-environments-search'
import { SearchableSetting } from './searchable-setting'
import { useRuntimeEnvironmentActions } from './use-runtime-environment-actions'
import { useRuntimeEnvironmentList } from './use-runtime-environment-list'

export {
  evaluateHostDetails,
  getActiveServerModeDescription,
  getHostDetailsDescription,
  getHostDetailsSummary,
  getHostModelCapabilitySummary,
  getRuntimeCapabilitiesSummary,
  getRuntimeServerConnectionState,
  type RuntimeHostDetails
} from './runtime-environment-status'

type RuntimeEnvironmentsPaneProps = {
  settings: GlobalSettings
  switchRuntimeEnvironment: (environmentId: string | null) => Promise<boolean>
  allowLocalRuntime?: boolean
}

export function RuntimeEnvironmentsPane({
  settings,
  switchRuntimeEnvironment,
  allowLocalRuntime = true
}: RuntimeEnvironmentsPaneProps): React.JSX.Element {
  const list = useRuntimeEnvironmentList()
  const actions = useRuntimeEnvironmentActions({
    settings,
    switchRuntimeEnvironment,
    allowLocalRuntime,
    environments: list.environments,
    loadEnvironments: list.loadEnvironments,
    mountedRef: list.mountedRef,
    setDetailsByEnvironmentId: list.setDetailsByEnvironmentId
  })
  const [pendingSwitchValue, setPendingSwitchValue] = useState<string | null>(null)
  const [pendingRemove, setPendingRemove] = useState<PublicKnownRuntimeEnvironment | null>(null)
  const [advancedOpen, setAdvancedOpen] = useState(false)
  const remoteServerUpdates = useAppStore((state) => state.remoteServerUpdates)
  const remoteServerUpdatesChecking = useAppStore((state) => state.remoteServerUpdatesChecking)
  const remoteServerUpdatesRunning = useAppStore((state) => state.remoteServerUpdatesRunning)
  const refreshRemoteServerUpdates = useAppStore((state) => state.refreshRemoteServerUpdates)
  const setRemoteServerUpdateDialogOpen = useAppStore(
    (state) => state.setRemoteServerUpdateDialogOpen
  )
  const environmentIdsKey = list.environments.map((environment) => environment.id).join('\n')

  useEffect(() => {
    void refreshRemoteServerUpdates()
  }, [environmentIdsKey, refreshRemoteServerUpdates])

  const activeValue =
    settings.activeRuntimeEnvironmentId ??
    (allowLocalRuntime ? LOCAL_RUNTIME_VALUE : NO_RUNTIME_VALUE)
  const searchEntry = getRuntimeEnvironmentsSearchEntry()
  const cancelSwitch = (): void => {
    actions.setSwitchError(null)
    setPendingSwitchValue(null)
  }
  const cancelRemove = (): void => {
    actions.setRemoveError(null)
    setPendingRemove(null)
  }

  return (
    <SearchableSetting
      title={searchEntry.title}
      description={searchEntry.description}
      keywords={searchEntry.keywords}
      className="space-y-4 py-2"
    >
      <RuntimeEnvironmentList
        environments={list.environments}
        detailsByEnvironmentId={list.detailsByEnvironmentId}
        activeEnvironmentId={settings.activeRuntimeEnvironmentId ?? null}
        updates={remoteServerUpdates}
        updatesChecking={remoteServerUpdatesChecking}
        updatesRunning={remoteServerUpdatesRunning}
        updateCheckHint={getUpdateCheckHint()}
        connectingId={actions.connectingId}
        switchingValue={actions.switchingValue}
        disconnectingId={actions.disconnectingId}
        removingId={actions.removingId}
        isBusy={actions.isBusy}
        onCheckUpdates={(event) => {
          setRemoteServerUpdateDialogOpen(true)
          void refreshRemoteServerUpdates(getUpdateCheckClickOptions(event))
        }}
        onOpenUpdates={() => setRemoteServerUpdateDialogOpen(true)}
        onConnect={(environment) => void actions.connectEnvironment(environment)}
        onDisconnect={(environment) => void actions.disconnectEnvironment(environment)}
        onRemove={(environment) => {
          actions.setRemoveError(null)
          setPendingRemove(environment)
        }}
      />
      <RuntimeEnvironmentAdvanced
        open={advancedOpen}
        onOpenChange={setAdvancedOpen}
        allowLocalRuntime={allowLocalRuntime}
        activeValue={activeValue}
        environments={list.environments}
        detailsByEnvironmentId={list.detailsByEnvironmentId}
        isBusy={actions.isBusy}
        isLoading={list.isLoading}
        onSelect={(value) => {
          if (value && value !== activeValue) {
            actions.setSwitchError(null)
            setPendingSwitchValue(value)
          }
        }}
        onRefresh={() => void list.loadEnvironments()}
      />
      <RuntimeEnvironmentDialogs
        pendingSwitchValue={pendingSwitchValue}
        pendingRemove={pendingRemove}
        switchingValue={actions.switchingValue}
        removingId={actions.removingId}
        switchError={actions.switchError}
        removeError={actions.removeError}
        removingActiveHost={pendingRemove?.id === settings.activeRuntimeEnvironmentId}
        allowLocalRuntime={allowLocalRuntime}
        getEnvironmentLabel={actions.getEnvironmentLabel}
        onCancelSwitch={cancelSwitch}
        onConfirmSwitch={(value) => {
          void actions.switchToValue(value).then((switched) => {
            if (switched && list.mountedRef.current) {
              setPendingSwitchValue(null)
            }
          })
        }}
        onCancelRemove={cancelRemove}
        onConfirmRemove={(environment) => {
          void actions.removeEnvironment(environment).then((removed) => {
            if (removed && list.mountedRef.current) {
              setPendingRemove(null)
            }
          })
        }}
      />
    </SearchableSetting>
  )
}
