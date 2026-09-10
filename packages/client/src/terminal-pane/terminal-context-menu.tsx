import type { KeybindingOverrides } from '@agentstart/protocol/keybindings'
import { isTerminalAgentQuickCommand } from '@agentstart/protocol/terminal/quick-commands'
import type { TerminalQuickCommand } from '@agentstart/protocol/terminal/quick-commands'
import { AgentIcon } from '~renderer/agent/catalog'
import { translate } from '~renderer/i18n/i18n'
import {
  Clipboard,
  Copy as ClipboardCopy,
  Copy,
  Eraser,
  GitFork,
  Layout as PanelBottomClose,
  Layout as PanelsTopLeft,
  Sidebar as PanelRightClose,
  Pencil,
  Play,
  ArrowsOut as Maximize2,
  ArrowsIn as Minimize2,
  Plus,
  X
} from '~renderer/icons/hugeicons'
import { formatPrimaryShortcutLabel } from '~renderer/keyboard-input/use-shortcut-label'
import {
  ContextMenuContent,
  ContextMenuItem,
  ContextMenuLabel,
  ContextMenuSeparator,
  ContextMenuShortcut,
  ContextMenuSub,
  ContextMenuSubContent,
  ContextMenuSubTrigger
} from '~renderer/ui/context-menu'

import { AgentSessionContinuationMenuItem } from './agent/session-continuation-menu-item'
import { TerminalIdMenuItems } from './terminal-id-menu-items'

type TerminalContextMenuProps = {
  /** Dismiss the menu ahead of an action that steals focus into an overlay. */
  onForceClose: () => void
  canClosePane: boolean
  canExpandPane: boolean
  menuPaneIsExpanded: boolean
  onCopy: () => void
  onPaste: () => void
  onSplitRight: () => void
  onSplitDown: () => void
  keybindings: KeybindingOverrides
  canEqualizePaneSizes: boolean
  onEqualizePaneSizes: () => void
  onClosePane: () => void
  onClearScreen: () => void
  canContinueAgentSessionInNewSession: boolean
  onContinueAgentSessionInNewSession: () => void
  onForkAgentSession: () => void
  onCopyAgentSessionContext: () => void
  repoQuickCommands: TerminalQuickCommand[]
  globalQuickCommands: TerminalQuickCommand[]
  quickCommandRepoLabel: string | null
  onQuickCommand: (command: TerminalQuickCommand) => void
  onAddQuickCommand: () => void
  onToggleExpand: () => void
  onSetTitle: () => void
  onClearPaneTitle: () => void
  canClearPaneTitle: boolean
  onCopyTerminalId: () => void
  onCopyPaneId: () => void
}

