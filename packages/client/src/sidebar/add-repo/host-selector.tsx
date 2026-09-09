import type { ExecutionHostId } from '@yiru/protocol/host/identity'
import { translate } from '~renderer/i18n/i18n'
import { Check, CaretUpDown as ChevronsUpDown } from '~renderer/icons/hugeicons'
import { describeRuntimeCompatBlock } from '~renderer/runtime/compatibility-message'
import { Button } from '~renderer/ui/button'
import { cn } from '~renderer/ui/class-names'
import { Command, CommandItem, CommandList } from '~renderer/ui/command'
import { Popover, PopoverContent, PopoverTrigger } from '~renderer/ui/popover'

import type { SidebarHostOption } from '../host-options'
import { getSidebarHostHealthLabel, shouldShowHostScopeControls } from '../host-options'
import { canSelectAddRepoHost } from './host-availability'

type AddRepoHostSelectorProps = {
  hosts: SidebarHostOption[]
  selectedHostId: ExecutionHostId
  open: boolean
  onOpenChange: (open: boolean) => void
  onSelectHost: (hostId: ExecutionHostId) => void
}

function getHostStatusDetail(host: SidebarHostOption): string {
  if (host.compatibility?.kind === 'blocked') {
    return describeRuntimeCompatBlock(host.compatibility)
  }
  return `${getSidebarHostHealthLabel(host.health)}${host.detail ? ` - ${host.detail}` : ''}`
}

export function AddRepoHostSelector({
  hosts,
  selectedHostId,
  open,
  onOpenChange,
  onSelectHost
}: AddRepoHostSelectorProps): React.JSX.Element | null {
  if (!shouldShowHostScopeControls(hosts)) {
    return null
  }

  const selectedHost = hosts.find((host) => host.id === selectedHostId) ?? hosts[0]
  if (!selectedHost) {
    return null
  }
  return (
    <div className="flex items-center gap-2 text-xs">
      <span className="text-muted-foreground font-medium">
        {translate('auto.components.sidebar.AddRepoHostSelector.host', 'Host')}
      </span>
      <Popover open={open} onOpenChange={onOpenChange}>
        <PopoverTrigger
          render={
            <Button
              type="button"
              variant="ghost"
              role="combobox"
              aria-expanded={open}
              className="border-border bg-muted/30 text-foreground hover:bg-accent hover:text-accent-foreground h-7 max-w-[18rem] min-w-0 gap-1.5 border px-2 text-xs font-medium"
            >
              <span className="min-w-0 truncate">{selectedHost.label}</span>
              {selectedHost.health !== 'local' ? (
                <span
                  title={getHostStatusDetail(selectedHost)}
                  className="text-muted-foreground shrink-0 text-[11px] font-normal"
                >
                  {getSidebarHostHealthLabel(selectedHost.health)}
                </span>
              ) : null}
              <ChevronsUpDown className="size-3.5 shrink-0 opacity-50" />
            </Button>
          }
        />
        <PopoverContent
          align="start"
          className="w-[min(340px,calc(100vw-1rem))] min-w-[var(--radix-popover-trigger-width)] p-0"
        >
          <Command>
            <CommandList>
              {hosts.map((host) => {
                const selected = host.id === selectedHostId
                const disabled = !canSelectAddRepoHost(host)
                return (
                  <CommandItem
                    key={host.id}
                    value={`${host.label} ${host.detail}`}
                    disabled={disabled}
                    aria-disabled={disabled}
                    onSelect={() => {
                      if (disabled) {
                        return
                      }
                      onSelectHost(host.id)
                      onOpenChange(false)
                    }}
                    className={cn(
                      'items-start gap-2 px-3 py-2 text-xs',
                      disabled && 'cursor-not-allowed opacity-55'
                    )}
                  >
                    <Check
                      className={cn(
                        'mt-0.5 size-3 text-muted-foreground',
                        selected ? 'opacity-70' : 'opacity-0'
                      )}
                    />
                    <span className="min-w-0 flex-1">
                      <span className="flex min-w-0 items-center gap-2">
                        <span className="truncate font-medium">{host.label}</span>
                      </span>
                      <span className="text-muted-foreground mt-0.5 block truncate text-[11px]">
                        <span className="min-w-0 flex-1 truncate">{getHostStatusDetail(host)}</span>
                      </span>
                    </span>
                  </CommandItem>
                )
              })}
            </CommandList>
          </Command>
        </PopoverContent>
      </Popover>
    </div>
  )
}
