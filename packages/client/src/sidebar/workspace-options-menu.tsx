import { DEFAULT_SHOW_SLEEPING_WORKSPACES } from '@yiru/protocol/settings/workspace-preferences'
import { translate } from '~renderer/i18n/i18n'
import { SlidersHorizontal } from '~renderer/icons/hugeicons'
import { useProjectCatalog } from '~renderer/project-catalog/provider'
import { useAppStore } from '~renderer/store/state'
import { Button } from '~renderer/ui/button'
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuRadioGroup,
  DropdownMenuRadioItem,
  DropdownMenuSeparator,
  DropdownMenuSub,
  DropdownMenuSubContent,
  DropdownMenuSubTrigger,
  DropdownMenuTrigger
} from '~renderer/ui/dropdown-menu'
import { Tooltip, TooltipContent, TooltipTrigger } from '~renderer/ui/tooltip'

import { getSidebarHostVisibilityLabel, shouldShowHostScopeControls } from './host-options'
import { SidebarHostScopeMenuSection } from './host-scope-menu-section'
import SidebarRepositoryFilterSection from './repository-filter-section'
import { useSidebarHostScopeOptions } from './use-sidebar-host-scope-options'
import SidebarWorkspaceFilterSection from './workspace-filter-section'
import { PROJECT_ORDER_OPTIONS, SORT_OPTIONS } from './workspace-option-items'
import { WorktreeCardDisplayMenuSection } from './worktree-card/display-menu-section'

