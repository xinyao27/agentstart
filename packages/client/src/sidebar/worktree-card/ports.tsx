import type { WorkspacePort } from '@yiru/protocol'
import React from 'react'
import { toast } from 'sonner'
import { translate } from '~renderer/i18n/i18n'
import {
  Plug,
  Copy,
  Trash as Trash2,
  ArrowSquareOut as ExternalLink
} from '~renderer/icons/hugeicons'
import {
  canStopWorkspacePort,
  getPortOpenBrowserTooltipLabel,
  killWorkspacePortForTarget,
  openWorkspacePortInBrowser,
  refreshWorkspacePortScanAfterStop,
  resolvePortOpenInYiruBrowser
} from '~renderer/ports/actions'
import { useLocalhostLabelRouteForPort } from '~renderer/ports/localhost-label-selector'
import { addressForPort } from '~renderer/ports/urls'
import { getActiveRuntimeTarget } from '~renderer/runtime/rpc-client'
import { shellClient } from '~renderer/runtime/shell-client'
import { useAppStore } from '~renderer/store/state'
import { Button } from '~renderer/ui/button'
import { HoverCard, HoverCardContent, HoverCardTrigger } from '~renderer/ui/hover-card'
import { SelectedTextCopyMenu } from '~renderer/ui/selected-text-copy-menu'
import { Tooltip, TooltipContent, TooltipTrigger } from '~renderer/ui/tooltip'
import { getRuntimeEnvironmentIdForWorktree } from '~renderer/worktree/runtime-owner'

import { WORKTREE_NATIVE_CONTEXT_MENU_ATTR } from '../worktree-context-menu/opening-policy'
import { WorktreeCardDetailSection, WorktreeCardDetailSectionContent } from './detail-section'

type WorktreeCardPortsProps = {
  ports: WorkspacePort[]
}

export function WorktreeCardPortsTrigger({
  ports
}: WorktreeCardPortsProps): React.JSX.Element | null {
  const recordFeatureInteraction = useAppStore((s) => s.recordFeatureInteraction)

  if (ports.length === 0) {
    return null
  }

  return (
    <Button
      variant="ghost"
      size="xs"
      type="button"
      className="text-muted-foreground/70 size-3.5 border-0 p-0"
      aria-label={translate(
        'auto.components.sidebar.WorktreeCardPorts.fed49903c9',
        '{{value0}} live {{value1}}',
        { value0: ports.length, value1: ports.length === 1 ? 'port' : 'ports' }
      )}
      onClick={(event) => {
        event.stopPropagation()
        recordFeatureInteraction('ports')
      }}
    >
      <Plug className="size-3.5" />
    </Button>
  )
}

function PortAction({
  label,
  tooltipLabel = label,
  disabled = false,
  onClick,
  children
}: {
  label: string
  tooltipLabel?: string
  disabled?: boolean
  onClick: (event: React.MouseEvent<HTMLButtonElement>) => void
  children: React.ReactNode
}): React.JSX.Element {
  const handleClick = (event: React.MouseEvent<HTMLButtonElement>): void => {
    onClick(event)
    if (event.detail > 0) {
      event.currentTarget.blur()
    }
  }

  return (
    <Tooltip>
      <TooltipTrigger
        render={
          <Button
            type="button"
            variant="quiet"
            size="icon-xs"
            disabled={disabled}
            className="disabled:text-muted-foreground/35 size-5 disabled:pointer-events-none"
            aria-label={label}
            onClick={handleClick}
          >
            {children}
          </Button>
        }
      />
      <TooltipContent side="top" sideOffset={4}>
        {tooltipLabel}
      </TooltipContent>
    </Tooltip>
  )
}