export default function TerminalContextMenu({
  onForceClose,
  canClosePane,
  canExpandPane,
  menuPaneIsExpanded,
  onCopy,
  onPaste,
  onSplitRight,
  onSplitDown,
  keybindings,
  canEqualizePaneSizes,
  onEqualizePaneSizes,
  onClosePane,
  onClearScreen,
  canContinueAgentSessionInNewSession,
  onContinueAgentSessionInNewSession,
  onForkAgentSession,
  onCopyAgentSessionContext,
  repoQuickCommands,
  globalQuickCommands,
  quickCommandRepoLabel,
  onQuickCommand,
  onAddQuickCommand,
  onToggleExpand,
  onSetTitle,
  onClearPaneTitle,
  canClearPaneTitle,
  onCopyTerminalId,
  onCopyPaneId
}: TerminalContextMenuProps): React.JSX.Element {
  // Why: Windows/Linux shortcut labels are long; context menu rows should show
  // the primary binding only so alternative bindings do not force row wraps.
  const shortcuts = (() => ({
    copy: formatPrimaryShortcutLabel('terminal.copySelection', keybindings),
    paste: formatPrimaryShortcutLabel('terminal.paste', keybindings),
    splitRight: formatPrimaryShortcutLabel('terminal.splitRight', keybindings),
    splitDown: formatPrimaryShortcutLabel('terminal.splitDown', keybindings),
    equalize: formatPrimaryShortcutLabel('terminal.equalizePaneSizes', keybindings),
    expand: formatPrimaryShortcutLabel('terminal.expandPane', keybindings),
    setTitle: formatPrimaryShortcutLabel('terminal.setTitle', keybindings),
    clearPaneTitle: formatPrimaryShortcutLabel('terminal.clearPaneTitle', keybindings),
    close: formatPrimaryShortcutLabel('terminal.closePane', keybindings)
  }))()
  const hasQuickCommands = repoQuickCommands.length > 0 || globalQuickCommands.length > 0
  const showEqualizeShortcut = shortcuts.equalize !== 'Unassigned'
  const showSetTitleShortcut = shortcuts.setTitle !== 'Unassigned'
  const showClearPaneTitleShortcut = shortcuts.clearPaneTitle !== 'Unassigned'
  const renderQuickCommandItem = (command: TerminalQuickCommand): React.JSX.Element => (
    <ContextMenuItem key={command.id} onClick={() => onQuickCommand(command)}>
      {isTerminalAgentQuickCommand(command) ? (
        <span className="text-muted-foreground flex size-3.5 shrink-0 items-center justify-center">
          <AgentIcon agent={command.agent} size={14} />
        </span>
      ) : (
        <Play className="text-muted-foreground size-3.5 shrink-0" />
      )}
      <span className="min-w-0 flex-1 truncate">{command.label}</span>
      {!isTerminalAgentQuickCommand(command) && !command.appendEnter ? (
        <ContextMenuShortcut className="shrink-0">
          {translate('auto.components.terminal.pane.TerminalContextMenu.c2f0b72b8d', 'Insert')}
        </ContextMenuShortcut>
      ) : null}
    </ContextMenuItem>
  )

  return (
    <ContextMenuContent
      className="w-60"
      // Why: keep focus on xterm rather than pulling it into the app chrome.
      finalFocus={false}
    >
      <ContextMenuItem onClick={onCopy}>
        <Copy />
        {translate('auto.components.terminal.pane.TerminalContextMenu.f3eeb1de13', 'Copy')}
        <ContextMenuShortcut>{shortcuts.copy}</ContextMenuShortcut>
      </ContextMenuItem>
      <ContextMenuItem onClick={onPaste}>
        <Clipboard />
        {translate('auto.components.terminal.pane.TerminalContextMenu.0a917b591a', 'Paste')}
        <ContextMenuShortcut>{shortcuts.paste}</ContextMenuShortcut>
      </ContextMenuItem>
      <ContextMenuSub>
        <ContextMenuSubTrigger>
          <Play />
          {translate(
            'auto.components.terminal.pane.TerminalContextMenu.ec85df5914',
            'Quick Commands'
          )}
        </ContextMenuSubTrigger>
        <ContextMenuSubContent className="w-60">
          {hasQuickCommands ? (
            <>
              {quickCommandRepoLabel && repoQuickCommands.length > 0 ? (
                <>
                  <ContextMenuLabel className="truncate">{quickCommandRepoLabel}</ContextMenuLabel>
                  {repoQuickCommands.map(renderQuickCommandItem)}
                </>
              ) : null}
              {globalQuickCommands.length > 0 ? (
                <>
                  {repoQuickCommands.length > 0 ? <ContextMenuSeparator /> : null}
                  {repoQuickCommands.length > 0 ? (
                    <ContextMenuLabel>
                      {translate(
                        'auto.components.terminal.pane.TerminalContextMenu.3ce594a4a0',
                        'Global'
                      )}
                    </ContextMenuLabel>
                  ) : null}
                  {globalQuickCommands.map(renderQuickCommandItem)}
                </>
              ) : null}
            </>
          ) : (
            <ContextMenuItem disabled className="text-muted-foreground">
              {translate(
                'auto.components.terminal.pane.TerminalContextMenu.9528a65ef8',
                'No quick commands'
              )}
            </ContextMenuItem>
          )}
          <ContextMenuSeparator />
          <ContextMenuItem
            onClick={() => {
              // Why: the dropdown sits above dialogs; force-close before
              // opening the add modal even during the open-gesture guard.
              onForceClose()
              onAddQuickCommand()
            }}
          >
            <Plus />
            {translate(
              'auto.components.terminal.pane.TerminalContextMenu.0a82b0608c',
              'Add Quick Command…'
            )}
          </ContextMenuItem>
        </ContextMenuSubContent>
      </ContextMenuSub>
      {canContinueAgentSessionInNewSession ? (
        <AgentSessionContinuationMenuItem onSelect={onContinueAgentSessionInNewSession} />
      ) : null}
      <ContextMenuItem onClick={onForkAgentSession}>
        <GitFork />
        {translate(
          'auto.components.terminal.pane.TerminalContextMenu.8a7ddb8b8a',
          'Fork Agent Session…'
        )}
      </ContextMenuItem>
      <ContextMenuItem onClick={onCopyAgentSessionContext}>
        <ClipboardCopy />
        {translate('auto.components.terminal.pane.TerminalContextMenu.cff67afad1', 'Copy Context')}
      </ContextMenuItem>
      <ContextMenuSeparator />
      <ContextMenuItem className="whitespace-nowrap" onClick={onSplitRight}>
        <PanelRightClose />
        {translate(
          'auto.components.terminal.pane.TerminalContextMenu.20e565d865',
          'Split Terminal Right'
        )}
        <ContextMenuShortcut>{shortcuts.splitRight}</ContextMenuShortcut>
      </ContextMenuItem>
      <ContextMenuItem className="whitespace-nowrap" onClick={onSplitDown}>
        <PanelBottomClose />
        {translate(
          'auto.components.terminal.pane.TerminalContextMenu.98bccf4fa2',
          'Split Terminal Down'
        )}
        <ContextMenuShortcut>{shortcuts.splitDown}</ContextMenuShortcut>
      </ContextMenuItem>
      {canEqualizePaneSizes && (
        <ContextMenuItem onClick={onEqualizePaneSizes}>
          <PanelsTopLeft />
          {translate(
            'auto.components.terminal.pane.TerminalContextMenu.06c2b0f043',
            'Equalize Pane Sizes'
          )}
          {showEqualizeShortcut ? (
            <ContextMenuShortcut>{shortcuts.equalize}</ContextMenuShortcut>
          ) : null}
        </ContextMenuItem>
      )}
      {canExpandPane && (
        <ContextMenuItem onClick={onToggleExpand}>
          {menuPaneIsExpanded ? <Minimize2 /> : <Maximize2 />}
          {menuPaneIsExpanded
            ? translate(
                'auto.components.terminal.pane.TerminalContextMenu.df766809e0',
                'Collapse Pane'
              )
            : translate(
                'auto.components.terminal.pane.TerminalContextMenu.925f49f210',
                'Expand Pane'
              )}
          <ContextMenuShortcut>{shortcuts.expand}</ContextMenuShortcut>
        </ContextMenuItem>
      )}
      <ContextMenuSeparator />
      <ContextMenuItem
        onClick={() => {
          // Why: Set Title moves focus into an overlay input. Force-close
          // before opening it so the menu's focus guards are not still active.
          onForceClose()
          onSetTitle()
        }}
      >
        <Pencil />
        {translate('auto.components.terminal.pane.TerminalContextMenu.39809d152f', 'Set Title…')}
        {showSetTitleShortcut ? (
          <ContextMenuShortcut>{shortcuts.setTitle}</ContextMenuShortcut>
        ) : null}
      </ContextMenuItem>
      {canClearPaneTitle ? (
        <ContextMenuItem onClick={onClearPaneTitle}>
          <X />
          {translate(
            'auto.components.terminal.pane.TerminalContextMenu.clearPaneTitle',
            'Clear Pane Title'
          )}
          {showClearPaneTitleShortcut ? (
            <ContextMenuShortcut>{shortcuts.clearPaneTitle}</ContextMenuShortcut>
          ) : null}
        </ContextMenuItem>
      ) : null}
      <TerminalIdMenuItems onCopyTerminalId={onCopyTerminalId} onCopyPaneId={onCopyPaneId} />
      {canClosePane && (
        <>
          <ContextMenuSeparator />
          <ContextMenuItem variant="destructive" onClick={onClosePane}>
            <X />
            {translate(
              'auto.components.terminal.pane.TerminalContextMenu.8c17d6786d',
              'Close Pane'
            )}
            <ContextMenuShortcut>{shortcuts.close}</ContextMenuShortcut>
          </ContextMenuItem>
        </>
      )}
      <ContextMenuSeparator />
      <ContextMenuItem onClick={onClearScreen}>
        <Eraser />
        {translate('auto.components.terminal.pane.TerminalContextMenu.b4cdd9314e', 'Clear Screen')}
      </ContextMenuItem>
    </ContextMenuContent>
  )
}
