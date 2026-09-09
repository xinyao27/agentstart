import type { TuiAgent } from '@yiru/protocol/agent/types'
import React, { useEffect, useRef, useState } from 'react'
import { toast } from 'sonner'
import { launchAgentInNewTab } from '~renderer/agent/launch-in-new-tab'
import { translate } from '~renderer/i18n/i18n'
import {
  useOptionalShortcutLabel,
  useShortcutLabel
} from '~renderer/keyboard-input/use-shortcut-label'
import { useAppStore } from '~renderer/store/state'
import { focusTerminalTabSurface } from '~renderer/tab-bar/focus-terminal-surface'
import { DropdownMenuSeparator } from '~renderer/ui/dropdown-menu'

import TabBarCreateEntry from './create-entry'
import { QuickLaunchAgentMenuItems } from './quick-launch-button'
import type { TabBarProps } from './tab-bar-types'
import { buildTabCreateMenuOptions, type TabCreateMenuOption } from './tab-create-menu-options'
import { TabCreateStaticItems } from './tab-create-static-items'
import { useTabCreateRuntime } from './use-tab-create-runtime'
import { resolveWindowsShellLaunchTarget } from './windows-shell-launch'
import { WorkspaceTabCreateMenu } from './workspace-tab-create-menu'

const TERMINAL_FOCUS_RETRY_MS = 50
const TERMINAL_FOCUS_TIMEOUT_MS = 5_000

function focusNewTerminalWhenReady(
  previousActiveTabId: string | null,
  expiresAt: number,
  retryRef: React.MutableRefObject<number | null>
): void {
  const state = useAppStore.getState()
  if (
    (state.activeTabType === 'terminal' || state.activeTabType === 'simulator') &&
    state.activeTabId &&
    state.activeTabId !== previousActiveTabId
  ) {
    focusTerminalTabSurface(state.activeTabId)
    return
  }
  if (Date.now() >= expiresAt) {
    return
  }
  retryRef.current = window.setTimeout(() => {
    retryRef.current = null
    focusNewTerminalWhenReady(previousActiveTabId, expiresAt, retryRef)
  }, TERMINAL_FOCUS_RETRY_MS)
}