function WorktreePortRow({ port }: { port: WorkspacePort }): React.JSX.Element {
  const settings = useAppStore((s) => s.settings)
  const localhostLabelRoute = useLocalhostLabelRouteForPort(port)
  const runtimeEnvironmentId = useAppStore((s) =>
    getRuntimeEnvironmentIdForWorktree(s, port.kind === 'workspace' ? port.owner.worktreeId : null)
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
  const address = addressForPort(port)
  const canStop = canStopWorkspacePort(port)
  const openBrowserLabel = translate(
    'auto.components.sidebar.WorktreeCardPorts.33bc7d7495',
    'Open in Browser'
  )

  const handleOpen = (event: React.MouseEvent<HTMLButtonElement>) => {
    event.stopPropagation()
    recordFeatureInteraction('ports')
    const openInYiruBrowser = resolvePortOpenInYiruBrowser({
      event
    })
    void openWorkspacePortInBrowser({
      port,
      runtimeTarget,
      createBrowserTab,
      setRemoteBrowserPageHandle,
      openInYiruBrowser,
      localhostLabelRoute
    }).then((result) => {
      if (!result.ok) {
        toast.error(
          translate(
            'auto.components.sidebar.WorktreeCardPorts.d1113f4660',
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
      translate('auto.components.sidebar.WorktreeCardPorts.c89f290e25', 'Copied {{value0}}', {
        value0: address
      })
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
          'auto.components.sidebar.WorktreeCardPorts.5d1a5d51bb',
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
            'auto.components.sidebar.WorktreeCardPorts.9950fe2d20',
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
    <div className="group/port hover:bg-accent/50 grid min-w-0 grid-cols-[3.25rem_minmax(0,1fr)] items-center gap-1.5 px-1.5 py-1">
      <span className="text-foreground font-mono text-[12px] font-semibold tabular-nums select-text">
        {port.port}
      </span>
      <div className="relative flex h-5 min-w-0 items-center">
        <Tooltip>
          <TooltipTrigger
            render={
              <span className="text-muted-foreground flex min-w-0 items-baseline gap-1 overflow-hidden pr-[3.75rem] text-[11px] select-text">
                <span className="min-w-0 flex-1 truncate">{processLabel}</span>
                <span className="text-muted-foreground/45 shrink-0">-</span>
                <span className="text-muted-foreground/70 min-w-0 flex-[1.1] truncate">
                  {address}
                </span>
              </span>
            }
          />
          <TooltipContent side="top" sideOffset={4}>
            <span className="flex items-center gap-1.5">
              <span>{processLabel}</span>
              <span className="text-muted-foreground/60">-</span>
              <span>{address}</span>
            </span>
          </TooltipContent>
        </Tooltip>
        <div className="border-border/40 bg-popover can-hover:opacity-0 absolute inset-y-0 right-0 flex items-center gap-0.5 border px-0.5 transition-opacity group-focus-within/port:opacity-100 group-hover/port:opacity-100">
          <PortAction
            label={openBrowserLabel}
            tooltipLabel={getPortOpenBrowserTooltipLabel(openBrowserLabel)}
            onClick={handleOpen}
          >
            <ExternalLink className="size-3" />
          </PortAction>
          <PortAction
            label={translate(
              'auto.components.sidebar.WorktreeCardPorts.c8067a829a',
              'Copy {{value0}}',
              { value0: address }
            )}
            onClick={handleCopy}
          >
            <Copy className="size-3" />
          </PortAction>
          <PortAction
            label={translate(
              'auto.components.sidebar.WorktreeCardPorts.2f854442ff',
              'Stop Process'
            )}
            disabled={!canStop}
            onClick={handleStop}
          >
            <Trash2 className="size-3" />
          </PortAction>
        </div>
      </div>
    </div>
  )
}

export function WorktreeCardPortsDetails({
  ports
}: WorktreeCardPortsProps): React.JSX.Element | null {
  if (ports.length === 0) {
    return null
  }

  return (
    <WorktreeCardDetailSection>
      {/* Count lives inline after the label (not on the right, which is the action zone);
          the "Go to Worktree" action is omitted here since the card is already scoped to its worktree. */}
      <div className="text-muted-foreground flex items-center gap-1.5 px-1 text-[11px] font-semibold tracking-[0.05em] uppercase">
        <Plug className="size-3" />
        <span>
          {translate('auto.components.sidebar.WorktreeCardPorts.3240f320d7', 'Live Ports')}{' '}
          <span className="text-muted-foreground/70 font-normal tabular-nums">
            ({ports.length})
          </span>
        </span>
      </div>
      <WorktreeCardDetailSectionContent className="space-y-0.5">
        {ports.map((port) => (
          <WorktreePortRow key={port.id} port={port} />
        ))}
      </WorktreeCardDetailSectionContent>
    </WorktreeCardDetailSection>
  )
}

export function WorktreeCardPorts({ ports }: WorktreeCardPortsProps): React.JSX.Element | null {
  if (ports.length === 0) {
    return null
  }

  return (
    <HoverCard>
      <HoverCardTrigger
        delay={250}
        closeDelay={120}
        render={<WorktreeCardPortsTrigger ports={ports} />}
      />
      <HoverCardContent
        side="right"
        align="start"
        sideOffset={8}
        className="w-56 p-2 text-xs select-text"
        {...{ [WORKTREE_NATIVE_CONTEXT_MENU_ATTR]: '' }}
        onClick={(event) => event.stopPropagation()}
        onDoubleClick={(event) => event.stopPropagation()}
      >
        <SelectedTextCopyMenu>
          <WorktreeCardPortsDetails ports={ports} />
        </SelectedTextCopyMenu>
      </HoverCardContent>
    </HoverCard>
  )
}
