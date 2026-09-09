import type { CliInstallStatus } from '@yiru/protocol/cli-values'
import { useEffect, useState } from 'react'
import { translate } from '~renderer/i18n/i18n'
import { useProjectCatalog } from '~renderer/project-catalog/provider'
import { useMountedRef } from '~renderer/react/use-mounted-ref'
import { readCliInstallStatus } from '~renderer/runtime/cli-install-client'
import {
  assertRuntimeStatusCompatible,
  isRuntimeCompatBlockError
} from '~renderer/runtime/protocol-compat'
import type { RuntimeClientTarget } from '~renderer/runtime/runtime-target'
import { readRuntimeStatus } from '~renderer/runtime/status-client'
import type { RuntimeStatus } from '~renderer/runtime/status/model'
import { useAppStore } from '~renderer/store/state'

import {
  RuntimeStatusIndicator,
  type RuntimeStatusIndicatorDetail,
  type RuntimeStatusIndicatorKind,
  type RuntimeStatusIndicatorProps
} from './indicator'

const RUNTIME_STATUS_POLL_INTERVAL_MS = 5_000
const RUNTIME_STATUS_TIMEOUT_MS = 5_000
const CONNECTED_FAILURE_LIMIT = 2

type RuntimeProbeState =
  | { kind: 'checking' }
  | { kind: 'offline' }
  | { kind: 'ready'; appVersion: string | null }
  | { kind: 'warning' }

type CliProbeState =
  | { kind: 'idle' }
  | { kind: 'checking' }
  | { kind: 'loaded'; status: CliInstallStatus }
  | { kind: 'unavailable' }

function getCliDetail(state: CliProbeState): RuntimeStatusIndicatorDetail {
  const label = translate('auto.components.status.bar.DesktopRuntimeStatus.cli', 'Yiru CLI')
  switch (state.kind) {
    case 'idle':
    case 'checking':
      return {
        label,
        tone: 'muted',
        value: translate('auto.components.status.bar.DesktopRuntimeStatus.checking', 'Checking…')
      }
    case 'unavailable':
      return {
        label,
        tone: 'muted',
        value: translate(
          'auto.components.status.bar.DesktopRuntimeStatus.cliUnavailable',
          'Unavailable'
        )
      }
    case 'loaded':
      break
  }

  const status = state.status
  if (!status.supported || status.state === 'unsupported') {
    return {
      label,
      tone: 'muted',
      value: translate(
        'auto.components.status.bar.DesktopRuntimeStatus.cliUnsupported',
        'Not supported'
      )
    }
  }
  if (status.state === 'installed' && status.pathConfigured) {
    return {
      label,
      tone: 'ready',
      value: translate('auto.components.status.bar.DesktopRuntimeStatus.cliInstalled', 'Installed')
    }
  }
  if (status.state === 'not_installed') {
    return {
      label,
      tone: 'muted',
      value: translate(
        'auto.components.status.bar.DesktopRuntimeStatus.cliNotInstalled',
        'Not installed'
      )
    }
  }
  return {
    label,
    tone: 'warning',
    value: translate(
      'auto.components.status.bar.DesktopRuntimeStatus.cliNeedsRepair',
      'Needs repair'
    )
  }
}

function getRuntimePresentation(
  state: RuntimeProbeState,
  hostName: string,
  isLocal: boolean,
  cliState: CliProbeState
): RuntimeStatusIndicatorProps {
  const title = translate('auto.components.status.bar.DesktopRuntimeStatus.title', 'Yiru Runtime')
  const hostDetail: RuntimeStatusIndicatorDetail = {
    label: translate('auto.components.status.bar.DesktopRuntimeStatus.host', 'Host'),
    value: hostName
  }
  const details: RuntimeStatusIndicatorDetail[] = [hostDetail, getCliDetail(cliState)]
  let kind: RuntimeStatusIndicatorKind
  let shortLabel: string
  let label: string
  let description: string

  switch (state.kind) {
    case 'checking':
      kind = 'checking'
      shortLabel = translate(
        'auto.components.status.bar.DesktopRuntimeStatus.runtimeChecking',
        'Checking'
      )
      label = translate(
        'auto.components.status.bar.DesktopRuntimeStatus.runtimeCheckingLabel',
        'Checking Yiru Runtime on {{host}}',
        { host: hostName }
      )
      description = translate(
        'auto.components.status.bar.DesktopRuntimeStatus.runtimeCheckingDescription',
        'Checking whether the current execution host is ready.'
      )
      break
    case 'ready':
      kind = 'ready'
      shortLabel = translate(
        'auto.components.status.bar.DesktopRuntimeStatus.runtimeReady',
        'Ready'
      )
      label = translate(
        'auto.components.status.bar.DesktopRuntimeStatus.runtimeReadyLabel',
        'Yiru Runtime ready on {{host}}',
        { host: hostName }
      )
      description = isLocal
        ? translate(
            'auto.components.status.bar.DesktopRuntimeStatus.localReadyDescription',
            'Yiru can execute work on this computer.'
          )
        : translate(
            'auto.components.status.bar.DesktopRuntimeStatus.remoteReadyDescription',
            'Yiru is connected to the selected execution host.'
          )
      if (state.appVersion) {
        details.splice(1, 0, {
          label: translate('auto.components.status.bar.DesktopRuntimeStatus.version', 'Version'),
          value: state.appVersion
        })
      }
      break
    case 'offline':
      kind = 'offline'
      shortLabel = translate(
        'auto.components.status.bar.DesktopRuntimeStatus.runtimeUnavailable',
        'Unavailable'
      )
      label = translate(
        'auto.components.status.bar.DesktopRuntimeStatus.runtimeUnavailableLabel',
        'Yiru Runtime unavailable on {{host}}',
        { host: hostName }
      )
      description = translate(
        'auto.components.status.bar.DesktopRuntimeStatus.runtimeUnavailableDescription',
        'The current execution host is not ready. Yiru will keep checking automatically.'
      )
      break
    case 'warning':
      kind = 'warning'
      shortLabel = translate(
        'auto.components.status.bar.DesktopRuntimeStatus.updateRequired',
        'Update required'
      )
      label = translate(
        'auto.components.status.bar.DesktopRuntimeStatus.updateRequiredLabel',
        'Yiru Runtime update required on {{host}}',
        { host: hostName }
      )
      description = translate(
        'auto.components.status.bar.DesktopRuntimeStatus.updateRequiredDescription',
        'Update Yiru on this computer or the selected host before using it.'
      )
      break
  }

  return { description, details, kind, label, shortLabel, title }
}

