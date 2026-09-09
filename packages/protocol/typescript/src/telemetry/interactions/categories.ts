import type { FeatureInteractionId } from './catalog'

export const FEATURE_INTERACTION_CATEGORIES = [
  'workspace',
  'agent',
  'browser',
  'launcher',
  'notes',
  'review',
  'setup',
  'settings',
  'terminal',
  'collaboration',
  'resource_management',
  'source_control'
] as const
export type FeatureInteractionCategory = (typeof FEATURE_INTERACTION_CATEGORIES)[number]

export const FEATURE_INTERACTION_CATEGORY_BY_ID = {
  'workspace-agent-sessions': 'workspace',
  'cmd-j': 'launcher',
  'cmd-j-workspace-open': 'launcher',
  'cmd-j-browser-page-open': 'launcher',
  'cmd-j-settings-open': 'launcher',
  'cmd-j-quick-action': 'launcher',
  'cmd-j-create-workspace': 'launcher',
  browser: 'browser',
  'browser-tab-created': 'browser',
  'browser-annotations': 'browser',
  'browser-annotations-sent-to-agent': 'browser',
  'browser-grab': 'browser',
  'markdown-file-created': 'notes',
  'workspace-creation': 'workspace',
  'agent-browser-setup': 'setup',
  'agent-browser-use': 'agent',
  'agent-orchestration-setup': 'setup',
  'agent-orchestration': 'collaboration',
  'mobile-emulator-agent-setup': 'setup',
  'ai-commit-generation': 'source_control',
  'ai-pr-generation': 'source_control',
  'claude-account-switching': 'settings',
  'computer-use-setup': 'setup',
  'computer-use': 'agent',
  'codex-account-switching': 'settings',
  'cookie-import': 'browser',
  'mobile-pairing': 'collaboration',
  notifications: 'settings',
  ports: 'resource_management',
  'quick-commands': 'launcher',
  'resource-manager': 'resource_management',
  'review-notes': 'review',
  'terminal-pane-split': 'terminal',
  'terminal-panes': 'terminal',
  'terminal-tabs': 'terminal',
  'tab-splits': 'terminal',
  'usage-tracking': 'settings',
  'workspace-cleanup': 'workspace'
} as const satisfies Record<FeatureInteractionId, FeatureInteractionCategory>

export function getFeatureInteractionCategory(
  id: FeatureInteractionId
): FeatureInteractionCategory {
  return FEATURE_INTERACTION_CATEGORY_BY_ID[id]
}
