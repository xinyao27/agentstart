import type { ExecutionHostId } from '@yiru/protocol/host/identity'
import { keybindingMatchesAction } from '@yiru/protocol/keybindings'
import { useEffect, useMemo, useRef, useState } from 'react'
import { toast } from 'sonner'
import { translate } from '~renderer/i18n/i18n'
import { getShortcutPlatform } from '~renderer/keyboard-input/shortcut-platform'
import { useEventCallback } from '~renderer/react/use-event-callback'
import { useAppStore } from '~renderer/store/state'
import type { AppState } from '~renderer/store/types'

import { resolveAppearanceAccordionDeepLink } from './appearance/usage-percentage-search'
import { deriveNeededSectionIds, getInitialMountedSectionIds } from './load-performance'
import type { SettingsNavSection, SettingsNavTarget } from './navigation-types'
import {
  cancelSettingsSubsectionScroll,
  getFallbackVisibleSection,
  getSettingsScrollTarget,
  getSettingsSectionId,
  scrollSettingsSubsection
} from './page-navigation'
import { resolveSettingsTargetRepoId } from './project-list'

const SHORTCUTS_ESCAPE_CONFIRM_TOAST_ID = 'shortcuts-escape-confirm'
const SHORTCUTS_ESCAPE_CONFIRM_WINDOW_MS = 2200

function isEditableTarget(target: EventTarget | null): boolean {
  if (!(target instanceof HTMLElement)) {
    return false
  }
  return (
    target.isContentEditable ||
    target.tagName === 'INPUT' ||
    target.tagName === 'TEXTAREA' ||
    target.tagName === 'SELECT'
  )
}

function hasVisibleOverlay(): boolean {
  return Array.from(
    document.querySelectorAll('[role="dialog"], [role="listbox"], [role="menu"]')
  ).some((element) => {
    if (!(element instanceof HTMLElement) || element.closest('[aria-hidden="true"]')) {
      return false
    }
    const style = window.getComputedStyle(element)
    return (
      style.display !== 'none' &&
      style.visibility !== 'hidden' &&
      element.getClientRects().length > 0
    )
  })
}

type PageNavigationInput = {
  closeWithGuard: () => void | Promise<void>
  confirmDiscard: () => Promise<boolean>
  fetchKeybindings: AppState['fetchKeybindings']
  fetchSettings: AppState['fetchSettings']
  keybindings: AppState['keybindings']
  repoIdToHostSelection: Map<string, { projectId: string; hostId: ExecutionHostId }>
  repoIdToRepresentative: Map<string, string>
  sections: readonly SettingsNavSection[]
  setSearchQuery: AppState['setSettingsSearchQuery']
  searchQuery: string
  visibleSections: SettingsNavSection[]
}

