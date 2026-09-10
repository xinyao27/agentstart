import type { DiscoveredSkill, SkillDiscoveryResult } from '@agentstart/protocol'
import { useEffect, useState } from 'react'
import { toast } from 'sonner'
import { translate } from '~renderer/i18n/i18n'
import { BookOpen, ArrowClockwise as RefreshCw, X } from '~renderer/icons/hugeicons'
import { LoadingIndicator } from '~renderer/loading/indicator'
import { useEventCallback } from '~renderer/react/use-event-callback'
import { useMountedRef } from '~renderer/react/use-mounted-ref'
import { INSTALLED_AGENT_SKILLS_CHANGED_EVENT } from '~renderer/runtime/installed-agent-skill-discovery-state'
import { discoverSkills } from '~renderer/runtime/skill-manage-client'
import { skillDirectoryName } from '~renderer/skills/installation'
import { useAppStore } from '~renderer/store/state'
import { Button } from '~renderer/ui/button'
import { Tabs, TabsContent, TabsList, TabsTrigger } from '~renderer/ui/tabs'
import { Tooltip, TooltipContent, TooltipTrigger } from '~renderer/ui/tooltip'

import { filterSkills, type SkillsFilterState } from './filter'
import { SkillInstallDialog, type SkillInstallRequest } from './install-dialog'
import { SkillsInstalledPane } from './installed-pane'
import { SkillsMarketplace, SkillsMarketplaceActions } from './marketplace'
import { SKILLS_MARKETPLACE_URL, skillsMarketplaceInstallTarget } from './marketplace-url'
import { SkillRemoveDialog } from './remove-dialog'
import { useSkillUpdateRun } from './skill-update-run-store'
import { useSkillFreshness } from './use-skill-freshness'

const EMPTY_SKILLS: DiscoveredSkill[] = []
const EMPTY_NAMES: string[] = []

type SkillsPageView = 'installed' | 'marketplace'