const SidebarWorkspaceOptionsMenu = function SidebarWorkspaceOptionsMenu() {
  const showSleepingWorkspaces = useAppStore((s) => s.showSleepingWorkspaces)
  const hideDefaultBranchWorkspace = useAppStore((s) => s.hideDefaultBranchWorkspace)
  const filterRepoIds = useAppStore((s) => s.filterRepoIds)
  const { repos } = useProjectCatalog()
  const setWorkspaceHostScope = useAppStore((s) => s.setWorkspaceHostScope)
  const visibleWorkspaceHostIds = useAppStore((s) => s.visibleWorkspaceHostIds)
  const setVisibleWorkspaceHostIds = useAppStore((s) => s.setVisibleWorkspaceHostIds)
  const sortBy = useAppStore((s) => s.sortBy)
  const setSortBy = useAppStore((s) => s.setSortBy)
  const projectOrderBy = useAppStore((s) => s.projectOrderBy)
  const setProjectOrderBy = useAppStore((s) => s.setProjectOrderBy)

  const { hostOptions } = useSidebarHostScopeOptions()
  const showHostScopeControls = shouldShowHostScopeControls(hostOptions)

  // Why: derive from current repos so stale ids (e.g. lingering after a repo
  // is removed) don't inflate counts or falsely signal an applied filter.
  const selectedCount = (() => {
    let count = 0
    for (const repo of repos) {
      if (filterRepoIds.includes(repo.id)) {
        count += 1
      }
    }
    return count
  })()
  const hasRepoFilter = selectedCount > 0
  const hasSleepingFilter = showSleepingWorkspaces !== DEFAULT_SHOW_SLEEPING_WORKSPACES
  const hasHostVisibilityFilter = visibleWorkspaceHostIds !== null
  const hasAnyFilter =
    hasSleepingFilter || hideDefaultBranchWorkspace || hasRepoFilter || hasHostVisibilityFilter
  const activeFilterCount =
    (hasSleepingFilter ? 1 : 0) +
    (hideDefaultBranchWorkspace ? 1 : 0) +
    (hasHostVisibilityFilter ? 1 : 0) +
    selectedCount
  const activeFilterLabel = `${activeFilterCount} ${activeFilterCount === 1 ? 'filter' : 'filters'}`
  const sortLabel = SORT_OPTIONS.find((opt) => opt.id === sortBy)?.label ?? 'Sort'
  const projectOrderLabel =
    PROJECT_ORDER_OPTIONS.find((opt) => opt.id === projectOrderBy)?.label ?? 'Manual'
  const hostVisibilityLabel = getSidebarHostVisibilityLabel(visibleWorkspaceHostIds, hostOptions)

  return (
    <DropdownMenu modal={false}>
      <Tooltip>
        <TooltipTrigger
          render={
            <DropdownMenuTrigger
              render={
                <Button
                  variant="ghost"
                  size="icon-xs"
                  type="button"
                  className="relative"
                  aria-label={
                    hasAnyFilter
                      ? translate(
                          'auto.components.sidebar.SidebarWorkspaceOptionsMenu.bc96dbd041',
                          'Workspace options ({{value0}} active)',
                          { value0: activeFilterLabel }
                        )
                      : translate(
                          'auto.components.sidebar.SidebarWorkspaceOptionsMenu.9919ae1082',
                          'Workspace options'
                        )
                  }
                >
                  <SlidersHorizontal className="size-3.5" />
                  {hasAnyFilter && (
                    // Why: this combined options button now owns filtering, so it
                    // needs the same at-a-glance signal that the old filter button had.
                    <span
                      aria-hidden
                      className="bg-primary text-primary-foreground absolute -top-0.5 -right-0.5 flex h-3 min-w-3 items-center justify-center px-0.5 text-[9px] leading-none font-medium"
                    >
                      {activeFilterCount > 9 ? '9+' : activeFilterCount}
                    </span>
                  )}
                </Button>
              }
            />
          }
        />
        <TooltipContent side="bottom" sideOffset={6}>
          {hasAnyFilter
            ? translate(
                'auto.components.sidebar.SidebarWorkspaceOptionsMenu.bc96dbd041',
                'Workspace options ({{value0}})',
                { value0: activeFilterLabel }
              )
            : translate(
                'auto.components.sidebar.SidebarWorkspaceOptionsMenu.9919ae1082',
                'Workspace options'
              )}
        </TooltipContent>
      </Tooltip>
      <DropdownMenuContent side="right" align="start" sideOffset={8} className="w-72 pb-2">
        {showHostScopeControls && (
          <SidebarHostScopeMenuSection
            hostOptionsCount={hostOptions.length}
            hostVisibilityLabel={hostVisibilityLabel}
            hostOptions={hostOptions}
            setWorkspaceHostScope={setWorkspaceHostScope}
            visibleWorkspaceHostIds={visibleWorkspaceHostIds}
            setVisibleWorkspaceHostIds={setVisibleWorkspaceHostIds}
          />
        )}

        <DropdownMenuSub>
          <DropdownMenuSubTrigger>
            <span className="flex flex-1 items-center justify-between">
              <span>
                {translate(
                  'auto.components.sidebar.SidebarWorkspaceOptionsMenu.7bada3b1ab',
                  'Sort by'
                )}
              </span>
              <span className="text-muted-foreground text-[11px] font-medium">{sortLabel}</span>
            </span>
          </DropdownMenuSubTrigger>
          <DropdownMenuSubContent className="w-44">
            <DropdownMenuRadioGroup
              value={sortBy}
              onValueChange={(v) => setSortBy(v as typeof sortBy)}
            >
              {SORT_OPTIONS.map((opt) => {
                const radioItem = (
                  <DropdownMenuRadioItem
                    key={opt.id}
                    value={opt.id}
                    // Keep the menu open so people can compare sort modes and
                    // toggle card properties without reopening the same panel.
                    onClick={(e) => e.preventDefault()}
                    closeOnClick={false}
                  >
                    {opt.label}
                  </DropdownMenuRadioItem>
                )
                if (!opt.description) {
                  return radioItem
                }
                return (
                  <Tooltip key={opt.id}>
                    <TooltipTrigger render={radioItem} />
                    <TooltipContent side="right" sideOffset={6}>
                      {opt.description}
                    </TooltipContent>
                  </Tooltip>
                )
              })}
            </DropdownMenuRadioGroup>
          </DropdownMenuSubContent>
        </DropdownMenuSub>

        <DropdownMenuSub>
          <DropdownMenuSubTrigger>
            <span className="flex flex-1 items-center justify-between">
              <span>
                {translate(
                  'auto.components.sidebar.SidebarWorkspaceOptionsMenu.09faabd875',
                  'Project order'
                )}
              </span>
              <span className="text-muted-foreground text-[11px] font-medium">
                {projectOrderLabel}
              </span>
            </span>
          </DropdownMenuSubTrigger>
          <DropdownMenuSubContent className="w-44">
            <DropdownMenuRadioGroup
              value={projectOrderBy}
              onValueChange={(v) => setProjectOrderBy(v as typeof projectOrderBy)}
            >
              {PROJECT_ORDER_OPTIONS.map((opt) => (
                <Tooltip key={opt.id}>
                  <TooltipTrigger
                    render={
                      <DropdownMenuRadioItem
                        value={opt.id}
                        // Keep the menu open so people can compare order modes.
                        onClick={(e) => e.preventDefault()}
                        closeOnClick={false}
                      >
                        {opt.label}
                      </DropdownMenuRadioItem>
                    }
                  />
                  <TooltipContent side="right" sideOffset={6}>
                    {opt.description}
                  </TooltipContent>
                </Tooltip>
              ))}
            </DropdownMenuRadioGroup>
          </DropdownMenuSubContent>
        </DropdownMenuSub>

        <WorktreeCardDisplayMenuSection />

        <DropdownMenuSeparator />
        <SidebarWorkspaceFilterSection />

        <DropdownMenuSeparator />
        <SidebarRepositoryFilterSection />
      </DropdownMenuContent>
    </DropdownMenu>
  )
}

export default SidebarWorkspaceOptionsMenu
