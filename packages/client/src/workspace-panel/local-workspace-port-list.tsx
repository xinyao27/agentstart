import type { WorkspacePort } from '@yiru/protocol'
import type { WebLinkMouseEvent } from '~renderer/browser/link-gesture'
import { translate } from '~renderer/i18n/i18n'
import {
  Copy,
  Trash as Trash2,
  HardDrives as Server,
  Cube as Box,
  Info,
  ArrowSquareOut as ExternalLink,
  CaretRight as ChevronRight
} from '~renderer/icons/hugeicons'
import { getPortOpenBrowserTooltipLabel } from '~renderer/ports/actions'
import { addressForPort } from '~renderer/ports/urls'
import { shellClient } from '~renderer/runtime/shell-client'
import { Button } from '~renderer/ui/button'
import { cn } from '~renderer/ui/class-names'
import {
  ContextMenu,
  ContextMenuContent,
  ContextMenuItem,
  ContextMenuLabel,
  ContextMenuSeparator,
  ContextMenuTrigger
} from '~renderer/ui/context-menu'
import { Tooltip, TooltipContent, TooltipProvider, TooltipTrigger } from '~renderer/ui/tooltip'

const MENU_CONTENT_CLASS =
  '!border-border/60 !bg-popover !text-popover-foreground !backdrop-blur-none'
const MENU_ITEM_CLASS = 'focus:bg-accent focus:text-accent-foreground dark:focus:bg-accent'
const MENU_LABEL_CLASS = 'px-2 py-1 text-[11px] font-semibold text-muted-foreground'

export function LocalWorkspacePortSection({
  id,
  title,
  ports,
  emptyText,
  collapsed,
  onToggle,
  onStopPort,
  onShowDetails,
  onOpenInBrowser
}: {
  id: string
  title: string
  ports: WorkspacePort[]
  emptyText?: string
  collapsed: boolean
  onToggle: () => void
  onStopPort: (port: WorkspacePort) => void
  onShowDetails: (port: WorkspacePort) => void
  onOpenInBrowser: (port: WorkspacePort, event?: WebLinkMouseEvent) => void
}): React.JSX.Element | null {
  if (ports.length === 0 && !emptyText) {
    return null
  }

  return (
    <div className="px-3 pt-2">
      <Button
        variant="quiet"
        size="xs"
        type="button"
        className="border-border/40 sticky top-0 z-10 mb-1 flex h-auto w-full justify-start border-b py-1 text-left font-normal whitespace-normal"
        onClick={onToggle}
        aria-expanded={!collapsed}
        aria-controls={`local-port-section-${id}`}
      >
        <ChevronRight
          size={12}
          className={cn('shrink-0 transition-transform', !collapsed && 'rotate-90')}
        />
        <span className="text-muted-foreground text-[10px] font-semibold tracking-wider uppercase">
          {title}
        </span>
        {ports.length > 0 && (
          <span className="text-muted-foreground/60 ml-1 text-[10px]">{ports.length}</span>
        )}
      </Button>
      {!collapsed && (
        <div id={`local-port-section-${id}`}>
          {ports.length > 0
            ? ports.map((port) => (
                <LocalWorkspacePortRow
                  key={port.id}
                  port={port}
                  onStop={onStopPort}
                  onShowDetails={onShowDetails}
                  onOpenInBrowser={onOpenInBrowser}
                />
              ))
            : emptyText && <div className="text-muted-foreground py-1 text-xs">{emptyText}</div>}
        </div>
      )}
    </div>
  )
}

