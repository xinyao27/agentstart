export const AGENTSTART_EDITOR_SAVE_DIRTY_FILES_EVENT = 'agentstart:editor-save-dirty-files'
export const AGENTSTART_EDITOR_PREPARE_HOT_EXIT_EVENT = 'agentstart:editor-prepare-hot-exit'

export type EditorSaveDirtyFilesDetail = {
  claim: () => void
  resolve: () => void
  reject: (message: string) => void
}

export type EditorPrepareHotExitDetail = EditorSaveDirtyFilesDetail
