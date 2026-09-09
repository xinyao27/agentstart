import type { WorkspacePort } from '@yiru/protocol'
import { useState } from 'react'
import { toast } from 'sonner'
import type { WebLinkMouseEvent } from '~renderer/browser/link-gesture'
import { translate } from '~renderer/i18n/i18n'
import { HardDrives as Server, ArrowClockwise as RefreshCw } from '~renderer/icons/hugeicons'
import { LoadingIndicator } from '~renderer/loading/indicator'
import {
  killWorkspacePortForTarget,
  openWorkspacePortInBrowser,
  refreshWorkspacePortScanAfterStop,
  resolvePortOpenInYiruBrowser,
  scanWorkspacePortsForTarget,
  workspacePortRuntimeTargetKey
} from '~renderer/ports/actions'
import { resolveLocalhostLabelRouteForPort } from '~renderer/ports/localhost-label-selector'
import { getActiveRuntimeTarget } from '~renderer/runtime/rpc-client'
import { useActiveWorktree, useRepoById } from '~renderer/store/selectors'
import { useAppStore } from '~renderer/store/state'
import { Button } from '~renderer/ui/button'
import { Tooltip, TooltipContent, TooltipTrigger } from '~renderer/ui/tooltip'
import { getRuntimeEnvironmentIdForWorktree } from '~renderer/worktree/runtime-owner'

import { LocalWorkspacePortDetailsDialog } from './local-workspace-port-details-dialog'
import { LocalWorkspacePortSection } from './local-workspace-port-list'
import { getLocalWorkspacePortSections } from './local-workspace-port-sections'
import { RIGHT_SIDEBAR_BUTTON_SURFACE_CLASS_NAME } from './right-sidebar-button-styles'

export function LocalWorkspacePortsPanel({ isVisible }: { isVisible: boolean }): React.JSX.Element {
  const activeWorktree = useActiveWorktree()
  const activeRepo = useRepoById(activeWorktree?.repoId ?? null)
  const settings = useAppStore((state) => state.settings)
  const createBrowserTab = useAppStore((state) => state.createBrowserTab)
  const setRemoteBrowserPageHandle = useAppStore((state) => state.setRemoteBrowserPageHandle)
  const scansByKey = useAppStore((state) => state.workspacePortScansByKey)
  const refreshing = useAppStore((state) => state.workspacePortScanRefreshing)
  const setWorkspacePortScan = useAppStore((state) => state.setWorkspacePortScan)
  const setWorkspacePortScanForKey = useAppStore((state) => state.setWorkspacePortScanForKey)
  const setWorkspacePortScanRefreshing = useAppStore(
    (state) => state.setWorkspacePortScanRefreshing
  )
  const [detailsPort, setDetailsPort] = useState<WorkspacePort | null>(null)
  const [collapsedSections, setCollapsedSections] = useState<Record<string, boolean>>({
    other: true,
    external: true
  })

  const runtimeTarget = (() => {
    const activeRuntimeEnvironmentId = getRuntimeEnvironmentIdForWorktree(
      useAppStore.getState(),
      activeWorktree?.id
    )
    // Why: Ports actions must follow the active workspace owner, not sidebar focus.
    return getActiveRuntimeTarget({ ...settings, activeRuntimeEnvironmentId })
  })()
  const scanKey = `${workspacePortRuntimeTargetKey(runtimeTarget)}:all`

  const refresh = () => {
    if (!activeRepo) {
      return Promise.resolve()
    }
    setWorkspacePortScanRefreshing(true)
    return scanWorkspacePortsForTarget(runtimeTarget)
      .then((nextScan) => {
        setWorkspacePortScanForKey(scanKey, nextScan)
        setWorkspacePortScan({ key: scanKey, result: nextScan })
      })
      .catch((error) => {
        const message = error instanceof Error ? error.message : String(error)
        toast.error(
          translate(
            'auto.components.right.sidebar.PortsPanel.a00f3a2840',
            'Failed to refresh ports'
          ),
          {
            description:
              message ||
              translate(
                'auto.components.right.sidebar.PortsPanel.740aca88ab',
                'Workspace port scan failed.'
              )
          }
        )
      })
      .finally(() => setWorkspacePortScanRefreshing(false))
  }

  // Why: the scanner owns polling; visibility only scopes its shared result.
  const displayScan = isVisible ? (scansByKey[scanKey] ?? null) : null
  const toggleSection = (sectionId: string) => {
    setCollapsedSections((current) => ({ ...current, [sectionId]: !current[sectionId] }))
  }
  const handleStopPort = async (port: WorkspacePort) => {
    if (!activeRepo || !port.pid) {
      return
    }
    const result = await killWorkspacePortForTarget(runtimeTarget, {
      repoId: activeRepo.id,
      pid: port.pid,
      port: port.port
    })
    if (!result.ok) {
      toast.error(result.reason)
      return
    }
    toast.success(
      translate(
        'auto.components.right.sidebar.PortsPanel.97b562d21d',
        'Stopped process on :{{value0}}',
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
        translate('auto.components.right.sidebar.PortsPanel.a00f3a2840', 'Failed to refresh ports'),
        { description: refreshResult.reason }
      )
    }
  }
  const handleOpenPortInBrowser = async (port: WorkspacePort, event?: WebLinkMouseEvent) => {
    const result = await openWorkspacePortInBrowser({
      port,
      activeWorktreeId: activeWorktree?.id,
      runtimeTarget,
      createBrowserTab,
      setRemoteBrowserPageHandle,
      openInYiruBrowser: resolvePortOpenInYiruBrowser({
        event
      }),
      localhostLabelRoute: resolveLocalhostLabelRouteForPort(useAppStore.getState(), port)
    })
    if (!result.ok) {
      toast.error(
        translate('auto.components.right.sidebar.PortsPanel.98e9a414f8', 'Failed to open browser'),
        { description: result.reason }
      )
    }
  }
  const sections = (() =>
    getLocalWorkspacePortSections(displayScan, activeRepo?.id, activeWorktree?.id))()

  if (!activeRepo) {
    return <NoWorkspaceSelected />
  }
  const sectionProps = {
    onStopPort: (port: WorkspacePort) => void handleStopPort(port),
    onShowDetails: setDetailsPort,
    onOpenInBrowser: handleOpenPortInBrowser
  }
  const noPorts =
    sections.activePorts.length === 0 &&
    sections.otherWorkspacePorts.length === 0 &&
    sections.externalPorts.length === 0

  return (
    <div className="scrollbar-sleek flex h-full flex-col overflow-y-auto">
      <PortsHeader refreshing={refreshing} onRefresh={() => void refresh()} />
      {displayScan?.unavailableReason ? (
        <div className="text-muted-foreground border-border border-b px-3 py-2 text-xs">
          {translate(
            'auto.components.right.sidebar.PortsPanel.f59c783b7a',
            'Port scan unavailable on {{value0}}: {{value1}}',
            { value0: displayScan.platform, value1: displayScan.unavailableReason }
          )}
        </div>
      ) : (
        <>
          <LocalWorkspacePortSection
            id="active"
            title={translate(
              'auto.components.right.sidebar.PortsPanel.935dda7718',
              'Active Workspace'
            )}
            ports={sections.activePorts}
            emptyText={
              refreshing && !displayScan
                ? translate('auto.components.right.sidebar.PortsPanel.0d63d94db3', 'Scanning...')
                : translate(
                    'auto.components.right.sidebar.PortsPanel.38b16cfbef',
                    'No ports detected'
                  )
            }
            collapsed={collapsedSections.active ?? false}
            onToggle={() => toggleSection('active')}
            {...sectionProps}
          />
          <LocalWorkspacePortSection
            id="other"
            title={translate(
              'auto.components.right.sidebar.PortsPanel.4db4b5e435',
              'Other Workspaces'
            )}
            ports={sections.otherWorkspacePorts}
            collapsed={collapsedSections.other ?? false}
            onToggle={() => toggleSection('other')}
            {...sectionProps}
          />
          <LocalWorkspacePortSection
            id="external"
            title={translate('auto.components.right.sidebar.PortsPanel.d32820d3e2', 'External')}
            ports={sections.externalPorts}
            collapsed={collapsedSections.external ?? false}
            onToggle={() => toggleSection('external')}
            {...sectionProps}
          />
          {displayScan && noPorts && <NoLocalPorts />}
        </>
      )}
      <LocalWorkspacePortDetailsDialog port={detailsPort} onClose={() => setDetailsPort(null)} />
    </div>
  )
}