export function usePageNavigation(input: PageNavigationInput) {
  const {
    closeWithGuard,
    confirmDiscard,
    fetchKeybindings,
    fetchSettings,
    keybindings,
    repoIdToHostSelection,
    repoIdToRepresentative,
    searchQuery,
    sections,
    setSearchQuery,
    visibleSections
  } = input
  const [selectedSectionId, setSelectedSectionId] = useState('appearance')
  const [mountedSectionIds, setMountedSectionIds] = useState<Set<string>>(
    getInitialMountedSectionIds
  )
  const [pendingRequestTick, setPendingRequestTick] = useState(0)
  const [quickCommandAddIntentSignal, setQuickCommandAddIntentSignal] = useState(0)
  const [hiddenExperimentalUnlocked, setHiddenExperimentalUnlocked] = useState(false)
  const contentScrollRef = useRef<HTMLDivElement | null>(null)
  const searchInputRef = useRef<HTMLInputElement | null>(null)
  const [pendingSectionId, setPendingSectionId] = useState<string | null>(null)
  const pendingScrollTargetRef = useRef<string | null>(null)
  const pendingScrollFrameRef = useRef<number | null>(null)
  const shortcutsEscapeConfirmUntilRef = useRef(0)
  const visibleSectionKey = visibleSections.map((section) => section.id).join('\n')
  const visibleSectionIds = useMemo(
    () => new Set(visibleSectionKey ? visibleSectionKey.split('\n') : []),
    [visibleSectionKey]
  )
  const activeSectionId = visibleSectionIds.has(selectedSectionId)
    ? selectedSectionId
    : (getFallbackVisibleSection(visibleSections)?.id ?? selectedSectionId)
  const neededSectionIds = deriveNeededSectionIds({
    navSectionIds: sections.map((section) => section.id),
    mountedSectionIds,
    activeSectionId,
    pendingSectionId,
    query: searchQuery,
    visibleSectionIds
  })

  if ([...neededSectionIds].some((id) => !mountedSectionIds.has(id))) {
    setMountedSectionIds(neededSectionIds)
  }

  const setRootNode = (node: HTMLDivElement | null): void => {
    if (!node) {
      setSearchQuery('')
    }
  }

  const setContentScrollNode = (node: HTMLDivElement | null): void => {
    contentScrollRef.current = node
    if (!node) {
      cancelSettingsSubsectionScroll(pendingScrollFrameRef.current)
      pendingScrollFrameRef.current = null
    }
  }

  useEffect(() => {
    void fetchSettings()
    void fetchKeybindings()
  }, [fetchKeybindings, fetchSettings])

  useEffect(() => {
    const handleKeyDown = (event: KeyboardEvent): void => {
      if (
        event.key !== 'Escape' ||
        event.defaultPrevented ||
        hasVisibleOverlay() ||
        isEditableTarget(event.target)
      ) {
        return
      }
      if (activeSectionId !== 'shortcuts') {
        void closeWithGuard()
        return
      }
      event.preventDefault()
      const now = Date.now()
      if (now <= shortcutsEscapeConfirmUntilRef.current) {
        shortcutsEscapeConfirmUntilRef.current = 0
        toast.dismiss(SHORTCUTS_ESCAPE_CONFIRM_TOAST_ID)
        void closeWithGuard()
        return
      }
      shortcutsEscapeConfirmUntilRef.current = now + SHORTCUTS_ESCAPE_CONFIRM_WINDOW_MS
      toast.info(
        translate(
          'auto.components.settings.Settings.acc7bbdefd',
          'Press ESC again to exit settings'
        ),
        {
          id: SHORTCUTS_ESCAPE_CONFIRM_TOAST_ID,
          duration: SHORTCUTS_ESCAPE_CONFIRM_WINDOW_MS,
          className: 'whitespace-nowrap'
        }
      )
    }
    document.addEventListener('keydown', handleKeyDown)
    return () => document.removeEventListener('keydown', handleKeyDown)
  }, [activeSectionId, closeWithGuard])

  useEffect(() => {
    const handleFindShortcut = (event: KeyboardEvent): void => {
      if (
        event.defaultPrevented ||
        !keybindingMatchesAction('settings.search', event, getShortcutPlatform(), keybindings)
      ) {
        return
      }
      event.preventDefault()
      searchInputRef.current?.focus()
      searchInputRef.current?.select()
    }
    document.addEventListener('keydown', handleFindShortcut)
    return () => document.removeEventListener('keydown', handleFindShortcut)
  }, [keybindings])

  const consumeNavigationTarget = useEventCallback(
    (target: AppState['settingsNavigationTarget']): void => {
      if (!target || !useAppStore.getState().settings) {
        return
      }
      const paneSectionId = getSettingsSectionId(
        target.pane as SettingsNavTarget,
        target.repoId,
        repoIdToRepresentative
      )
      const targetRepoId = resolveSettingsTargetRepoId(target, repoIdToHostSelection.keys())
      const hostSelection = targetRepoId ? repoIdToHostSelection.get(targetRepoId) : undefined
      if (hostSelection) {
        useAppStore
          .getState()
          .setSettingsProjectHostSelection(hostSelection.projectId, hostSelection.hostId)
      }
      setPendingSectionId(paneSectionId)
      pendingScrollTargetRef.current = target.sectionId ?? paneSectionId
      if (target.pane === 'appearance') {
        const accordion = resolveAppearanceAccordionDeepLink(target.sectionId)
        if (accordion) {
          useAppStore.getState().setAppearanceAccordionDeepLink(accordion)
        }
      }
      if (target.intent === 'add-quick-command') {
        setQuickCommandAddIntentSignal((signal) => signal + 1)
      }
      setSelectedSectionId(paneSectionId)
      setMountedSectionIds((previous) =>
        previous.has(paneSectionId) ? previous : new Set(previous).add(paneSectionId)
      )
      setPendingRequestTick((tick) => tick + 1)
      useAppStore.getState().clearSettingsTarget()
    }
  )

  useEffect(() => {
    const currentTarget = useAppStore.getState().settingsNavigationTarget
    if (currentTarget) {
      consumeNavigationTarget(currentTarget)
    }
    return useAppStore.subscribe((state, previous) => {
      if (state.settingsNavigationTarget !== previous.settingsNavigationTarget) {
        consumeNavigationTarget(state.settingsNavigationTarget)
      }
    })
  }, [consumeNavigationTarget])

  useEffect(() => {
    const scrollTargetId = pendingScrollTargetRef.current
    if (
      scrollTargetId &&
      pendingSectionId &&
      scrollTargetId !== pendingSectionId &&
      searchQuery.trim()
    ) {
      setSearchQuery('')
      return
    }
    if (scrollTargetId && pendingSectionId && visibleSectionIds.has(pendingSectionId)) {
      if (activeSectionId !== pendingSectionId) {
        return
      }
      contentScrollRef.current?.scrollTo({ top: 0 })
      if (scrollTargetId !== pendingSectionId) {
        if (!getSettingsScrollTarget(scrollTargetId, contentScrollRef.current)) {
          return
        }
        const scroll = (): void =>
          scrollSettingsSubsection(scrollTargetId, contentScrollRef.current)
        scroll()
        cancelSettingsSubsectionScroll(pendingScrollFrameRef.current)
        const frameId = requestAnimationFrame(() => {
          pendingScrollFrameRef.current = null
          scroll()
        })
        pendingScrollFrameRef.current = frameId
      }
      setPendingSectionId(null)
      pendingScrollTargetRef.current = null
    }
  }, [
    activeSectionId,
    pendingRequestTick,
    pendingSectionId,
    searchQuery,
    setSearchQuery,
    visibleSectionIds
  ])

  const selectSection = async (
    sectionId: string,
    modifiers?: { metaKey: boolean; ctrlKey: boolean; shiftKey: boolean; altKey: boolean }
  ): Promise<void> => {
    if (sectionId !== activeSectionId && !(await confirmDiscard())) {
      return
    }
    if (sectionId === 'experimental' && modifiers?.shiftKey) {
      setHiddenExperimentalUnlocked((previous) => !previous)
    }
    contentScrollRef.current?.scrollTo({ top: 0 })
    if (searchQuery.trim()) {
      setSearchQuery('')
    }
    setSelectedSectionId(sectionId)
  }

  return {
    activeSectionId,
    hiddenExperimentalUnlocked,
    neededSectionIds,
    quickCommandAddIntentSignal,
    searchInputRef,
    selectSection,
    setContentScrollNode,
    setRootNode
  }
}
