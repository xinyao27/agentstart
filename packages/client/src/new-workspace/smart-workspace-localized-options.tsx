import type React from 'react'
import { translate } from '~renderer/i18n/i18n'
import {
  TextAa as CaseSensitive,
  GitMerge,
  GithubLogo as Github,
  Sparkle as Sparkles
} from '~renderer/icons/hugeicons'

import type { SmartNameMode } from './smart-workspace-source-results'

export type SmartWorkspaceNameModeOption = {
  id: SmartNameMode
  label: string
  Icon: React.ComponentType<{ className?: string }>
}

export function getSmartWorkspaceNameModes(): SmartWorkspaceNameModeOption[] {
  return [
    {
      id: 'smart',
      label: translate('auto.components.new.workspace.SmartWorkspaceNameField.b3c60c2b7c', 'Smart'),
      Icon: Sparkles
    },
    {
      id: 'github',
      label: translate(
        'auto.components.new.workspace.SmartWorkspaceNameField.0a180280bd',
        'GitHub'
      ),
      Icon: Github
    },
    {
      id: 'branches',
      label: translate(
        'auto.components.new.workspace.SmartWorkspaceNameField.2e4c7c95fe',
        'Branch'
      ),
      Icon: GitMerge
    },
    {
      id: 'text',
      label: translate('auto.components.new.workspace.SmartWorkspaceNameField.6f07a18604', 'Name'),
      Icon: CaseSensitive
    }
  ]
}
