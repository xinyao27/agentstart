import {
  AGENTSTART_EDITOR_PREPARE_HOT_EXIT_EVENT,
  type EditorPrepareHotExitDetail
} from '~renderer/editor-save-events'

type ShellRestartPreparation = {
  startedEventName: string
  abortedEventName: string
}

function requestEditorHotExitBackup(): Promise<void> {
  return new Promise<void>((resolve, reject) => {
    let claimed = false
    window.dispatchEvent(
      new CustomEvent<EditorPrepareHotExitDetail>(AGENTSTART_EDITOR_PREPARE_HOT_EXIT_EVENT, {
        detail: {
          claim: () => {
            claimed = true
          },
          resolve,
          reject: (message) => reject(new Error(message))
        }
      })
    )
    if (!claimed) {
      resolve()
    }
  })
}

export async function prepareShellRestart({
  startedEventName,
  abortedEventName
}: ShellRestartPreparation): Promise<void> {
  window.dispatchEvent(new Event(startedEventName))
  try {
    await requestEditorHotExitBackup()
  } catch (error) {
    window.dispatchEvent(new Event(abortedEventName))
    throw error
  }
  // Why: update installation bypasses ordinary close sequencing, so capture
  // renderer-owned terminal buffers while their panes are still mounted.
  window.dispatchEvent(new Event('beforeunload'))
}
