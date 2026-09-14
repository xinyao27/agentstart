import React from 'react'
import { translate } from '~renderer/i18n/i18n'
import { DeviceMobile as Smartphone, FilePlus, FileText, Globe } from '~renderer/icons/hugeicons'
import { DropdownMenuItem, DropdownMenuShortcut } from '~renderer/ui/dropdown-menu'
import { Tooltip, TooltipContent, TooltipTrigger } from '~renderer/ui/tooltip'

import { MobileEmulatorTabIntroCallout } from '../emulator-pane/mobile-emulator-tab-intro-callout'
import { ShellIcon } from './shell-icons'
import type { TabBarProps } from './tab-bar-types'
import type { WindowsShellEntry } from './use-tab-create-runtime'
import { resolveWindowsShellLaunchTarget } from './windows-shell-launch'
import { WorkspaceNewTerminalMenuItem } from './workspace-tab-create-menu'

type TabCreateStaticItemsProps = Pick<
  TabBarProps,
  | 'newTabMenuOrder'
  | 'onNewBrowserTab'
  | 'onNewFileTab'
  | 'onNewSimulatorTab'
  | 'onNewTerminalTab'
  | 'onNewTerminalWithShell'
  | 'onOpenFileTab'
  | 'terminalOnly'
> & {
  defaultPowerShellImplementation: 'auto' | 'powershell.exe' | 'pwsh.exe'
  mobileEmulatorEnabled: boolean
  newBrowserShortcut: string
  newFileShortcut: string
  newSimulatorShortcut: string
  newTerminalShortcut: string
  pwshAvailable: boolean
  queueNewTerminalFocus: () => void
  showMobileEmulatorIntroCallout: boolean
  windowsShellEntries: WindowsShellEntry[] | undefined
  workspaceHasSimulatorTab: boolean
}

export function TabCreateStaticItems(props: TabCreateStaticItemsProps): React.JSX.Element {
  const {
    defaultPowerShellImplementation,
    mobileEmulatorEnabled,
    newBrowserShortcut,
    newFileShortcut,
    newSimulatorShortcut,
    newTabMenuOrder = 'default',
    newTerminalShortcut,
    onNewBrowserTab,
    onNewFileTab,
    onNewSimulatorTab,
    onNewTerminalTab,
    onNewTerminalWithShell,
    onOpenFileTab,
    pwshAvailable,
    queueNewTerminalFocus,
    showMobileEmulatorIntroCallout,
    terminalOnly = false,
    windowsShellEntries,
    workspaceHasSimulatorTab
  } = props
  const terminalItems =
    windowsShellEntries && onNewTerminalWithShell ? (
      windowsShellEntries.map((entry, index) => (
        <DropdownMenuItem
          key={entry.shell}
          onClick={() => {
            queueNewTerminalFocus()
            onNewTerminalWithShell(
              resolveWindowsShellLaunchTarget(
                entry.shell,
                defaultPowerShellImplementation,
                pwshAvailable
              )
            )
          }}
          className="gap-2 px-2 py-1.5 text-[12px] leading-5 font-medium"
        >
          <ShellIcon shell={entry.shell} size={14} />
          <span className="flex-1">
            {translate('auto.components.tab.bar.TabBar.7c1313d237', 'New Terminal:')} {entry.label}
          </span>
          {index === 0 ? <DropdownMenuShortcut>{newTerminalShortcut}</DropdownMenuShortcut> : null}
        </DropdownMenuItem>
      ))
    ) : (
      <WorkspaceNewTerminalMenuItem
        onSelect={() => {
          queueNewTerminalFocus()
          onNewTerminalTab()
        }}
        shortcut={newTerminalShortcut}
      />
    )
  const browserItem = !terminalOnly ? (
    <DropdownMenuItem
      onClick={onNewBrowserTab}
      className="gap-2 px-2 py-1.5 text-[12px] leading-5 font-medium"
    >
      <Globe className="text-muted-foreground size-4" />
      {translate('auto.components.tab.bar.TabBar.4833fb2cbe', 'New Browser Tab')}
      <DropdownMenuShortcut>{newBrowserShortcut}</DropdownMenuShortcut>
    </DropdownMenuItem>
  ) : null
  const markdownItems = !terminalOnly ? (
    <>
      {onNewFileTab ? (
        <DropdownMenuItem
          onClick={onNewFileTab}
          className="gap-2 px-2 py-1.5 text-[12px] leading-5 font-medium"
        >
          <FilePlus className="text-muted-foreground size-4" />
          {translate('auto.components.tab.bar.TabBar.3d5d6c960d', 'New Markdown')}
          <DropdownMenuShortcut>{newFileShortcut}</DropdownMenuShortcut>
        </DropdownMenuItem>
      ) : null}
      {onOpenFileTab ? (
        <DropdownMenuItem
          onClick={onOpenFileTab}
          className="gap-2 px-2 py-1.5 text-[12px] leading-5 font-medium"
        >
          <FileText className="text-muted-foreground size-4" />
          {translate('auto.components.tab.bar.TabBar.4f327c8b3d', 'Open Markdown...')}
        </DropdownMenuItem>
      ) : null}
    </>
  ) : null
  const simulatorItem =
    !terminalOnly && mobileEmulatorEnabled && onNewSimulatorTab ? (
      workspaceHasSimulatorTab ? (
        <Tooltip>
          <TooltipTrigger
            render={
              <DropdownMenuItem
                onClick={onNewSimulatorTab}
                className="gap-2 px-2 py-1.5 text-[12px] leading-5 font-medium"
              >
                <Smartphone className="text-muted-foreground size-4" />
                {translate('auto.components.tab.bar.TabBar.b426bb2615', 'Go to Mobile Emulator')}
                <DropdownMenuShortcut>{newSimulatorShortcut}</DropdownMenuShortcut>
              </DropdownMenuItem>
            }
          />
          <TooltipContent side="right" sideOffset={8} className="z-[80]">
            {translate(
              'auto.components.tab.bar.TabBar.aea43b5748',
              'Open the existing emulator tab.'
            )}
          </TooltipContent>
        </Tooltip>
      ) : (
        <DropdownMenuItem
          onClick={onNewSimulatorTab}
          className="gap-2 px-2 py-1.5 text-[12px] leading-5 font-medium"
        >
          <Smartphone className="text-muted-foreground size-4" />
          {translate('auto.components.tab.bar.TabBar.fd2b42aaa3', 'New Mobile Emulator')}
          <DropdownMenuShortcut>{newSimulatorShortcut}</DropdownMenuShortcut>
        </DropdownMenuItem>
      )
    ) : null
  const intro =
    showMobileEmulatorIntroCallout &&
    !terminalOnly &&
    mobileEmulatorEnabled &&
    onNewSimulatorTab ? (
      <MobileEmulatorTabIntroCallout />
    ) : null

  return newTabMenuOrder === 'markdown-first' ? (
    <>
      {markdownItems}
      {terminalItems}
      {browserItem}
      {simulatorItem}
      {intro}
    </>
  ) : (
    <>
      {terminalItems}
      {browserItem}
      {markdownItems}
      {simulatorItem}
      {intro}
    </>
  )
}
