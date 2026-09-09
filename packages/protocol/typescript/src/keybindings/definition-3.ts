import type { KeybindingDefinition } from './model.js'
import { platformBindings } from './platform.js'

export const KEYBINDING_DEFINITIONS_3: readonly KeybindingDefinition[] = [
  {
    id: 'tab.previousAllTypes',
    title: 'Previous tab (all types)',
    group: 'Tab Navigation',
    scope: 'tabs',
    searchKeywords: ['shortcut', 'tab', 'previous', 'switch', 'cycle', 'all', 'any'],
    defaultBindings: platformBindings(['Mod+Alt+BracketLeft'])
  },
  {
    id: 'tab.previousRecent',
    title: 'Previous recent tab',
    group: 'Tab Navigation',
    scope: 'tabs',
    searchKeywords: ['shortcut', 'tab', 'recent', 'mru', 'switch', 'last used'],
    defaultBindings: platformBindings(['Ctrl+Tab']),
    allowInTerminal: true
  },
  {
    id: 'tab.nextTerminal',
    title: 'Next terminal tab',
    group: 'Tab Navigation',
    scope: 'tabs',
    searchKeywords: ['shortcut', 'tab', 'terminal', 'next', 'switch'],
    defaultBindings: platformBindings(['Ctrl+PageDown']),
    allowInTerminal: true
  },
  {
    id: 'tab.previousTerminal',
    title: 'Previous terminal tab',
    group: 'Tab Navigation',
    scope: 'tabs',
    searchKeywords: ['shortcut', 'tab', 'terminal', 'previous', 'switch'],
    defaultBindings: platformBindings(['Ctrl+PageUp']),
    allowInTerminal: true
  },
  {
    id: 'tab.selectByIndex',
    title: 'Select Tab 1–9',
    group: 'Tab Navigation',
    scope: 'tabs',
    // Why: deliberately no shared conflictGroup with workspace.selectByIndex.
    // They live in different scopes, so swapping their modifiers (the headline
    // use case) is never blocked as a false conflict; runtime stays deterministic
    // because resolveWindowShortcutAction checks the workspace range first.
    searchKeywords: ['shortcut', 'tab', 'select', 'switch', 'number', 'digit', '1-9', 'index'],
    // Why: representative chord for the 1-9 range (see workspace.selectByIndex).
    // mac Ctrl+1-9 (Cmd+1-9 is the workspace jump); Windows/Linux Alt+1-9
    // (Ctrl+1-9 is the workspace jump), so each platform gets a free chord.
    defaultBindings: {
      darwin: ['Ctrl+1'],
      linux: ['Alt+1'],
      win32: ['Alt+1']
    }
  },
  {
    id: 'tab.openQuickCommandsMenu',
    title: 'Toggle Quick Commands menu',
    group: 'Quick Commands',
    scope: 'tabs',
    // Why: this tab-scoped action is also routed through the main window
    // shortcut allowlist, so Settings must warn when it shadows global chords.
    conflictGroup: 'global',
    searchKeywords: ['shortcut', 'quick', 'command', 'menu', 'tab', 'group', 'toggle'],
    defaultBindings: platformBindings([])
  },
  {
    id: 'browser.find',
    title: 'Find in Browser',
    group: 'Browser',
    scope: 'browser',
    searchKeywords: ['shortcut', 'browser', 'find', 'search'],
    defaultBindings: platformBindings(['Mod+F'])
  },
  {
    id: 'browser.back',
    title: 'Go Back in Browser',
    group: 'Browser',
    scope: 'browser',
    searchKeywords: ['shortcut', 'browser', 'history', 'back', 'previous'],
    defaultBindings: {
      darwin: ['Mod+BracketLeft'],
      linux: ['Alt+ArrowLeft'],
      win32: ['Alt+ArrowLeft']
    }
  },
  {
    id: 'browser.forward',
    title: 'Go Forward in Browser',
    group: 'Browser',
    scope: 'browser',
    searchKeywords: ['shortcut', 'browser', 'history', 'forward', 'next'],
    defaultBindings: {
      darwin: ['Mod+BracketRight'],
      linux: ['Alt+ArrowRight'],
      win32: ['Alt+ArrowRight']
    }
  },
  {
    id: 'browser.reload',
    title: 'Reload Browser Page',
    group: 'Browser',
    scope: 'browser',
    searchKeywords: ['shortcut', 'browser', 'reload', 'refresh'],
    defaultBindings: platformBindings(['Mod+R'])
  },
  {
    id: 'browser.hardReload',
    title: 'Hard Reload Browser Page',
    group: 'Browser',
    scope: 'browser',
    searchKeywords: ['shortcut', 'browser', 'reload', 'refresh', 'cache'],
    defaultBindings: platformBindings(['Mod+Shift+R'])
  },
  {
    id: 'browser.focusAddressBar',
    title: 'Focus Browser Address Bar',
    group: 'Browser',
    scope: 'browser',
    searchKeywords: ['shortcut', 'browser', 'address', 'url', 'location'],
    defaultBindings: platformBindings(['Mod+L'])
  },
  {
    id: 'browser.grabElement',
    title: 'Grab Page Element',
    group: 'Browser',
    scope: 'browser',
    searchKeywords: ['shortcut', 'browser', 'grab', 'copy', 'element'],
    defaultBindings: platformBindings(['Mod+C'])
  },
  {
    id: 'editor.find',
    title: 'Find in editor',
    group: 'Editors',
    scope: 'editor',
    searchKeywords: ['shortcut', 'editor', 'find', 'search'],
    defaultBindings: platformBindings(['Mod+F'])
  },
  {
    id: 'editor.replace',
    title: 'Replace in editor',
    group: 'Editors',
    scope: 'editor',
    searchKeywords: ['shortcut', 'editor', 'replace', 'find', 'search'],
    // Why: match the source editor's native replace shortcut — Cmd+Alt+F on
    // macOS, Ctrl+H on Linux/Windows.
    defaultBindings: {
      darwin: ['Mod+Alt+F'],
      linux: ['Mod+H'],
      win32: ['Mod+H']
    }
  },
  {
    id: 'editor.save',
    title: 'Save File',
    group: 'Editors',
    scope: 'editor',
    searchKeywords: ['shortcut', 'editor', 'save'],
    defaultBindings: platformBindings(['Mod+S'])
  },
  {
    id: 'editor.markdownPreview',
    title: 'Show Markdown Preview',
    group: 'Editors',
    scope: 'editor',
    searchKeywords: ['shortcut', 'editor', 'markdown', 'preview'],
    defaultBindings: platformBindings(['Mod+Shift+V'])
  },
  {
    id: 'editor.addReviewNote',
    title: 'Add Review Note',
    group: 'Editors',
    scope: 'editor',
    searchKeywords: ['shortcut', 'editor', 'markdown', 'note', 'comment', 'annotation', 'review'],
    defaultBindings: platformBindings(['Mod+Alt+N'])
  },
  {
    id: 'sourceControl.sendReviewNotes',
    title: 'Send Review Notes to Agent',
    group: 'Global',
    scope: 'global',
    // Why: this global command also fires over editors, so collisions with
    // editor review-note chords must be reported in Settings.
    conflictGroup: 'editor',
    searchKeywords: [
      'shortcut',
      'source control',
      'diff',
      'notes',
      'send',
      'agent',
      'review',
      'annotate'
    ],
    // Why: users opt into a chord, avoiding a new cross-platform default conflict.
    defaultBindings: platformBindings([])
  },
  {
    id: 'fileExplorer.undo',
    title: 'Undo file operation',
    group: 'File Explorer',
    scope: 'fileExplorer',
    searchKeywords: ['shortcut', 'file explorer', 'undo'],
    defaultBindings: platformBindings(['Mod+Z'])
  },
  {
    id: 'fileExplorer.redo',
    title: 'Redo file operation',
    group: 'File Explorer',
    scope: 'fileExplorer',
    searchKeywords: ['shortcut', 'file explorer', 'redo'],
    defaultBindings: {
      darwin: ['Mod+Shift+Z'],
      linux: ['Mod+Shift+Z', 'Ctrl+Y'],
      win32: ['Mod+Shift+Z', 'Ctrl+Y']
    }
  },
  {
    id: 'fileExplorer.rename',
    title: 'Rename file',
    group: 'File Explorer',
    scope: 'fileExplorer',
    searchKeywords: ['shortcut', 'file explorer', 'rename'],
    defaultBindings: platformBindings(['Enter', 'F2']),
    allowBareKeybindings: true
  }
]
