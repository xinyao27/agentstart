import type { ProjectHostSetup } from '@yiru/protocol/project/model'
import type { Repo } from '@yiru/protocol/project/repository'
import { applyDocumentTheme } from '~renderer/editor/document-theme'
import { translate } from '~renderer/i18n/i18n'
import { useProjectCatalog } from '~renderer/project-catalog/provider'
import { getRepoHostIdentity } from '~renderer/repo/state/host-identity'
import { getActiveRuntimeTarget } from '~renderer/runtime/rpc-client'
import { useAppStore } from '~renderer/store/state'
import { isMacUserAgent, isWindowsUserAgent } from '~renderer/terminal-pane/pane-interactions'
import { useSystemPrefersDark } from '~renderer/terminal-pane/use-system-prefers-dark'
import {
  getWindowsTerminalCapabilityOwnerKey,
  useWindowsTerminalCapabilities
} from '~renderer/terminal/windows/capabilities'
import { cn } from '~renderer/ui/class-names'

import { ScrollArea } from '../ui/scroll-area'
import { buildSettingsNavGroups } from './page-navigation'
import { CapabilitySections } from './page-sections/capabilities'
import { ProjectSections } from './page-sections/projects'
import { SystemSections } from './page-sections/system'
import { WorkflowSections } from './page-sections/workflows'
import {
  buildRepoIdToHostSelection,
  buildRepoIdToRepresentative,
  buildSettingsProjectList,
  getSettingsProjectHostRepo,
  removeSettingsProjectFromAllHosts
} from './project-list'
import { ActiveSettingsSectionProvider } from './section'
import { SettingsSidebar } from './sidebar'
import { useFontSuggestions } from './use-font-suggestions'
import { usePageNavigation } from './use-page-navigation'
import { usePageSections } from './use-page-sections'
import { useProjectHooks } from './use-project-hooks'
import { useScrollbackMode } from './use-scrollback-mode'
import { useSourceControlPromptGuard } from './use-source-control-prompt-guard'

const SHELL_WIDTH_CLASS = '[--settings-shell-max-width:1040px]'
const EXTENSION_SIDEBAR_BACKDROP_CLASS =
  'worktree-sidebar-theme bg-sidebar pointer-events-none absolute inset-y-0 left-0 w-[max(var(--settings-sidebar-width),calc((100%_-_var(--settings-shell-max-width))/2_+_var(--settings-sidebar-width)))]'
const SETTINGS_SHELL_ANIMATION_CLASS_NAME = 'animate-[settings-shell-enter_180ms_ease-out]'

