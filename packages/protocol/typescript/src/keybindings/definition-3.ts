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
    // Why: Ctrl+Tab switches browser tabs and never reaches the page, so the
    // held-key switcher ships on a chord the browser leaves to the page.
    // Shift still reverses direction while the chord is held.
    defaultBindings: platformBindings(['Mod+Alt+PageDown']),
    allowInTerminal: true
  },
  {
    id: 'tab.nextTerminal',
    title: 'Next terminal tab',
    group: 'Tab Navigation',
    scope: 'tabs',
    searchKeywords: ['shortcut', 'tab', 'terminal', 'next', 'switch'],
    // Why: Ctrl+PageDown/PageUp switch browser tabs on Windows/Linux, so the
    // terminal-tab chords use Alt, which no browser default claims.
    defaultBindings: platformBindings(['Alt+PageDown']),
    allowInTerminal: true
  },
  {
    id: 'tab.previousTerminal',
    title: 'Previous terminal tab',
    group: 'Tab Navigation',
    scope: 'tabs',
    searchKeywords: ['shortcut', 'tab', 'terminal', 'previous', 'switch'],
    defaultBindings: platformBindings(['Alt+PageUp']),
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
    // macOS; Ctrl+H on Linux/Windows opens the browser's history page, so
    // those platforms use Ctrl+Shift+H instead.
    defaultBindings: {
      darwin: ['Mod+Alt+F'],
      linux: ['Mod+Shift+H'],
      win32: ['Mod+Shift+H']
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
