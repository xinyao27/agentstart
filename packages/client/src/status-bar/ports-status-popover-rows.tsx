import type { WorkspacePort } from '@agentstart/protocol'
import React from 'react'
import { toast } from 'sonner'
import { translate } from '~renderer/i18n/i18n'
import {
  Copy,
  FolderOpen,
  Trash as Trash2,
  ArrowSquareOut as ExternalLink
} from '~renderer/icons/hugeicons'
import {
  addressForPort,
  canStopWorkspacePort,
  getPortOpenBrowserTooltipLabel,
  goToWorkspacePortOwner,
  killWorkspacePortForTarget,
  openWorkspacePortInBrowser,
  refreshWorkspacePortScanAfterStop,
  resolvePortOpenInAgentStartBrowser
} from '~renderer/ports/actions'
import type { WorkspacePortGroup } from '~renderer/ports/groups'
import { useLocalhostLabelRouteForPort } from '~renderer/ports/localhost-label-selector'
import { getActiveRuntimeTarget } from '~renderer/runtime/rpc-client'
import { shellClient } from '~renderer/runtime/shell-client'
import { useAppStore } from '~renderer/store/state'
import { Button } from '~renderer/ui/button'
import { Tooltip, TooltipContent, TooltipProvider, TooltipTrigger } from '~renderer/ui/tooltip'
import { getRuntimeEnvironmentIdForWorktree } from '~renderer/worktree/runtime-owner'

function PortAction({
  label,
  tooltipLabel = label,
  onClick,
  disabled,
  children
}: {
  label: string
  tooltipLabel?: string
  onClick: (event: React.MouseEvent<HTMLButtonElement>) => void
  disabled?: boolean
  children: React.ReactNode
}): React.JSX.Element {
  const handleClick = (event: React.MouseEvent<HTMLButtonElement>): void => {
    onClick(event)
    if (event.detail > 0) {
      event.currentTarget.blur()
    }
  }

  const button = (
    <Button
      type="button"
      variant="quiet"
      size="icon-xs"
      className="disabled:text-muted-foreground/35 size-5 disabled:pointer-events-none"
      aria-label={label}
      onClick={handleClick}
      disabled={disabled}
    >
      {children}
    </Button>
  )

  return (
    <TooltipProvider>
      <Tooltip>
        <TooltipTrigger
          render={disabled ? <span className="inline-flex">{button}</span> : button}
        />
        <TooltipContent side="top" sideOffset={4} className="z-[70]">
          {tooltipLabel}
        </TooltipContent>
      </Tooltip>
    </TooltipProvider>
  )
}

