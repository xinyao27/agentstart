import type { ExecutionHostId } from '../../host/identity.js'
import type { YiruWorkspaceLayout } from '../../workspace/layout.js'
import type { LoaderStyle } from '../loader.js'
import type { UiLanguage } from '../ui-language.js'
import type { HostSettingOverrides, LeftSidebarAppearanceMode } from '../workspace-preferences.js'

export type GlobalWorkspaceSettings = {
  workspaceDir: string
  /** Per-host overrides keyed by ExecutionHostId. Effective value for a
   *  host-varying setting is `host override ?? client default`. */
  hostSettingOverrides?: Partial<Record<ExecutionHostId, HostSettingOverrides>>
  nestWorkspaces: boolean
  workspaceDirHistory?: YiruWorkspaceLayout[]
  refreshLocalBaseRefOnWorktreeCreate: boolean
  /** Set once the user dismisses the "local main is behind" suggestion toast, so
   *  the nudge to enable refreshLocalBaseRefOnWorktreeCreate never shows again. */
  localBaseRefSuggestionDismissed: boolean
  /** When enabled, Yiru renames a workspace's auto-generated creature branch to
   *  a short name derived from the first prompt once work begins. Users can
   *  still turn this off from global Git settings. */
  autoRenameBranchFromWork: boolean
  /** One-shot migration guard for the default-on rollout. Existing profiles
   *  without the guard are flipped on once; later explicit opt-outs stick. */
  autoRenameBranchFromWorkDefaultedOn?: boolean
  branchPrefix: 'git-username' | 'custom' | 'none'
  branchPrefixCustom: string
  enableGitHubAttribution: boolean
  theme: 'system' | 'dark' | 'light'
  /** Controls the left sidebar surface without changing terminal brightness. */
  leftSidebarAppearanceMode: LeftSidebarAppearanceMode
  leftSidebarTintColor?: string
  leftSidebarTintOpacity?: number
  uiLanguage: UiLanguage
  /** Optional only for profiles persisted before loader selection was introduced. */
  loaderStyle?: LoaderStyle
  appFontFamily: string
  /** One-shot guard for moving inherited Geist/14px typography to system UI/13px code. */
  systemTypographyDefaultsMigrated?: boolean
  editorAutoSave: boolean
  editorAutoSaveDelayMs: number
  editorMinimapEnabled: boolean
  /** Opt-in code-editor font; empty (the default) keeps following `terminalFontFamily`. */
  editorFontFamily?: string
  /** Explicit local-only command configuration for Stage 1 editor language intelligence. */
  /** Defaults on for profiles saved before file-editor wrapping became configurable. */
  editorWordWrap?: boolean
  /** Persisted opt-out for browser spellcheck noise in rich Markdown editing surfaces. */
  richMarkdownSpellcheckEnabled?: boolean
  /** Whether local markdown review note controls and the review panel are shown. */
  markdownReviewToolsEnabled: boolean
}
