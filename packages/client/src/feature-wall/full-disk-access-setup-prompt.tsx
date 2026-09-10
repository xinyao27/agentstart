import type {
  DeveloperPermissionId,
  DeveloperPermissionState,
  DeveloperPermissionStatus
} from '@agentstart/protocol'
import { useEffect, useRef, useState } from 'react'
import { toast } from 'sonner'
import { translate } from '~renderer/i18n/i18n'
import { Check, HardDrive, ArrowSquareOut as ExternalLink } from '~renderer/icons/hugeicons'
import { LoadingIndicator } from '~renderer/loading/indicator'
import { useEventCallback } from '~renderer/react/use-event-callback'
import { useMountedRef } from '~renderer/react/use-mounted-ref'
import { shellClient } from '~renderer/runtime/shell-client'
import { Badge } from '~renderer/ui/badge'
import { Button } from '~renderer/ui/button'

import { isMacUserAgent } from '../terminal-pane/pane-interactions'

type FullDiskAccessStatusState = {
  status: DeveloperPermissionStatus | undefined
  checking: boolean
}

type FullDiskAccessButtonState = {
  ready: boolean
  requesting: boolean
}

const FULL_DISK_ACCESS_PERMISSION_ID: DeveloperPermissionId = 'full-disk-access'

function isFullDiskAccessSetupVisible(status: DeveloperPermissionStatus | undefined): boolean {
  return status !== undefined && status !== 'unsupported'
}

function isFullDiskAccessReady(status: DeveloperPermissionStatus | undefined): boolean {
  return status === 'granted' || status === 'ready'
}

function getFullDiskAccessStatus(
  states: readonly DeveloperPermissionState[]
): DeveloperPermissionStatus | undefined {
  return states.find((state) => state.id === FULL_DISK_ACCESS_PERMISSION_ID)?.status
}

function getFullDiskAccessStatusLabel(args: FullDiskAccessStatusState): string {
  if (args.checking) {
    return translate(
      'auto.components.feature.wall.FullDiskAccessSetupPrompt.bbb3f1e404',
      'Checking'
    )
  }
  if (isFullDiskAccessReady(args.status)) {
    return translate('auto.components.feature.wall.FullDiskAccessSetupPrompt.48d87edcd2', 'Granted')
  }
  return translate(
    'auto.components.feature.wall.FullDiskAccessSetupPrompt.6db9a69f4e',
    'Recommended'
  )
}

function getFullDiskAccessButtonLabel(args: FullDiskAccessButtonState): string {
  if (args.requesting) {
    return translate(
      'auto.components.feature.wall.FullDiskAccessSetupPrompt.dac08ec03e',
      'Opening...'
    )
  }
  if (args.ready) {
    return translate('auto.components.feature.wall.FullDiskAccessSetupPrompt.48d87edcd2', 'Granted')
  }
  return translate(
    'auto.components.feature.wall.FullDiskAccessSetupPrompt.6e3d62b816',
    'Open Full Disk Access'
  )
}

function FullDiskAccessButtonIcon(props: FullDiskAccessButtonState): React.JSX.Element {
  if (props.requesting) {
    return <LoadingIndicator className="size-3.5" />
  }
  if (props.ready) {
    return <Check className="size-3.5" />
  }
  return <ExternalLink className="size-3.5" />
}

