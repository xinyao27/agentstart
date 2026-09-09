export const BROWSER_WRITEBACK_PROTOCOL_CAPABILITY = 'browserWriteback.protobuf.v1' as const

export type BrowserWritebackTarget = { projectId: string; worktreeId: string }

export type BrowserWritebackCssChange = { after: string; before: string; styleSheetUrl: string }

export type BrowserWritebackElementEvidence = {
  column?: number
  componentName?: string
  fileName?: string
  line?: number
}