export default function SkillsPage(): React.JSX.Element {
  const closeSkillsPage = useAppStore((s) => s.closeSkillsPage)
  const [result, setResult] = useState<SkillDiscoveryResult | null>(null)
  const [loading, setLoading] = useState(true)
  const [view, setView] = useState<SkillsPageView>('installed')
  const [installRequest, setInstallRequest] = useState<SkillInstallRequest | null>(null)
  const [removeTarget, setRemoveTarget] = useState<DiscoveredSkill | null>(null)
  // Why: the marketplace install actions sit in the tab strip so the guest fills
  // the tab with nothing but skills.sh, which means the page owns the URL the
  // embedded registry reports.
  const [marketplaceUrl, setMarketplaceUrl] = useState(SKILLS_MARKETPLACE_URL)
  const [filters, setFilters] = useState<SkillsFilterState>({
    query: '',
    sourceKind: 'all',
    provider: 'all'
  })
  const mountedRef = useMountedRef()
  const freshness = useSkillFreshness()
  const run = useSkillUpdateRun()

  const loadSkills = useEventCallback(async (): Promise<void> => {
    setLoading(true)
    try {
      const nextResult = await discoverSkills()
      if (mountedRef.current) {
        setResult(nextResult)
      }
    } catch (error) {
      console.error('Failed to discover skills:', error)
      if (mountedRef.current) {
        toast.error(
          translate('auto.components.skills.SkillsPage.ea72d6185b', 'Could not scan local skills')
        )
      }
    } finally {
      if (mountedRef.current) {
        setLoading(false)
      }
    }
  })

  useEffect(() => {
    void loadSkills()
  }, [loadSkills])

  useEffect(() => {
    // Why: every manage run announces itself here when it settles, so the list
    // reflects an install or removal without the user hitting Refresh.
    const handleInstalledSkillsChanged = (): void => {
      void loadSkills()
    }
    window.addEventListener(INSTALLED_AGENT_SKILLS_CHANGED_EVENT, handleInstalledSkillsChanged)
    return () =>
      window.removeEventListener(INSTALLED_AGENT_SKILLS_CHANGED_EVENT, handleInstalledSkillsChanged)
  }, [loadSkills])

  useEffect(() => {
    const hasVisibleOverlay = (): boolean =>
      Array.from(
        document.querySelectorAll('[role="dialog"], [role="listbox"], [role="menu"]')
      ).some((element) => {
        if (!(element instanceof HTMLElement)) {
          return false
        }
        if (element.closest('[aria-hidden="true"]')) {
          return false
        }
        const style = window.getComputedStyle(element)
        return (
          style.display !== 'none' &&
          style.visibility !== 'hidden' &&
          element.getClientRects().length > 0
        )
      })

    const handleKeyDown = (event: KeyboardEvent): void => {
      if (event.key !== 'Escape') {
        return
      }
      // Why: menus and dialogs own Escape before page-level navigation.
      if (hasVisibleOverlay()) {
        return
      }
      const target = event.target as HTMLElement | null
      if (
        target?.matches('input, textarea, select, [contenteditable="true"], [contenteditable=""]')
      ) {
        return
      }
      event.preventDefault()
      closeSkillsPage()
    }

    // Why: tooltips can consume Escape before bubble listeners see it. Capture
    // keeps page-level back navigation reliable when no overlay is active.
    window.addEventListener('keydown', handleKeyDown, { capture: true })
    return () => window.removeEventListener('keydown', handleKeyDown, { capture: true })
  }, [closeSkillsPage])

  const skills = result?.skills ?? EMPTY_SKILLS
  const visibleSkills = (() => filterSkills(skills, filters))()
  const eligibleUpdateNames = freshness.inventory?.eligibleUpdateNames ?? EMPTY_NAMES
  const updatableNames = (() => new Set(eligibleUpdateNames))()
  // Why: the update button starts a run named by install directory, so
  // eligibility has to be judged on that same name.
  const isUpdatable = (skill: DiscoveredSkill): boolean =>
    updatableNames.has(skillDirectoryName(skill))
  const busy = run.state === 'running'

  return (
    <main className="bg-background text-foreground relative flex h-full min-h-0 flex-col">
      <header className="flex shrink-0 items-center justify-between py-2.5 pr-5 pl-2">
        <div className="flex items-center gap-2">
          <Tooltip>
            <TooltipTrigger
              render={
                <Button
                  variant="ghost"
                  size="icon-sm"
                  onClick={closeSkillsPage}
                  aria-label={translate(
                    'auto.components.skills.SkillsPage.closeSkills',
                    'Close skills'
                  )}
                >
                  <X className="size-4" />
                </Button>
              }
            />
            <TooltipContent side="bottom" sideOffset={6}>
              {translate('auto.components.skills.SkillsPage.closeShortcut', 'Close · Esc')}
            </TooltipContent>
          </Tooltip>
          <div className="bg-border/50 mx-1 h-5 w-px" aria-hidden />
          <BookOpen className="text-muted-foreground size-4" />
          <h1 className="text-sm font-semibold">
            {translate('auto.components.skills.SkillsPage.f43ad6edf3', 'Skills')}
          </h1>
        </div>
        <div className="flex items-center gap-2">
          <Tooltip>
            <TooltipTrigger
              render={
                <Button
                  variant="outline"
                  size="icon-sm"
                  aria-label={translate(
                    'auto.components.skills.SkillsPage.refreshSkills',
                    'Refresh skills'
                  )}
                  onClick={() => void loadSkills()}
                  disabled={loading}
                >
                  {loading ? (
                    <LoadingIndicator className="size-4" />
                  ) : (
                    <RefreshCw className="size-4" />
                  )}
                </Button>
              }
            />
            <TooltipContent side="bottom" sideOffset={6}>
              {translate('auto.components.skills.SkillsPage.refreshSkills', 'Refresh skills')}
            </TooltipContent>
          </Tooltip>
        </div>
      </header>

      <Tabs
        value={view}
        onValueChange={(value) => setView(value as SkillsPageView)}
        className="min-h-0 flex-1 gap-0"
      >
        <div className="border-border flex shrink-0 items-center justify-between gap-3 border-b px-5 py-2">
          <TabsList variant="line" className="h-8">
            <TabsTrigger value="installed">
              {translate('auto.components.skills.SkillsPage.installedTab', 'Installed')}
            </TabsTrigger>
            <TabsTrigger value="marketplace">
              {translate('auto.components.skills.SkillsPage.marketplaceTab', 'Browse marketplace')}
            </TabsTrigger>
          </TabsList>
          {view === 'marketplace' ? (
            <SkillsMarketplaceActions
              installTarget={skillsMarketplaceInstallTarget(marketplaceUrl)}
              onInstall={setInstallRequest}
            />
          ) : null}
        </div>

        <TabsContent value="installed" className="flex min-h-0 flex-col">
          <SkillsInstalledPane
            skills={skills}
            visibleSkills={visibleSkills}
            filters={filters}
            onFiltersChange={setFilters}
            loading={loading}
            onRefresh={() => void loadSkills()}
            busy={busy}
            onRemove={setRemoveTarget}
            isUpdatable={isUpdatable}
          />
        </TabsContent>

        <TabsContent value="marketplace" className="flex min-h-0 flex-col">
          <SkillsMarketplace onUrlChange={setMarketplaceUrl} />
        </TabsContent>
      </Tabs>

      {installRequest ? (
        <SkillInstallDialog
          // Why: the form seeds itself from the request, so a new pick must
          // remount rather than mirror the prop into state.
          key={`${installRequest.source}:${installRequest.skillName}`}
          request={installRequest}
          onOpenChange={() => setInstallRequest(null)}
        />
      ) : null}
      {removeTarget ? (
        <SkillRemoveDialog
          key={removeTarget.id}
          skill={removeTarget}
          onOpenChange={() => setRemoveTarget(null)}
        />
      ) : null}
    </main>
  )
}
