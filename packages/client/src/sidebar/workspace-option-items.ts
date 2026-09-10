import type { WorktreeCardProperty } from '@agentstart/protocol/settings/ui-state'
import { translate } from '~renderer/i18n/i18n'

export type WorktreeCardPropertyOption = {
  id: string
  properties: readonly WorktreeCardProperty[]
  label: string
}

const WORKTREE_CARD_METADATA_OPTIONS: WorktreeCardPropertyOption[] = [
  {
    id: 'comment',
    properties: ['comment'],
    get label() {
      return translate('auto.components.sidebar.SidebarWorkspaceOptionsMenu.8d62c68b35', 'Notes')
    }
  },
  {
    id: 'ports',
    properties: ['ports'],
    get label() {
      return translate('auto.components.sidebar.SidebarWorkspaceOptionsMenu.2d74665a56', 'Ports')
    }
  },
  {
    id: 'inline-agents',
    properties: ['inline-agents'],
    get label() {
      return translate(
        'auto.components.sidebar.SidebarWorkspaceOptionsMenu.65a9820bd1',
        'Open tabs'
      )
    }
  }
]

type WorktreeCardPropertyOptionsInput = {
  hasProjectGroups?: boolean
}

export function getWorktreeCardPropertyOptions({
  hasProjectGroups = false
}: WorktreeCardPropertyOptionsInput = {}): WorktreeCardPropertyOption[] {
  const branchOption: WorktreeCardPropertyOption = {
    id: 'branch',
    properties: ['branch'],
    get label() {
      // Why: project groups can contain folder workspaces, so this setting
      // must describe both repository and folder identity.
      return hasProjectGroups
        ? translate(
            'auto.components.sidebar.SidebarWorkspaceOptionsMenu.folderPathIdentity',
            'Branch / folder path'
          )
        : translate('auto.components.sidebar.SidebarWorkspaceOptionsMenu.219ebf1961', 'Branch name')
    }
  }
  return [...WORKTREE_CARD_METADATA_OPTIONS, branchOption]
}

export const SORT_OPTIONS = [
  {
    id: 'name',
    get label() {
      return translate('auto.components.sidebar.SidebarWorkspaceOptionsMenu.3728165cdd', 'Name')
    },
    description: null
  },
  {
    id: 'smart',
    get label() {
      return translate(
        'auto.components.sidebar.SidebarWorkspaceOptionsMenu.503462f2b4',
        'Agent Activity'
      )
    },
    get description() {
      return translate(
        'auto.components.sidebar.SidebarWorkspaceOptionsMenu.b759bb87ee',
        'Agents that need attention, then most recent activity.'
      )
    }
  },
  {
    id: 'recent',
    get label() {
      return translate('auto.components.sidebar.SidebarWorkspaceOptionsMenu.b451c8b162', 'Recent')
    },
    description: null
  },
  {
    id: 'repo',
    get label() {
      return translate('auto.components.sidebar.SidebarWorkspaceOptionsMenu.2170d553cf', 'Project')
    },
    description: null
  },
  {
    id: 'manual',
    get label() {
      return translate('auto.components.sidebar.SidebarWorkspaceOptionsMenu.7b316bdd51', 'Manual')
    },
    get description() {
      return translate(
        'auto.components.sidebar.SidebarWorkspaceOptionsMenu.7153d07485',
        'Drag workspaces to arrange them within each group.'
      )
    }
  }
] as const

export const PROJECT_ORDER_OPTIONS = [
  {
    id: 'manual',
    get label() {
      return translate('auto.components.sidebar.SidebarWorkspaceOptionsMenu.7b316bdd51', 'Manual')
    },
    get description() {
      return translate(
        'auto.components.sidebar.SidebarWorkspaceOptionsMenu.6664282a7b',
        'Drag projects to arrange them'
      )
    }
  },
  {
    id: 'recent',
    get label() {
      return translate('auto.components.sidebar.SidebarWorkspaceOptionsMenu.b451c8b162', 'Recent')
    },
    get description() {
      return translate(
        'auto.components.sidebar.SidebarWorkspaceOptionsMenu.af9249c505',
        'Most recent workspace activity'
      )
    }
  }
] as const