function LocalWorkspacePortRow({
  port,
  onStop,
  onShowDetails,
  onOpenInBrowser
}: {
  port: WorkspacePort
  onStop: (port: WorkspacePort) => void
  onShowDetails: (port: WorkspacePort) => void
  onOpenInBrowser: (port: WorkspacePort, event?: WebLinkMouseEvent) => void
}): React.JSX.Element {
  const handleCopy = () => {
    void shellClient.ui.writeClipboardText(addressForPort(port))
  }
  const handleCopyButtonClick = (event: React.MouseEvent<HTMLButtonElement>) => {
    handleCopy()
    if (event.detail > 0) {
      event.currentTarget.blur()
    }
  }
  const handleOpenBrowserButtonClick = (event: React.MouseEvent<HTMLButtonElement>) => {
    onOpenInBrowser(port, event)
    if (event.detail > 0) {
      event.currentTarget.blur()
    }
  }
  const handleStopButtonClick = (event: React.MouseEvent<HTMLButtonElement>) => {
    onStop(port)
    if (event.detail > 0) {
      event.currentTarget.blur()
    }
  }
  const processLabel = port.processName ?? (port.pid ? `PID ${port.pid}` : 'Unknown process')
  const address = addressForPort(port)
  const ownerLabel =
    port.kind === 'workspace'
      ? port.owner.displayName
      : port.kind === 'container'
        ? 'Container or forwarded service'
        : 'Unassigned'
  const openBrowserLabel = translate(
    'auto.components.right.sidebar.PortsPanel.b22b128b2a',
    'Open in Browser'
  )
  const confidenceLabel =
    port.kind === 'workspace' ? (port.owner.confidence === 'cwd' ? 'cwd' : 'command') : null
  const canStopProcess = port.kind === 'workspace' && Boolean(port.pid)

  return (
    <ContextMenu>
      <div className="group hover:bg-accent/50 -mx-1 flex items-center gap-2 px-1 py-1 transition-colors">
        <ContextMenuTrigger
          render={
            <div
              className="flex min-w-0 flex-1 items-center gap-2 focus:outline-none"
              tabIndex={0}
              aria-label={translate(
                'auto.components.right.sidebar.PortsPanel.5be4f7f727',
                'Port {{value0}} menu',
                { value0: port.port }
              )}
            >
              <div className="text-muted-foreground flex size-5 shrink-0 items-center justify-center">
                {port.kind === 'container' ? <Box size={13} /> : <Server size={13} />}
              </div>
              <div className="min-w-0 flex-1">
                <div className="flex min-w-0 items-center gap-1.5">
                  <span className="text-foreground text-xs font-medium">:{port.port}</span>
                  <span className="text-muted-foreground truncate text-xs">{processLabel}</span>
                </div>
                <div className="text-muted-foreground flex min-w-0 items-center gap-1.5 text-[11px]">
                  <span className="truncate">{address}</span>
                </div>
                <div className="text-muted-foreground/70 flex min-w-0 items-center gap-1.5 text-[10px]">
                  <span className="truncate">{ownerLabel}</span>
                  {confidenceLabel && (
                    <span className="text-muted-foreground/70 shrink-0">{confidenceLabel}</span>
                  )}
                </div>
              </div>
            </div>
          }
        />
        <TooltipProvider>
          <div className="can-hover:opacity-0 flex items-center gap-0.5 transition-opacity group-focus-within:opacity-100 group-hover:opacity-100">
            <PortActionButton
              label={getPortOpenBrowserTooltipLabel(openBrowserLabel)}
              ariaLabel={openBrowserLabel}
              onClick={handleOpenBrowserButtonClick}
            >
              <ExternalLink size={13} />
            </PortActionButton>
            <PortActionButton
              label={translate(
                'auto.components.right.sidebar.PortsPanel.1004af16ab',
                'Copy {{value0}}',
                { value0: address }
              )}
              ariaLabel={translate(
                'auto.components.right.sidebar.PortsPanel.fe2730d050',
                'Copy {{value0}}',
                { value0: address }
              )}
              onClick={handleCopyButtonClick}
            >
              <Copy size={13} />
            </PortActionButton>
            {canStopProcess && (
              <PortActionButton
                label={translate(
                  'auto.components.right.sidebar.PortsPanel.f9528da632',
                  'Stop Process'
                )}
                onClick={handleStopButtonClick}
                destructive
              >
                <Trash2 size={13} />
              </PortActionButton>
            )}
          </div>
        </TooltipProvider>
      </div>
      <ContextMenuContent className={MENU_CONTENT_CLASS}>
        <ContextMenuLabel className={MENU_LABEL_CLASS}>{`:${port.port}`}</ContextMenuLabel>
        <ContextMenuItem className={MENU_ITEM_CLASS} onClick={() => onOpenInBrowser(port)}>
          <ExternalLink size={13} />
          {openBrowserLabel}
        </ContextMenuItem>
        <ContextMenuItem className={MENU_ITEM_CLASS} onClick={handleCopy}>
          <Copy size={13} />
          {translate('auto.components.right.sidebar.PortsPanel.792baeb7ed', 'Copy Address')}
        </ContextMenuItem>
        <ContextMenuItem
          className={MENU_ITEM_CLASS}
          onClick={() => void shellClient.ui.writeClipboardText(JSON.stringify(port, null, 2))}
        >
          <Copy size={13} />
          {translate('auto.components.right.sidebar.PortsPanel.bdac206faf', 'Copy Details')}
        </ContextMenuItem>
        <ContextMenuItem className={MENU_ITEM_CLASS} onClick={() => onShowDetails(port)}>
          <Info size={13} />
          {translate('auto.components.right.sidebar.PortsPanel.a223459512', 'Show Details')}
        </ContextMenuItem>
        <ContextMenuSeparator />
        <ContextMenuItem
          className={MENU_ITEM_CLASS}
          variant="destructive"
          disabled={!canStopProcess}
          onClick={() => onStop(port)}
        >
          <Trash2 size={13} />
          {translate('auto.components.right.sidebar.PortsPanel.f9528da632', 'Stop Process')}
        </ContextMenuItem>
      </ContextMenuContent>
    </ContextMenu>
  )
}

function PortActionButton({
  label,
  ariaLabel,
  onClick,
  destructive = false,
  children
}: {
  label: string
  ariaLabel?: string
  onClick: (event: React.MouseEvent<HTMLButtonElement>) => void
  destructive?: boolean
  children: React.ReactNode
}): React.JSX.Element {
  return (
    <Tooltip>
      <TooltipTrigger
        render={
          <Button
            type="button"
            variant={destructive ? 'ghost' : 'quiet'}
            size="icon-xs"
            className={destructive ? 'text-muted-foreground hover:text-destructive' : undefined}
            onClick={onClick}
            aria-label={ariaLabel ?? label}
          >
            {children}
          </Button>
        }
      />
      <TooltipContent side="top" sideOffset={4}>
        {label}
      </TooltipContent>
    </Tooltip>
  )
}
