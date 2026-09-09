import { ALL_EXECUTION_HOSTS_SCOPE, type ExecutionHostId } from '@yiru/protocol/host/identity'
import type { VisibleWorkspaceHostIds, WorkspaceHostScope } from '@yiru/protocol/settings/ui-state'
import type React from 'react'
import { translate } from '~renderer/i18n/i18n'
import {
  DropdownMenuCheckboxItem,
  DropdownMenuLabel,
  DropdownMenuSeparator,
  DropdownMenuSub,
  DropdownMenuSubContent,
  DropdownMenuSubTrigger
} from '~renderer/ui/dropdown-menu'

import { getSidebarHostHealthLabel, type SidebarHostOption } from './host-options'

type SidebarHostScopeMenuSectionProps = {
  hostOptionsCount: number
  hostVisibilityLabel: string
  hostOptions: readonly SidebarHostOption[]
  setWorkspaceHostScope: (scope: WorkspaceHostScope) => void
  visibleWorkspaceHostIds: VisibleWorkspaceHostIds
  setVisibleWorkspaceHostIds: (ids: VisibleWorkspaceHostIds) => void
}

function getHostMetadata(host: SidebarHostOption): string {
  const healthLabel = getSidebarHostHealthLabel(host.health)
  if (host.kind === 'local') {
    return host.detail
  }
  const presenceLabel =
    host.presence === 'active'
      ? translate(
          'auto.components.sidebar.SidebarWorkspaceOptionsMenu.activeRuntimeHost',
          'Active host'
        )
      : translate(
          'auto.components.sidebar.SidebarWorkspaceOptionsMenu.projectRuntimeHost',
          'Project host'
        )
  return `${presenceLabel} · ${healthLabel}`
}

export function SidebarHostScopeMenuSection({
  hostOptionsCount,
  hostVisibilityLabel,
  hostOptions,
  setWorkspaceHostScope,
  visibleWorkspaceHostIds,
  setVisibleWorkspaceHostIds
}: SidebarHostScopeMenuSectionProps): React.JSX.Element {
  const allVisible = !visibleWorkspaceHostIds
  const visibleHostIdSet = new Set(visibleWorkspaceHostIds ?? [])

  const toggleAllHosts = (): void => {
    if (!allVisible) {
      setWorkspaceHostScope(ALL_EXECUTION_HOSTS_SCOPE)
      return
    }
    const firstHost = hostOptions[0]
    if (firstHost) {
      setVisibleWorkspaceHostIds([firstHost.id])
    }
  }

  const toggleHost = (hostId: ExecutionHostId): void => {
    if (allVisible) {
      setVisibleWorkspaceHostIds([hostId])
      return
    }
    const next = new Set(visibleHostIdSet)
    if (next.has(hostId)) {
      if (next.size <= 1) {
        return
      }
      next.delete(hostId)
    } else {
      next.add(hostId)
    }
    setVisibleWorkspaceHostIds(next.size === hostOptions.length ? null : [...next])
  }

  return (
    <>
      <DropdownMenuLabel>
        {translate('auto.components.sidebar.SidebarWorkspaceOptionsMenu.hosts', 'Hosts')}
      </DropdownMenuLabel>
      <DropdownMenuSub>
        <DropdownMenuSubTrigger>
          <span className="flex flex-1 items-center justify-between gap-3">
            <span className="min-w-0 truncate">{hostVisibilityLabel}</span>
            <span className="text-muted-foreground text-[11px] font-medium">
              {hostOptionsCount}
            </span>
          </span>
        </DropdownMenuSubTrigger>
        <DropdownMenuSubContent className="w-56">
          <DropdownMenuCheckboxItem
            checked={allVisible}
            onCheckedChange={toggleAllHosts}
            onClick={(e) => e.preventDefault()}
            className="min-h-11 items-start py-1.5"
            closeOnClick={false}
          >
            <span className="flex min-w-0 flex-col gap-0.5">
              <span className="truncate">
                {translate('auto.components.sidebar.sidebarHostOptions.3e102f111c', 'All hosts')}
              </span>
              <span className="text-muted-foreground truncate text-[11px] font-normal">
                {translate(
                  'auto.components.sidebar.SidebarWorkspaceOptionsMenu.allHostsDetail',
                  'Show every host'
                )}
              </span>
            </span>
          </DropdownMenuCheckboxItem>
          {hostOptions.map((host) => (
            <DropdownMenuCheckboxItem
              key={host.id}
              checked={visibleHostIdSet.has(host.id)}
              disabled={!allVisible && visibleHostIdSet.has(host.id) && visibleHostIdSet.size <= 1}
              onCheckedChange={() => toggleHost(host.id)}
              onClick={(e) => e.preventDefault()}
              className="min-h-11 items-start py-1.5"
              closeOnClick={false}
            >
              <span className="flex min-w-0 flex-col gap-0.5">
                <span className="truncate">{host.label}</span>
                <span className="text-muted-foreground text-[11px] font-normal">
                  {getHostMetadata(host)}
                </span>
              </span>
            </DropdownMenuCheckboxItem>
          ))}
        </DropdownMenuSubContent>
      </DropdownMenuSub>

      <DropdownMenuSeparator />
    </>
  )
}
