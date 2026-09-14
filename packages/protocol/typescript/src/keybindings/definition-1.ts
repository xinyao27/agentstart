import type { KeybindingDefinition } from './model.js'
import { platformBindings } from './platform.js'

export const KEYBINDING_DEFINITIONS_1: readonly KeybindingDefinition[] = [
  {
    id: 'app.commandPalette',
    title: 'Open Command Palette',
    group: 'Global',
    scope: 'global',
    searchKeywords: ['shortcut', 'global', 'command', 'search', 'worktree', 'file', 'agent'],
    defaultBindings: platformBindings(['Mod+K'])
  },
  {
    id: 'worktree.navigateUp',
    title: 'Previous worktree',
    group: 'Global',
    scope: 'global',
    searchKeywords: ['shortcut', 'global', 'worktree', 'previous', 'up'],
    defaultBindings: platformBindings(['Mod+Shift+ArrowUp'])
  },
  {
    id: 'worktree.navigateDown',
    title: 'Next worktree',
    group: 'Global',
    scope: 'global',
    searchKeywords: ['shortcut', 'global', 'worktree', 'next', 'down'],
    defaultBindings: platformBindings(['Mod+Shift+ArrowDown'])
  },
  {
    id: 'workspace.create',
    title: 'Create worktree',
    group: 'Global',
    scope: 'global',
    searchKeywords: ['shortcut', 'global', 'worktree', 'create', 'new workspace'],
    // Why: Mod+N and Mod+Shift+N open a new browser window / incognito window,
    // so the create chord is macOS-only; Ctrl+Alt collides with AltGr on
    // Windows/Linux layouts, so those platforms bind it explicitly in Settings.
    defaultBindings: {
      darwin: ['Mod+Alt+Shift+N'],
      linux: [],
      win32: []
    }
  },
  {
    id: 'workspace.rename',
    title: 'Rename worktree',
    group: 'Global',
    scope: 'global',
    conflictGroup: 'workspace-shell',
    searchKeywords: ['shortcut', 'global', 'worktree', 'rename', 'workspace', 'title'],
    // Why: macOS only. On Windows/Linux Ctrl+Alt+R has no safe default, and the
    // chord families there (Ctrl+R reverse-search, Ctrl+Shift+R reload) are
    // taken, so users bind it explicitly in Settings.
    defaultBindings: {
      darwin: ['Mod+Alt+R'],
      linux: [],
      win32: []
    }
  },
  {
    id: 'workspace.delete',
    title: 'Delete Workspace',
    group: 'Global',
    scope: 'global',
    searchKeywords: [
      'shortcut',
      'global',
      'workspace',
      'current workspace',
      'worktree',
      'delete',
      'remove',
      'trash'
    ],
    // Why: ship the command now without claiming a default chord; user
    // overrides still win automatically when a future default is assigned.
    defaultBindings: platformBindings([]),
    allowInTerminal: true
  },
  {
    id: 'workspace.selectByIndex',
    title: 'Select Workspace 1–9',
    group: 'Global',
    scope: 'global',
    searchKeywords: [
      'shortcut',
      'global',
      'workspace',
      'worktree',
      'select',
      'switch',
      'number',
      'digit',
      '1-9',
      'index'
    ],
    // Why: one remappable row for the whole 1-9 range. The stored chord is a
    // representative — its digit normalizes to 1, but the modifier set is what
    // matters and any of 1-9 fires it. Mod+1 is reserved: Cmd/Ctrl+1-9 switch
    // browser tabs, so macOS gets Cmd+Alt+1-9 and Windows/Linux Alt+Shift+1-9.
    defaultBindings: {
      darwin: ['Mod+Alt+1'],
      linux: ['Alt+Shift+1'],
      win32: ['Alt+Shift+1']
    }
  },
  {
    id: 'sidebar.left.toggle',
    title: 'Toggle Sidebar',
    group: 'Global',
    scope: 'global',
    searchKeywords: ['shortcut', 'sidebar', 'left'],
    defaultBindings: platformBindings(['Mod+B'])
  },
  {
    id: 'sidebar.right.toggle',
    title: 'Open Explorer Tab',
    group: 'Global',
    scope: 'global',
    searchKeywords: ['shortcut', 'explorer', 'tab', 'files'],
    // Why: Mod+L focuses the browser's address bar, so the workbench owns the
    // shifted variant instead.
    defaultBindings: platformBindings(['Mod+Shift+L'])
  },
  {
    id: 'sidebar.explorer.toggle',
    title: 'Show Explorer',
    group: 'Global',
    scope: 'global',
    searchKeywords: ['shortcut', 'sidebar', 'explorer', 'files'],
    defaultBindings: platformBindings(['Mod+Shift+E'])
  },
  {
    id: 'sidebar.search.toggle',
    title: 'Show Search',
    group: 'Global',
    scope: 'global',
    searchKeywords: ['shortcut', 'sidebar', 'search'],
    defaultBindings: platformBindings(['Mod+Shift+F'])
  },
  {
    id: 'sidebar.sourceControl.toggle',
    title: 'Show Changes & Review',
    group: 'Global',
    scope: 'global',
    searchKeywords: ['shortcut', 'sidebar', 'source control', 'git'],
    defaultBindings: platformBindings(['Mod+Shift+G'])
  },
  {
    id: 'sidebar.checks.toggle',
    title: 'Show Review',
    group: 'Global',
    scope: 'global',
    searchKeywords: ['shortcut', 'sidebar', 'checks', 'ci'],
    defaultBindings: platformBindings([])
  },
  {
    id: 'sidebar.ports.toggle',
    title: 'Show Ports',
    group: 'Global',
    scope: 'global',
    searchKeywords: ['shortcut', 'sidebar', 'ports'],
    defaultBindings: {
      darwin: ['Mod+Shift+I'],
      linux: [],
      win32: []
    }
  },
  {
    id: 'sidebar.sleepingWorkspaces.toggle',
    title: 'Toggle Sleeping Workspaces',
    group: 'Global',
    scope: 'global',
    searchKeywords: [
      'shortcut',
      'sidebar',
      'sleeping',
      'asleep',
      'workspaces',
      'worktree',
      'filter',
      'show',
      'hide'
    ],
    // Why: ship unbound — issue #5209 asks to "assign a shortcut", so we avoid
    // claiming a cross-platform chord and let users bind it in Settings.
    defaultBindings: platformBindings([])
  },
  {
    id: 'sidebar.focusWorktreeList',
    title: 'Focus worktree list',
    group: 'Global',
    scope: 'global',
    searchKeywords: ['shortcut', 'sidebar', 'worktree', 'focus'],
    // Why: keep zoom.reset on the browser-standard Mod+0; this chord was
    // unreachable while it shared that default (#8584).
    defaultBindings: platformBindings(['Mod+Shift+0'])
  }
]