function Settings(): React.JSX.Element {
  const settings = useAppStore((s) => s.settings)
  const keybindings = useAppStore((s) => s.keybindings)
  const updateSettings = useAppStore((s) => s.updateSettings)
  const switchRuntimeEnvironment = useAppStore((s) => s.switchRuntimeEnvironment)
  const fetchSettings = useAppStore((s) => s.fetchSettings)
  const fetchKeybindings = useAppStore((s) => s.fetchKeybindings)
  const closeSettingsPage = useAppStore((s) => s.closeSettingsPage)
  const { projectHostSetups, projects, repos } = useProjectCatalog()
  const updateProject = useAppStore((s) => s.updateProject)
  const updateRepo = useAppStore((s) => s.updateRepo)
  const removeProject = useAppStore((s) => s.removeProject)
  const settingsProjectHostSelection = useAppStore((s) => s.settingsProjectHostSelection)
  const settingsSearchInputQuery = useAppStore((s) => s.settingsSearchInputQuery)
  const settingsSearchQuery = useAppStore((s) => s.settingsSearchQuery)
  const setSettingsSearchQuery = useAppStore((s) => s.setSettingsSearchQuery)

  // Why: collapse repo rows into one entry per project (derived from repos so it
  // matches the nav metadata exactly) — the source of truth for the pane list.
  const settingsProjectList = (() => buildSettingsProjectList(repos))()
  const repoIdToRepresentative = (() => buildRepoIdToRepresentative(settingsProjectList))()
  // Why: lets a deep-link's repoId select the owning project's host so
  // host-specific subsection anchors exist under the now-selected host.
  const repoIdToHostSelection = (() => buildRepoIdToHostSelection(settingsProjectList))()
  // Why: the pane-level "Remove Project" removes the whole project (every host
  // setup), not just the selected host — the per-host remove lives inside
  // "Available Hosts".
  const removeProjectAllHosts = (setups: readonly ProjectHostSetup[]): Promise<void> =>
    removeSettingsProjectFromAllHosts(setups, removeProject)

  const systemPrefersDark = useSystemPrefersDark()
  const isWindows = isWindowsUserAgent()
  const isMac = isMacUserAgent()
  // Why: the Terminal settings section shares one search index with the
  // sidebar. We trim platform-only entries on other platforms so search never
  // reveals controls that the renderer will intentionally hide.
  const [scrollbackMode, setScrollbackMode] = useScrollbackMode(settings)
  const { fontSuggestions, ghostty, requestFontSuggestions, terminalFontSuggestions, warpThemes } =
    useFontSuggestions(updateSettings, settings)
  const {
    closeWithGuard: closeSettingsPageWithPromptGuard,
    confirmDiscard: confirmDiscardSourceControlAiPromptChanges,
    discardSignal: sourceControlAiPromptDiscardSignal,
    hasUnsavedBranchPromptChanges,
    hasUnsavedChanges: hasUnsavedSourceControlAiPromptChanges,
    setHasUnsavedBranchPromptChanges,
    setHasUnsavedCommitPromptChanges,
    writeSettings: writeSourceControlAiSettings
  } = useSourceControlPromptGuard({ closeSettingsPage, settings, updateSettings })
  const {
    getSearchEntries: getSectionSearchEntries,
    sections: navSections,
    visibleSections: visibleNavSections
  } = usePageSections({
    hasUnsavedSourceControlAiPromptChanges,
    query: settingsSearchQuery
  })
  const {
    activeSectionId,
    hiddenExperimentalUnlocked,
    neededSectionIds,
    quickCommandAddIntentSignal,
    searchInputRef,
    selectSection: scrollToSection,
    setContentScrollNode,
    setRootNode: setSettingsRootNode
  } = usePageNavigation({
    closeWithGuard: closeSettingsPageWithPromptGuard,
    confirmDiscard: confirmDiscardSourceControlAiPromptChanges,
    fetchKeybindings,
    fetchSettings,
    keybindings,
    repoIdToHostSelection,
    repoIdToRepresentative,
    searchQuery: settingsSearchQuery,
    sections: navSections,
    setSearchQuery: setSettingsSearchQuery,
    visibleSections: visibleNavSections
  })

  const applyTheme = (theme: 'system' | 'dark' | 'light') => {
    applyDocumentTheme(theme)
  }

  const displayedGitUsername = repos[0]?.gitUsername ?? ''
  const windowsTerminalCapabilityOwnerKey = getWindowsTerminalCapabilityOwnerKey(
    settings?.activeRuntimeEnvironmentId
  )
  const runtimeTarget = (() => getActiveRuntimeTarget(settings))()
  const hasActiveRuntimeEnvironment = Boolean(settings?.activeRuntimeEnvironmentId?.trim())
  const needsRepoWindowsRuntimeCapabilities = [...neededSectionIds].some((sectionId) =>
    sectionId.startsWith('repo-')
  )
  const shouldLoadWindowsTerminalCapabilities =
    hasActiveRuntimeEnvironment ||
    (isWindows &&
      (neededSectionIds.has('terminal') ||
        neededSectionIds.has('general') ||
        neededSectionIds.has('accounts') ||
        neededSectionIds.has('agents') ||
        needsRepoWindowsRuntimeCapabilities))
  // Why: General owns the Yiru CLI controls, including WSL skill-location setup.
  const windowsTerminalCapabilities = useWindowsTerminalCapabilities(
    shouldLoadWindowsTerminalCapabilities,
    true,
    windowsTerminalCapabilityOwnerKey,
    runtimeTarget
  )
  // Why: WSL can be unsupported on macOS/Linux, or supported-but-unavailable on Windows.
  // Only the latter should render disabled WSL controls.
  const wslSupportedPlatform = isWindows || windowsTerminalCapabilities.hostPlatform === 'win32'
  const isWindowsTerminalHost = isWindows || windowsTerminalCapabilities.hostPlatform === 'win32'

  // Why: each mounted project pane renders its SELECTED host's repo, so hooks
  // must load for that repo id — not the representative id parsed from the
  // section string (they differ when a non-default host is selected).
  const neededRepos = (() => {
    const reposByHostIdentity = new Map<string, Repo>()
    for (const settingsProject of settingsProjectList) {
      if (!neededSectionIds.has(`repo-${settingsProject.representativeRepoId}`)) {
        continue
      }
      const repo = getSettingsProjectHostRepo(
        settingsProject,
        repos,
        settingsProjectHostSelection[settingsProject.projectId]
      )
      if (repo) {
        reposByHostIdentity.set(getRepoHostIdentity(repo), repo)
      }
    }
    return [...reposByHostIdentity.values()]
  })()

  const repoHooksMap = useProjectHooks(repos, neededRepos)

  if (!settings) {
    return (
      <div
        ref={setSettingsRootNode}
        className={cn(
          'relative flex min-h-0 min-w-0 w-full flex-1 justify-center overflow-hidden bg-background',
          SHELL_WIDTH_CLASS,
          SETTINGS_SHELL_ANIMATION_CLASS_NAME
        )}
      >
        <div aria-hidden className={EXTENSION_SIDEBAR_BACKDROP_CLASS} />
        <div
          aria-hidden
          className="bg-background pointer-events-none absolute inset-y-0 right-0 left-[max(var(--settings-sidebar-width),calc((100%_-_var(--settings-shell-max-width))/2_+_var(--settings-sidebar-width)))]"
        />
        <div className="relative z-10 flex min-h-0 w-full max-w-[var(--settings-shell-max-width)] overflow-hidden">
          <div
            aria-hidden
            className="worktree-sidebar-theme border-sidebar-border bg-sidebar w-[var(--settings-sidebar-width)] shrink-0 border-r"
          />
          <div className="bg-background text-muted-foreground flex min-w-0 flex-1 items-center justify-center">
            {translate('auto.components.settings.Settings.c7ad095d96', 'Loading settings...')}
          </div>
        </div>
      </div>
    )
  }

  const generalNavGroups = buildSettingsNavGroups(
    visibleNavSections,
    settingsSearchQuery,
    translate
  )
  const repoNavSections = visibleNavSections
    .filter((section) => section.id.startsWith('repo-'))
    .map((section) => {
      const repo = repos.find((entry) => entry.id === section.id.replace('repo-', ''))
      return {
        ...section,
        badgeColor: repo?.badgeColor,
        repoIcon: repo?.repoIcon,
        upstream: repo?.upstream
      }
    })
  const isSectionMounted = (sectionId: string): boolean => neededSectionIds.has(sectionId)
  const isFocusedShortcutsPane =
    activeSectionId === 'shortcuts' && settingsSearchQuery.trim() === ''
  const isFocusedSetupGuidePane =
    activeSectionId === 'setup-guide' && settingsSearchQuery.trim() === ''

  return (
    <div
      ref={setSettingsRootNode}
      className={cn(
        'relative flex min-h-0 min-w-0 w-full flex-1 overflow-hidden bg-background',
        SHELL_WIDTH_CLASS,
        SETTINGS_SHELL_ANIMATION_CLASS_NAME
      )}
    >
      <div aria-hidden className={EXTENSION_SIDEBAR_BACKDROP_CLASS} />
      <div
        aria-hidden
        className="bg-background pointer-events-none absolute inset-y-0 right-0 left-[max(var(--settings-sidebar-width),calc((100%_-_var(--settings-shell-max-width))/2_+_var(--settings-sidebar-width)))]"
      />
      <div className="absolute inset-y-0 left-[max(0px,calc((100%_-_var(--settings-shell-max-width))/2))] z-20 flex min-h-0 w-[var(--settings-sidebar-width)]">
        <SettingsSidebar
          activeSectionId={activeSectionId}
          generalGroups={generalNavGroups}
          repoSections={repoNavSections}
          hasRepos={repos.length > 0}
          searchQuery={settingsSearchInputQuery}
          searchInputRef={searchInputRef}
          onBack={closeSettingsPageWithPromptGuard}
          onSearchChange={setSettingsSearchQuery}
          onSelectSection={scrollToSection}
          reserveWindowChrome={false}
        />
      </div>
      <ScrollArea
        viewportRef={setContentScrollNode}
        hasVerticalScrollBar={!isFocusedShortcutsPane}
        className="relative z-10 min-h-0 w-full min-w-0 flex-1"
        viewportClassName={cn('overflow-x-hidden', isFocusedShortcutsPane && 'overflow-y-hidden')}
      >
        <div className="flex min-h-full w-full min-w-0 justify-center">
          <div className="flex min-h-full w-full max-w-[var(--settings-shell-max-width)]">
            <div aria-hidden className="w-[var(--settings-sidebar-width)] shrink-0" />

            {/* Why: only the left rail should reveal the OS material; Settings content
                remains an opaque canvas for contrast and cross-platform parity. */}
            <div className="bg-background flex min-h-dvh min-w-0 flex-1 flex-col">
              <div
                className={cn(
                  'mx-auto flex w-full min-w-0 flex-col gap-8 px-8 pt-14 pr-8 xl:pr-24',
                  isFocusedShortcutsPane ? 'h-full pb-6' : 'pb-24',
                  isFocusedSetupGuidePane ? 'max-w-6xl' : 'max-w-4xl'
                )}
              >
                {visibleNavSections.length === 0 ? (
                  <div className="border-border/60 bg-card/30 text-muted-foreground flex min-h-[24rem] items-center justify-center border border-dashed text-sm">
                    {translate(
                      'auto.components.settings.Settings.3c88ec55d6',
                      'No settings found for "'
                    )}
                    {settingsSearchQuery.trim()}
                    {translate('auto.components.settings.Settings.add3b97ee6', '"')}
                  </div>
                ) : (
                  <ActiveSettingsSectionProvider value={activeSectionId}>
                    <CapabilitySections
                      accountOwnerPlatform={windowsTerminalCapabilities.hostPlatform}
                      fontSuggestions={terminalFontSuggestions}
                      getSearchEntries={getSectionSearchEntries}
                      isMounted={isSectionMounted}
                      onRequestFontSuggestions={requestFontSuggestions}
                      settings={settings}
                      updateSettings={updateSettings}
                      wslAvailable={windowsTerminalCapabilities.wslAvailable}
                      wslCapabilitiesLoading={windowsTerminalCapabilities.isLoading}
                      wslDistros={windowsTerminalCapabilities.wslDistros}
                      wslSupportedPlatform={wslSupportedPlatform}
                    />

                    <WorkflowSections
                      applyTheme={applyTheme}
                      displayedGitUsername={displayedGitUsername}
                      fontSuggestions={fontSuggestions}
                      getSearchEntries={getSectionSearchEntries}
                      ghostty={ghostty}
                      hasUnsavedBranchPromptChanges={hasUnsavedBranchPromptChanges}
                      hasUnsavedSourceControlAiPromptChanges={
                        hasUnsavedSourceControlAiPromptChanges
                      }
                      isMounted={isSectionMounted}
                      isWindowsTerminalHost={isWindowsTerminalHost}
                      onBranchPromptDirtyChange={setHasUnsavedBranchPromptChanges}
                      onCommitPromptDirtyChange={setHasUnsavedCommitPromptChanges}
                      onRequestFontSuggestions={requestFontSuggestions}
                      quickCommandAddIntentSignal={quickCommandAddIntentSignal}
                      scrollbackMode={scrollbackMode}
                      setScrollbackMode={setScrollbackMode}
                      settings={settings}
                      settingsSearchQuery={settingsSearchQuery}
                      sourceControlAiPromptDiscardSignal={sourceControlAiPromptDiscardSignal}
                      systemPrefersDark={systemPrefersDark}
                      terminalFontSuggestions={terminalFontSuggestions}
                      updateSettings={updateSettings}
                      warpThemes={warpThemes}
                      windowsTerminalCapabilities={windowsTerminalCapabilities}
                      writeSourceControlAiSettings={writeSourceControlAiSettings}
                    />

                    <SystemSections
                      getSearchEntries={getSectionSearchEntries}
                      hiddenExperimentalUnlocked={hiddenExperimentalUnlocked}
                      isFocusedShortcutsPane={isFocusedShortcutsPane}
                      isMac={isMac}
                      isMounted={isSectionMounted}
                      settings={settings}
                      switchRuntimeEnvironment={switchRuntimeEnvironment}
                      updateSettings={updateSettings}
                    />
                    <ProjectSections
                      getSearchEntries={getSectionSearchEntries}
                      isMounted={isSectionMounted}
                      isWindowsTerminalHost={isWindowsTerminalHost}
                      projectHostSetups={projectHostSetups}
                      projects={projects}
                      removeProject={removeProjectAllHosts}
                      repoHooksMap={repoHooksMap}
                      repos={repos}
                      settingsProjectHostSelection={settingsProjectHostSelection}
                      settingsProjectList={settingsProjectList}
                      updateProject={updateProject}
                      updateRepo={updateRepo}
                      windowsTerminalCapabilities={windowsTerminalCapabilities}
                    />
                  </ActiveSettingsSectionProvider>
                )}
              </div>
            </div>
          </div>
        </div>
      </ScrollArea>
    </div>
  )
}

export default Settings
