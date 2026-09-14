export type RendererErrorSurface =
  | 'app-root'
  | 'web-root'
  | 'workspace-shell'
  | 'sidebar'
  | 'terminal-workbench'
  | 'workspace-panel'
  | 'page'
  | 'modal'
  | 'overlay'
  | 'rich-markdown-editor'

export type RendererErrorReportKind =
  | 'react-error-boundary'
  | 'renderer-unhandled-error'
  | 'terminal-error'

export type RendererErrorReportArgs = {
  kind: RendererErrorReportKind
  originId: string
  surface: RendererErrorSurface
  errorName: string
  errorMessage: string
  errorStack?: string
  componentStack?: string
  activeView?: string
  activeModal?: string | null
  activeTabType?: string | null
  activeWorkspacePanelTab?: string | null
  hasActiveWorktree?: boolean
  chromeVersion?: string
}
