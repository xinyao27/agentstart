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
    // Why: the old Mod+Alt+ArrowLeft/Right defaults are Chrome's next/previous
    // tab chord on macOS, and Ctrl+Alt+arrows switch GNOME workspaces; the
    // Shift family mirrors worktree.navigateUp/Down instead.
    defaultBindings: platformBindings(['Mod+Shift+ArrowLeft']),
    allowInTerminal: true
  },
  {
    id: 'worktree.history.forward',
    title: 'Worktree History Forward',
    group: 'Global',
    scope: 'global',
    searchKeywords: ['shortcut', 'worktree', 'history', 'forward'],
    defaultBindings: platformBindings(['Mod+Shift+ArrowRight']),
    allowInTerminal: true
  },
  {
    id: 'tab.newTerminal',
    title: 'New terminal tab',
    group: 'Tabs',
    scope: 'tabs',
    searchKeywords: ['shortcut', 'tab', 'terminal', 'new'],
    // Why: Mod+T opens a browser tab and never reaches the page. macOS gets
    // Cmd+Alt+T; on Windows Ctrl+Alt is AltGr on many layouts and on Linux
    // Ctrl+Alt+T is the desktop-level "open terminal" shortcut, so users bind
    // their own chord in Settings there.
    defaultBindings: {
      darwin: ['Mod+Alt+T'],
      linux: [],
      win32: []
    }
  },
  {
    id: 'tab.newAgent',
    title: 'New agent tab (default agent)',
    group: 'Tabs',
    scope: 'tabs',
    searchKeywords: ['shortcut', 'tab', 'agent', 'new', 'default', 'launch'],
    // Why: the old macOS default Mod+Alt+T now belongs to tab.newTerminal and
    // no cross-platform chord is safe from the browser or AltGr, so this ships
    // unassigned; users bind it (or the per-agent rows) in Settings.
    defaultBindings: {
      darwin: ['Mod+Alt+Shift+T'],
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
    // Why: Mod+Shift+B toggles the browser's bookmarks bar, so the chord is
    // macOS-only here; Windows/Linux bind it explicitly in Settings.
    defaultBindings: {
      darwin: ['Mod+Alt+B'],
      linux: [],
      win32: []
    }
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
    // Why: Mod+Shift+M switches Chrome profiles, so the chord is macOS-only
    // here; Windows/Linux bind it explicitly in Settings.
    defaultBindings: {
      darwin: ['Mod+Alt+M'],
      linux: [],
      win32: []
    }
  },
  {
    id: 'tab.close',
    title: 'Close active tab',
    group: 'Tabs',
    scope: 'tabs',
    searchKeywords: ['shortcut', 'close', 'tab', 'pane'],
    // Why: Mod+W closes the whole browser tab and is reserved by the browser,
    // so the workbench ships Mod+Backspace (the macOS delete-tab metaphor);
    // the keyboard handler ignores the chord while an editable field is
    // focused so text editing never closes a tab.
    defaultBindings: platformBindings(['Mod+Backspace'])
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
    // Why: the old macOS default Mod+R reloads the browser page, and no other
    // chord is safe cross-platform, so this ships unbound; users bind it in
    // Settings.
    defaultBindings: {
      darwin: [],
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
    // Why: Mod+Shift+T reopens closed browser tabs and never reaches the
    // page, so macOS ships Cmd+Alt+Shift+R; Windows/Linux bind it explicitly
    // in Settings.
    defaultBindings: {
      darwin: ['Mod+Alt+Shift+R'],
      linux: [],
      win32: []
    }
  },
  {
    id: 'tab.nextSameType',
    title: 'Next tab (same type)',
    group: 'Tab Navigation',
    scope: 'tabs',
    searchKeywords: ['shortcut', 'tab', 'next', 'switch', 'cycle'],
    // Why: Mod+Shift+] is also a Chrome macOS next-tab chord, but unlike
    // Mod+W it is delivered to the page first, so the workbench owns it while
    // focused — the same browser-alignment as the zoom chords.
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