function useFullDiskAccessStatus(): FullDiskAccessStatusState & { refresh: () => void } {
  const isMac = isMacUserAgent()
  const mountedRef = useMountedRef()
  const refreshSequenceRef = useRef(0)
  const [state, setState] = useState<FullDiskAccessStatusState>({
    status: undefined,
    checking: isMac
  })

  const finishRefresh = (status: DeveloperPermissionStatus | undefined): void => {
    if (!mountedRef.current) {
      return
    }
    setState((current) =>
      current.status === status && !current.checking ? current : { status, checking: false }
    )
  }

  const refresh = useEventCallback((): void => {
    if (!isMac) {
      finishRefresh('unsupported')
      return
    }
    if (mountedRef.current) {
      setState((current) => (current.checking ? current : { ...current, checking: true }))
    }
    const refreshId = ++refreshSequenceRef.current
    shellClient.developerPermissions
      .getStatus()
      .then((states) => {
        if (refreshId === refreshSequenceRef.current) {
          finishRefresh(getFullDiskAccessStatus(states))
        }
      })
      .catch(() => {
        if (refreshId === refreshSequenceRef.current) {
          finishRefresh(undefined)
        }
      })
  })

  useEffect(() => {
    const refreshIfLive = (): void => {
      if (mountedRef.current) {
        refresh()
      }
    }
    refreshIfLive()
    if (!isMac) {
      return
    }
    // Why: users grant Full Disk Access outside AgentStart, so focus is the first
    // cheap signal that System Settings may have changed the permission state.
    window.addEventListener('focus', refreshIfLive)
    return () => {
      window.removeEventListener('focus', refreshIfLive)
    }
  }, [isMac, mountedRef, refresh])

  return { ...state, refresh }
}

export function FullDiskAccessSetupPrompt(): React.JSX.Element | null {
  const { checking, refresh, status } = useFullDiskAccessStatus()
  const mountedRef = useMountedRef()
  const [requesting, setRequesting] = useState(false)
  const ready = isFullDiskAccessReady(status)
  const visible = checking || isFullDiskAccessSetupVisible(status)

  const handleOpenFullDiskAccess = async (): Promise<void> => {
    setRequesting(true)
    try {
      const result = await shellClient.developerPermissions.request({
        id: FULL_DISK_ACCESS_PERMISSION_ID
      })
      if (!mountedRef.current) {
        return
      }
      refresh()
      if (result.status === 'granted') {
        toast.success(
          translate('auto.components.feature.wall.FullDiskAccessSetupPrompt.48d87edcd2', 'Granted')
        )
      } else if (result.openedSystemSettings) {
        toast.message(
          translate(
            'auto.components.feature.wall.FullDiskAccessSetupPrompt.fa809e8ada',
            'Opened macOS Privacy & Security'
          )
        )
      }
    } catch {
      toast.error(
        translate(
          'auto.components.feature.wall.FullDiskAccessSetupPrompt.bfa3402305',
          'Could not request permission'
        )
      )
    } finally {
      if (mountedRef.current) {
        setRequesting(false)
      }
    }
  }

  if (!visible) {
    return null
  }

  return (
    <div className="border-border/60 bg-muted/20 mt-5 flex items-center justify-between gap-4 rounded-lg border px-4 py-3">
      <div className="flex min-w-0 items-start gap-3">
        <div className="text-muted-foreground mt-0.5">
          <HardDrive className="size-4" />
        </div>
        <div className="min-w-0 space-y-1">
          <div className="flex flex-wrap items-center gap-2">
            <span className="text-foreground text-sm font-medium">
              {translate(
                'auto.components.feature.wall.FullDiskAccessSetupPrompt.c566bca278',
                'Full Disk Access'
              )}
            </span>
            <Badge variant={ready ? 'secondary' : 'outline'} className="tracking-wider uppercase">
              {getFullDiskAccessStatusLabel({ checking, status })}
            </Badge>
          </div>
          <p className="text-muted-foreground text-xs leading-snug">
            {translate(
              'auto.components.feature.wall.FullDiskAccessSetupPrompt.0d6efe9cf4',
              'Recommended on macOS when projects or worktrees live in protected folders.'
            )}
          </p>
        </div>
      </div>
      <Button
        type="button"
        variant="outline"
        size="sm"
        className="shrink-0 gap-1.5"
        disabled={ready || requesting || checking}
        onClick={() => void handleOpenFullDiskAccess()}
      >
        <FullDiskAccessButtonIcon ready={ready} requesting={requesting} />
        {getFullDiskAccessButtonLabel({ ready, requesting })}
      </Button>
    </div>
  )
}