function runtimeStateFromStatus(status: RuntimeStatus): RuntimeProbeState {
  assertRuntimeStatusCompatible(status)
  switch (status.graphStatus) {
    case 'ready':
      return { kind: 'ready', appVersion: status.appVersion ?? null }
    case 'reloading':
      return { kind: 'checking' }
    case 'unavailable':
      return { kind: 'offline' }
  }
}

function RuntimeStatusContent(props: {
  environmentId: string | null
  hostName: string
}): React.JSX.Element {
  const [runtimeState, setRuntimeState] = useState<RuntimeProbeState>({ kind: 'checking' })
  const [cliState, setCliState] = useState<CliProbeState>({ kind: 'idle' })
  const mountedRef = useMountedRef()
  const runtimeTarget: RuntimeClientTarget = (() =>
    props.environmentId
      ? { kind: 'environment', environmentId: props.environmentId }
      : { kind: 'local' })()

  useEffect(() => {
    let cancelled = false
    let timer: ReturnType<typeof setTimeout> | null = null
    let consecutiveFailures = 0
    const probe = async (): Promise<void> => {
      try {
        const status = await readRuntimeStatus(runtimeTarget, RUNTIME_STATUS_TIMEOUT_MS)
        if (cancelled) {
          return
        }
        consecutiveFailures = 0
        setRuntimeState(runtimeStateFromStatus(status))
      } catch (error) {
        if (cancelled) {
          return
        }
        if (isRuntimeCompatBlockError(error)) {
          setRuntimeState({ kind: 'warning' })
        } else {
          consecutiveFailures += 1
          setRuntimeState((current) =>
            current.kind === 'ready' && consecutiveFailures < CONNECTED_FAILURE_LIMIT
              ? current
              : { kind: 'offline' }
          )
        }
      }
      timer = setTimeout(() => void probe(), RUNTIME_STATUS_POLL_INTERVAL_MS)
    }
    void probe()
    return () => {
      cancelled = true
      if (timer !== null) {
        clearTimeout(timer)
      }
    }
  }, [runtimeTarget])

  const refreshCliStatus = (open: boolean): void => {
    if (!open) {
      return
    }
    setCliState({ kind: 'checking' })
    void readCliInstallStatus({ activeRuntimeEnvironmentId: props.environmentId }).then(
      (status) => {
        if (mountedRef.current) {
          setCliState({ kind: 'loaded', status })
        }
      },
      () => {
        if (mountedRef.current) {
          setCliState({ kind: 'unavailable' })
        }
      }
    )
  }
  const presentation = getRuntimePresentation(
    runtimeState,
    props.hostName,
    props.environmentId === null,
    cliState
  )
  return <RuntimeStatusIndicator {...presentation} onOpenChange={refreshCliStatus} />
}

export function RuntimeStatusSegment(): React.JSX.Element {
  return <RuntimeStatusStoreSegment />
}

function RuntimeStatusStoreSegment(): React.JSX.Element {
  const settings = useAppStore((state) => state.settings)
  const { runtimeEnvironments: environments } = useProjectCatalog()
  const environmentId = settings?.activeRuntimeEnvironmentId?.trim() || null
  const hostName = environmentId
    ? (environments.find((environment) => environment.id === environmentId)?.name ?? environmentId)
    : translate('auto.components.status.bar.DesktopRuntimeStatus.thisComputer', 'This computer')

  return (
    <RuntimeStatusContent
      key={environmentId ?? 'local'}
      environmentId={environmentId}
      hostName={hostName}
    />
  )
}
