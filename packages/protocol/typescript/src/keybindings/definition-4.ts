import type { KeybindingDefinition } from './model.js'
import { platformBindings } from './platform.js'

export const KEYBINDING_DEFINITIONS_4: readonly KeybindingDefinition[] = [
  {
    id: 'fileExplorer.copy',
    title: 'Copy file',
    group: 'File Explorer',
    scope: 'fileExplorer',
    searchKeywords: ['shortcut', 'file explorer', 'copy', 'file'],
    defaultBindings: platformBindings(['Mod+C'])
  },
  {
    id: 'fileExplorer.cut',
    title: 'Cut file',
    group: 'File Explorer',
    scope: 'fileExplorer',
    searchKeywords: ['shortcut', 'file explorer', 'cut', 'move', 'file'],
    defaultBindings: platformBindings(['Mod+X'])
  },
  {
    id: 'fileExplorer.paste',
    title: 'Paste file',
    group: 'File Explorer',
    scope: 'fileExplorer',
    searchKeywords: ['shortcut', 'file explorer', 'paste', 'file'],
    defaultBindings: platformBindings(['Mod+V'])
  },
  {
    id: 'fileExplorer.selectAll',
    title: 'Select all files',
    group: 'File Explorer',
    scope: 'fileExplorer',
    searchKeywords: ['shortcut', 'file explorer', 'select all', 'file'],
    defaultBindings: platformBindings(['Mod+A'])
  },
  {
    id: 'fileExplorer.copyPath',
    title: 'Copy file path',
    group: 'File Explorer',
    scope: 'fileExplorer',
    searchKeywords: ['shortcut', 'file explorer', 'copy', 'path'],
    defaultBindings: {
      darwin: ['Mod+Alt+C'],
      linux: ['Alt+Shift+C'],
      win32: ['Alt+Shift+C']
    }
  },
  {
    id: 'fileExplorer.copyRelativePath',
    title: 'Copy relative file path',
    group: 'File Explorer',
    scope: 'fileExplorer',
    searchKeywords: ['shortcut', 'file explorer', 'copy', 'relative', 'path'],
    defaultBindings: platformBindings(['Mod+Alt+Shift+C'])
  },
  {
    id: 'fileExplorer.delete',
    title: 'Delete file',
    group: 'File Explorer',
    scope: 'fileExplorer',
    searchKeywords: ['shortcut', 'file explorer', 'delete', 'remove', 'trash'],
    defaultBindings: {
      darwin: ['Mod+Backspace', 'Delete'],
      linux: ['Delete'],
      win32: ['Delete']
    },
    allowBareKeybindings: true
  },
  {
    id: 'settings.search',
    title: 'Search Settings',
    group: 'Settings',
    scope: 'settings',
    searchKeywords: ['shortcut', 'settings', 'search', 'find'],
    defaultBindings: platformBindings(['Mod+F'])
  },
  {
    id: 'terminal.copySelection',
    title: 'Copy terminal selection',
    group: 'Terminal Panes',
    scope: 'terminal',
    searchKeywords: ['shortcut', 'terminal', 'copy', 'selection'],
    defaultBindings: platformBindings(['Mod+Shift+C'])
  },
  {
    id: 'terminal.paste',
    title: 'Paste into terminal',
    group: 'Terminal Panes',
    scope: 'terminal',
    searchKeywords: ['shortcut', 'terminal', 'paste', 'clipboard'],
    defaultBindings: {
      darwin: ['Mod+V'],
      linux: ['Ctrl+V', 'Ctrl+Shift+V', 'Shift+Insert'],
      win32: ['Ctrl+V', 'Ctrl+Shift+V', 'Shift+Insert']
    }
  },
  {
    id: 'terminal.search',
    title: 'Search active pane',
    group: 'Terminal Panes',
    scope: 'terminal',
    searchKeywords: ['shortcut', 'terminal', 'search', 'find'],
    defaultBindings: platformBindings(['Mod+F'])
  },
  {
    id: 'terminal.clear',
    title: 'Clear active pane',
    group: 'Terminal Panes',
    scope: 'terminal',
    searchKeywords: ['shortcut', 'pane', 'clear'],
    defaultBindings: platformBindings(['Mod+K'])
  },
  {
    id: 'terminal.focusNextPane',
    title: 'Focus next pane',
    group: 'Terminal Panes',
    scope: 'terminal',
    searchKeywords: ['shortcut', 'pane', 'focus', 'next'],
    defaultBindings: platformBindings(['Mod+BracketRight'])
  },
  {
    id: 'terminal.focusPreviousPane',
    title: 'Focus previous pane',
    group: 'Terminal Panes',
    scope: 'terminal',
    searchKeywords: ['shortcut', 'pane', 'focus', 'previous'],
    defaultBindings: platformBindings(['Mod+BracketLeft'])
  },
  {
    id: 'terminal.equalizePaneSizes',
    title: 'Equalize pane sizes',
    group: 'Terminal Panes',
    scope: 'terminal',
    searchKeywords: ['shortcut', 'pane', 'split', 'equalize', 'resize', 'balance', 'size'],
    defaultBindings: platformBindings([])
  },
  {
    id: 'terminal.expandPane',
    title: 'Expand / collapse pane',
    group: 'Terminal Panes',
    scope: 'terminal',
    searchKeywords: ['shortcut', 'pane', 'expand', 'collapse'],
    defaultBindings: platformBindings(['Mod+Shift+Enter'])
  },
  {
    id: 'terminal.setTitle',
    title: 'Set Title…',
    group: 'Terminal Panes',
    scope: 'terminal',
    searchKeywords: ['shortcut', 'terminal', 'pane', 'set title', 'title', 'rename'],
    defaultBindings: platformBindings([])
  },
  {
    id: 'terminal.clearPaneTitle',
    title: 'Clear Pane Title',
    group: 'Terminal Panes',
    scope: 'terminal',
    searchKeywords: ['shortcut', 'terminal', 'pane', 'clear title', 'remove title', 'title'],
    defaultBindings: platformBindings([])
  },
  {
    id: 'terminal.closePane',
    title: 'Close active pane',
    group: 'Terminal Panes',
    scope: 'terminal',
    searchKeywords: ['shortcut', 'pane', 'close'],
    defaultBindings: platformBindings(['Mod+W'])
  },
  {
    id: 'terminal.splitRight',
    title: 'Split terminal right',
    group: 'Terminal Panes',
    scope: 'terminal',
    searchKeywords: ['shortcut', 'pane', 'split', 'right'],
    defaultBindings: {
      darwin: ['Mod+D'],
      linux: ['Mod+Shift+D'],
      win32: ['Mod+Shift+D']
    }
  },
  {
    id: 'terminal.splitDown',
    title: 'Split terminal down',
    group: 'Terminal Panes',
    scope: 'terminal',
    searchKeywords: ['shortcut', 'pane', 'split', 'down'],
    defaultBindings: {
      darwin: ['Mod+Shift+D'],
      linux: ['Alt+Shift+D'],
      win32: ['Alt+Shift+D']
    }
  }
]