function PortsHeader({ refreshing, onRefresh }: { refreshing: boolean; onRefresh: () => void }) {
  const refreshLabel = translate(
    'auto.components.right.sidebar.PortsPanel.7822e3edc6',
    'Refresh Ports'
  )
  return (
    <div className="border-border flex items-center justify-between border-b px-3 py-2">
      <span className="text-muted-foreground text-[11px] font-semibold tracking-wider uppercase">
        {translate('auto.components.right.sidebar.PortsPanel.6bc058dbe1', 'Ports')}
      </span>
      <Tooltip>
        <TooltipTrigger
          render={
            <Button
              type="button"
              variant="outline"
              size="icon-xs"
              className={RIGHT_SIDEBAR_BUTTON_SURFACE_CLASS_NAME}
              onClick={onRefresh}
              disabled={refreshing}
              aria-label={refreshLabel}
            >
              {refreshing ? <LoadingIndicator size={14} /> : <RefreshCw size={14} />}
            </Button>
          }
        />
        <TooltipContent side="top" sideOffset={4}>
          {refreshLabel}
        </TooltipContent>
      </Tooltip>
    </div>
  )
}

function NoWorkspaceSelected(): React.JSX.Element {
  return (
    <div className="text-muted-foreground flex h-full flex-col items-center justify-center px-4 text-center">
      <Server size={32} className="mb-3 opacity-50" />
      <p className="text-sm">
        {translate('auto.components.right.sidebar.PortsPanel.c1b115c375', 'No workspace selected')}
      </p>
    </div>
  )
}

function NoLocalPorts(): React.JSX.Element {
  return (
    <div className="text-muted-foreground flex flex-1 flex-col items-center justify-center px-4 text-center">
      <Server size={32} className="mb-3 opacity-50" />
      <p className="text-sm">
        {translate(
          'auto.components.right.sidebar.PortsPanel.a2a9fc6899',
          'No local ports detected'
        )}
      </p>
    </div>
  )
}