export function PortRow({
  port,
  activeWorktreeId,
  external
}: {
  port: WorkspacePort
  activeWorktreeId: string | null
  external?: boolean
}): React.JSX.Element {
  const settings = useAppStore((s) => s.settings)
  const localhostLabelRoute = useLocalhostLabelRouteForPort(port)
  const runtimeEnvironmentId = useAppStore((s) =>
    getRuntimeEnvironmentIdForWorktree(
      s,
      port.kind === 'workspace' ? port.owner.worktreeId : activeWorktreeId
    )
  )
  const createBrowserTab = useAppStore((s) => s.createBrowserTab)
  const setRemoteBrowserPageHandle = useAppStore((s) => s.setRemoteBrowserPageHandle)
  const setWorkspacePortScan = useAppStore((s) => s.setWorkspacePortScan)
  const setWorkspacePortScanForKey = useAppStore((s) => s.setWorkspacePortScanForKey)
  const setWorkspacePortScanRefreshing = useAppStore((s) => s.setWorkspacePortScanRefreshing)
  const recordFeatureInteraction = useAppStore((s) => s.recordFeatureInteraction)
  const runtimeTarget = (() =>
    getActiveRuntimeTarget({ ...settings, activeRuntimeEnvironmentId: runtimeEnvironmentId }))()
  const processLabel = port.processName ?? (port.pid ? `PID ${port.pid}` : 'Unknown process')
  const canStop = canStopWorkspacePort(port)
  const openBrowserLabel = translate(
    'auto.components.status.bar.ports.status.popover.rows.085f4f0334',
    'Open in Browser'
  )

  const handleOpen = (event: React.MouseEvent<HTMLButtonElement>) => {
    event.stopPropagation()
    recordFeatureInteraction('ports')
    const openInAgentStartBrowser = resolvePortOpenInAgentStartBrowser({
      event
    })
    void openWorkspacePortInBrowser({
      port,
      activeWorktreeId,
      runtimeTarget,
      createBrowserTab,
      setRemoteBrowserPageHandle,
      openInAgentStartBrowser,
      localhostLabelRoute
    }).then((result) => {
      if (!result.ok) {
        toast.error(
          translate(
            'auto.components.status.bar.ports.status.popover.rows.b854ec9ff5',
            'Failed to open browser'
          ),
          { description: result.reason }
        )
      }
    })
  }

  const handleCopy = (event: React.MouseEvent<HTMLButtonElement>) => {
    event.stopPropagation()
    recordFeatureInteraction('ports')
    const address = addressForPort(port)
    void shellClient.ui.writeClipboardText(address)
    toast.success(
      translate(
        'auto.components.status.bar.ports.status.popover.rows.480d8f2347',
        'Copied {{value0}}',
        { value0: address }
      )
    )
  }

  const handleStop = (event: React.MouseEvent<HTMLButtonElement>) => {
    event.stopPropagation()
    if (!canStopWorkspacePort(port)) {
      return
    }
    recordFeatureInteraction('ports')
    const run = async (): Promise<void> => {
      const result = await killWorkspacePortForTarget(runtimeTarget, {
        repoId: port.owner.repoId,
        pid: port.pid,
        port: port.port
      })
      if (!result.ok) {
        toast.error(result.reason)
        return
      }
      toast.success(
        translate(
          'auto.components.status.bar.ports.status.popover.rows.acdb6df590',
          'Stopped process on {{value0}}',
          { value0: port.port }
        )
      )
      const refreshResult = await refreshWorkspacePortScanAfterStop({
        runtimeTarget,
        setWorkspacePortScan,
        setWorkspacePortScanForKey,
        getWorkspacePortScansByKey: () => useAppStore.getState().workspacePortScansByKey,
        setWorkspacePortScanRefreshing
      })
      if (!refreshResult.ok) {
        toast.error(
          translate(
            'auto.components.status.bar.ports.status.popover.rows.e4a709548c',
            'Failed to refresh ports'
          ),
          {
            description: refreshResult.reason
          }
        )
      }
    }
    void run()
  }

  return (
    <div className="group/port hover:bg-accent/50 grid min-w-0 grid-cols-[4.5rem_minmax(0,1fr)] items-start gap-2 rounded-md px-2 py-1.5">
      <span className="text-foreground font-mono text-[12px] font-semibold tabular-nums select-text">
        {port.port}
      </span>
      <div className="min-w-0 space-y-0.5">
        <div className="relative flex h-5 min-w-0 items-center">
          <TooltipProvider>
            <Tooltip>
              <TooltipTrigger
                render={
                  <span className="text-muted-foreground block min-w-0 truncate text-[11px] select-text">
                    {processLabel}
                  </span>
                }
              />
              <TooltipContent side="top" sideOffset={4}>
                {processLabel}
              </TooltipContent>
            </Tooltip>
          </TooltipProvider>
          <div className="border-border/40 bg-popover can-hover:opacity-0 absolute inset-y-0 right-0 flex items-center gap-0.5 rounded-md border px-0.5 transition-opacity group-focus-within/port:opacity-100 group-hover/port:opacity-100">
            <PortAction
              label={openBrowserLabel}
              tooltipLabel={getPortOpenBrowserTooltipLabel(openBrowserLabel)}
              onClick={handleOpen}
            >
              <ExternalLink className="size-3" />
            </PortAction>
            <PortAction
              label={translate(
                'auto.components.status.bar.ports.status.popover.rows.536d48a5dc',
                'Copy {{value0}}',
                { value0: addressForPort(port) }
              )}
              onClick={handleCopy}
            >
              <Copy className="size-3" />
            </PortAction>
            <PortAction
              label={translate(
                'auto.components.status.bar.ports.status.popover.rows.0e72c8d9fb',
                'Stop Process'
              )}
              disabled={!canStop}
              onClick={handleStop}
            >
              <Trash2 className="size-3" />
            </PortAction>
          </div>
        </div>
        <div className="text-muted-foreground/70 truncate text-[10px] select-text">
          {external ? port.kind : addressForPort(port)}
        </div>
      </div>
    </div>
  )
}

export function WorkspaceGroupRows({
  group,
  activeWorktreeId
}: {
  group: WorkspacePortGroup
  activeWorktreeId: string | null
}): React.JSX.Element {
  const handleGoToWorkspace = (event: React.MouseEvent<HTMLButtonElement>) => {
    event.stopPropagation()
    const ownerPort = group.ports[0]
    if (!ownerPort || !goToWorkspacePortOwner(ownerPort)) {
      toast.error(
        translate(
          'auto.components.status.bar.ports.status.popover.rows.f2b813345f',
          'Workspace unavailable'
        )
      )
    }
  }

  return (
    <section className="border-border/40 border-t first:border-t-0">
      <div className="border-border/40 bg-popover sticky top-0 z-10 flex items-center justify-between gap-2 border-b px-3 py-2">
        <span className="text-foreground min-w-0 truncate text-[12px] font-medium">
          {group.displayName}
        </span>
        <div className="flex shrink-0 items-center gap-1">
          <PortAction
            label={translate(
              'auto.components.status.bar.ports.status.popover.rows.a49ea79246',
              'Go to Worktree'
            )}
            onClick={handleGoToWorkspace}
            disabled={group.ports.length === 0}
          >
            <FolderOpen className="size-3" />
          </PortAction>
          <span className="text-muted-foreground/70 font-mono text-[10px]">
            {group.ports.length}
          </span>
        </div>
      </div>
      <div className="px-1 pb-1">
        {group.ports.map((port) => (
          <PortRow key={port.id} port={port} activeWorktreeId={activeWorktreeId} />
        ))}
      </div>
    </section>
  )
}