export function TabCreateMenu(props: TabBarProps): React.JSX.Element {
  const {
    onNewBrowserTab,
    onNewFileTab,
    onNewSimulatorTab,
    onNewTerminalTab,
    onNewTerminalWithShell,
    onOpenEntry,
    onOpenFileTab,
    showAgentLaunchItems = true,
    terminalOnly = false,
    worktreeId
  } = props
  const runtime = useTabCreateRuntime(props)
  const newTerminalShortcut = useShortcutLabel('tab.newTerminal')
  const newBrowserShortcut = useShortcutLabel('tab.newBrowser')
  const newSimulatorShortcut = useShortcutLabel('tab.newSimulator')
  const newFileShortcut = useShortcutLabel('tab.newMarkdown')
  const openMarkdownShortcut = useOptionalShortcutLabel('tab.openMarkdown')
  const [isOpen, setIsOpen] = useState(false)
  const [query, setQuery] = useState('')
  const pendingFocusRef = useRef<(() => void) | null>(null)
  const animationRef = useRef<number | null>(null)
  const retryRef = useRef<number | null>(null)

  const clearScheduledFocus = (): void => {
    if (animationRef.current !== null) {
      cancelAnimationFrame(animationRef.current)
      animationRef.current = null
    }
    if (retryRef.current !== null) {
      window.clearTimeout(retryRef.current)
      retryRef.current = null
    }
  }
  const queueNewTerminalFocus = (): void => {
    const previousActiveTabId = useAppStore.getState().activeTabId
    pendingFocusRef.current = () =>
      focusNewTerminalWhenReady(
        previousActiveTabId,
        Date.now() + TERMINAL_FOCUS_TIMEOUT_MS,
        retryRef
      )
  }
  const queueTerminalFocus = (tabId: string): void => {
    pendingFocusRef.current = () => focusTerminalTabSurface(tabId)
  }
  const runPendingFocus = (): void => {
    const pendingFocus = pendingFocusRef.current
    pendingFocusRef.current = null
    clearScheduledFocus()
    if (pendingFocus) {
      animationRef.current = requestAnimationFrame(() => {
        animationRef.current = null
        pendingFocus()
      })
    }
  }

  useEffect(
    () => () => {
      if (animationRef.current !== null) {
        cancelAnimationFrame(animationRef.current)
      }
      if (retryRef.current !== null) {
        window.clearTimeout(retryRef.current)
      }
    },
    []
  )
  useEffect(() => {
    if (!isOpen) {
      return
    }
    const dismiss = (): void => setIsOpen(false)
    window.addEventListener('blur', dismiss)
    return () => window.removeEventListener('blur', dismiss)
  }, [isOpen])
  const handleOpenChange = (nextOpen: boolean): void => {
    setIsOpen(nextOpen)
    if (!nextOpen) {
      setQuery('')
    }
  }

  const menuOptions = (() =>
    buildTabCreateMenuOptions({
      terminalOnly,
      windowsShellEntries: runtime.windowsShellEntries,
      hasNewBrowser: !terminalOnly,
      hasNewMarkdown: !terminalOnly && Boolean(onNewFileTab),
      hasOpenMarkdown: !terminalOnly && Boolean(onOpenFileTab),
      hasSimulator: !terminalOnly && runtime.mobileEmulatorEnabled && Boolean(onNewSimulatorTab),
      simulatorIsGoTo: runtime.workspaceHasSimulatorTab
    }))()
  const selectMenuOption = (option: TabCreateMenuOption): void => {
    switch (option.kind) {
      case 'new-terminal':
        queueNewTerminalFocus()
        onNewTerminalTab()
        break
      case 'new-terminal-shell':
        if (onNewTerminalWithShell && option.shell) {
          queueNewTerminalFocus()
          onNewTerminalWithShell(
            resolveWindowsShellLaunchTarget(
              option.shell,
              runtime.defaultPowerShellImplementation,
              runtime.pwshAvailable
            )
          )
        }
        break
      case 'new-browser':
        onNewBrowserTab()
        break
      case 'new-markdown':
        onNewFileTab?.()
        break
      case 'open-markdown':
        onOpenFileTab?.()
        break
      case 'new-simulator':
      case 'go-to-simulator':
        onNewSimulatorTab?.()
        break
    }
  }
  const launchAgent = async (agent: TuiAgent): Promise<void> => {
    const option = runtime.agentLaunchOptions.find((candidate) => candidate.agent === agent)
    const result = await launchAgentInNewTab({
      agent,
      worktreeId,
      groupId: runtime.resolvedGroupId,
      launchSource: 'tab_bar_quick_launch'
    })
    if (!result) {
      toast.error(
        translate(
          'auto.components.tab.bar.TabBar.ab589350e5',
          'Could not build launch command for {{value0}}.',
          { value0: option?.label ?? agent }
        )
      )
      return
    }
    if (result.tabId) {
      queueTerminalFocus(result.tabId)
    } else {
      queueNewTerminalFocus()
    }
  }
  const showStaticItems = query.trim().length === 0

  return (
    <WorkspaceTabCreateMenu
      open={isOpen}
      onOpenChange={handleOpenChange}
      finalFocus={() => {
        runPendingFocus()
        return false
      }}
    >
      {!terminalOnly && onOpenEntry ? (
        <>
          <TabBarCreateEntry
            worktreeId={worktreeId}
            groupId={runtime.resolvedGroupId}
            menuOpen={isOpen}
            menuOptions={menuOptions}
            agentOptions={runtime.agentLaunchOptions}
            onLaunchAgent={launchAgent}
            onOpenDefaultTerminal={() => {
              queueNewTerminalFocus()
              onNewTerminalTab()
            }}
            onOpenEntry={onOpenEntry}
            onQueryChange={setQuery}
            onSelectMenuOption={selectMenuOption}
            onDidOpenEntry={() => handleOpenChange(false)}
          />
          {showStaticItems ? <DropdownMenuSeparator /> : null}
        </>
      ) : null}
      {showStaticItems ? (
        <TabCreateStaticItems
          {...props}
          defaultPowerShellImplementation={runtime.defaultPowerShellImplementation}
          mobileEmulatorEnabled={runtime.mobileEmulatorEnabled}
          newBrowserShortcut={newBrowserShortcut}
          newFileShortcut={newFileShortcut}
          newSimulatorShortcut={newSimulatorShortcut}
          newTerminalShortcut={newTerminalShortcut}
          onOpenMarkdownShortcut={openMarkdownShortcut ?? null}
          pwshAvailable={runtime.pwshAvailable}
          queueNewTerminalFocus={queueNewTerminalFocus}
          showMobileEmulatorIntroCallout={runtime.showMobileEmulatorIntroCallout}
          windowsShellEntries={runtime.windowsShellEntries}
          workspaceHasSimulatorTab={runtime.workspaceHasSimulatorTab}
        />
      ) : null}
      {showStaticItems && showAgentLaunchItems ? (
        <>
          <DropdownMenuSeparator />
          <QuickLaunchAgentMenuItems
            worktreeId={worktreeId}
            groupId={runtime.resolvedGroupId}
            onFocusTerminal={queueTerminalFocus}
          />
        </>
      ) : null}
    </WorkspaceTabCreateMenu>
  )
}
