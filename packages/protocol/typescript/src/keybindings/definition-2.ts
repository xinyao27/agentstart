import type { KeybindingDefinition } from './model.js'
import { platformBindings } from './platform.js'

export const KEYBINDING_DEFINITIONS_2: readonly KeybindingDefinition[] = [
  {
    id: 'zoom.in',
    title: 'Zoom In',
    group: 'Global',
    scope: 'global',
    searchKeywords: ['shortcut', 'zoom', 'in', 'scale'],
    defaultBindings: platformBindings(['Mod+Equal', 'Mod+Shift+Plus', 'Mod+NumpadAdd'])
  },
  {
    id: 'zoom.out',
    title: 'Zoom Out',
    group: 'Global',
    scope: 'global',
    searchKeywords: ['shortcut', 'zoom', 'out', 'scale'],
    defaultBindings: platformBindings(['Mod+Minus', 'Mod+NumpadSubtract'])
  },
  {
    id: 'zoom.reset',
    title: 'Reset Size',
    group: 'Global',
    scope: 'global',
    searchKeywords: ['shortcut', 'zoom', 'reset', 'size', 'actual'],
    defaultBindings: platformBindings(['Mod+0'])
  },
  {
    id: 'worktree.history.back',
    title: 'Worktree History Back',
    group: 'Global',
    scope: 'global',
    searchKeywords: ['shortcut', 'worktree', 'history', 'back'],
    defaultBindings: platformBindings(['Mod+Alt+ArrowLeft']),
    allowInTerminal: true
  },
  {
    id: 'worktree.history.forward',
    title: 'Worktree History Forward',
    group: 'Global',
    scope: 'global',
    searchKeywords: ['shortcut', 'worktree', 'history', 'forward'],
    defaultBindings: platformBindings(['Mod+Alt+ArrowRight']),
    allowInTerminal: true
  },
  {
    id: 'tab.newTerminal',
    title: 'New terminal tab',
    group: 'Tabs',
    scope: 'tabs',
    searchKeywords: ['shortcut', 'tab', 'terminal', 'new'],
    defaultBindings: platformBindings(['Mod+T'])
  },
  {
    id: 'tab.newAgent',
    title: 'New agent tab (default agent)',
    group: 'Tabs',
    scope: 'tabs',
    searchKeywords: ['shortcut', 'tab', 'agent', 'new', 'default', 'launch'],
    // Why: macOS only. On Windows Ctrl+Alt is AltGr on many layouts, and on
    // Linux Ctrl+Alt+T is the desktop-level "open terminal" shortcut, so
    // there is no safe default chord there; users bind it in Settings.
    defaultBindings: {
      darwin: ['Mod+Alt+T'],
      linux: [],
      win32: []
    }
  },
  {
    id: 'tab.newBrowser',
    title: 'New browser tab',
    group: 'Tabs',
    scope: 'tabs',
    searchKeywords: ['shortcut', 'tab', 'browser', 'new'],
    defaultBindings: platformBindings(['Mod+Shift+B'])
  },
  {
    id: 'tab.newSimulator',
    title: 'New mobile emulator tab',
    group: 'Tabs',
    scope: 'tabs',
    searchKeywords: ['shortcut', 'tab', 'simulator', 'emulator', 'mobile', 'ios', 'new'],
    // Why: keep explorer on Mod+Shift+E (VS Code muscle memory). Emulator is
    // macOS-only and less common, so it yields to a free chord (#8533).
    defaultBindings: {
      darwin: ['Mod+Alt+Shift+E'],
      linux: [],
      win32: []
    }
  },
  {
    id: 'tab.newMarkdown',
    title: 'New markdown tab',
    group: 'Tabs',
    scope: 'tabs',
    searchKeywords: ['shortcut', 'tab', 'markdown', 'file', 'new'],
    defaultBindings: platformBindings(['Mod+Shift+M'])
  },
  {
    id: 'tab.openMarkdown',
    title: 'Open markdown tab',
    group: 'Tabs',
    scope: 'tabs',
    searchKeywords: ['shortcut', 'tab', 'markdown', 'file', 'open'],
    defaultBindings: platformBindings(['Mod+Shift+O'])
  },
  {
    id: 'tab.close',
    title: 'Close active tab',
    group: 'Tabs',
    scope: 'tabs',
    searchKeywords: ['shortcut', 'close', 'tab', 'pane'],
    defaultBindings: platformBindings(['Mod+W'])
  },
  {
    id: 'tab.closeAll',
    title: 'Close all editor tabs',
    group: 'Tabs',
    scope: 'tabs',
    searchKeywords: ['shortcut', 'close', 'all', 'tabs', 'files', 'editors'],
    defaultBindings: platformBindings(['Mod+Alt+W'])
  },
  {
    id: 'tab.rename',
    title: 'Rename active tab',
    group: 'Tabs',
    scope: 'tabs',
    conflictGroup: 'workspace-shell',
    searchKeywords: ['shortcut', 'tab', 'rename', 'title', 'label'],
    // Why: macOS only. Cmd+R is free in the app/terminal focus zone (the
    // browser pane owns its own Cmd+R reload). On Windows/Linux Ctrl+R is the
    // shell reverse-search, so it is left unbound for explicit user binding.
    defaultBindings: {
      darwin: ['Mod+R'],
      linux: [],
      win32: []
    }
  },
  {
    id: 'tab.reopenClosed',
    title: 'Reopen closed tab',
    group: 'Tabs',
    scope: 'tabs',
    searchKeywords: ['shortcut', 'tab', 'reopen', 'restore', 'closed'],
    defaultBindings: platformBindings(['Mod+Shift+T'])
  },
  {
    id: 'tab.nextSameType',
    title: 'Next tab (same type)',
    group: 'Tab Navigation',
    scope: 'tabs',
    searchKeywords: ['shortcut', 'tab', 'next', 'switch', 'cycle'],
    defaultBindings: platformBindings(['Mod+Shift+BracketRight'])
  },
  {
    id: 'tab.previousSameType',
    title: 'Previous tab (same type)',
    group: 'Tab Navigation',
    scope: 'tabs',
    searchKeywords: ['shortcut', 'tab', 'previous', 'switch', 'cycle'],
    defaultBindings: platformBindings(['Mod+Shift+BracketLeft'])
  },
  {
    id: 'tab.nextAllTypes',
    title: 'Next tab (all types)',
    group: 'Tab Navigation',
    scope: 'tabs',
    searchKeywords: ['shortcut', 'tab', 'next', 'switch', 'cycle', 'all', 'any'],
    defaultBindings: platformBindings(['Mod+Alt+BracketRight'])
  }
]
