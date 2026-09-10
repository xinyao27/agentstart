import {
  AGENTSTART_EDITOR_PREPARE_HOT_EXIT_EVENT,
  AGENTSTART_EDITOR_SAVE_DIRTY_FILES_EVENT
} from '~renderer/editor-save-events'

import {
  AGENTSTART_EDITOR_EXTERNAL_FILE_CHANGE_EVENT,
  AGENTSTART_EDITOR_QUIESCE_FILE_SAVES_EVENT,
  AGENTSTART_EDITOR_SAVE_AND_CLOSE_EVENT,
  AGENTSTART_EDITOR_SAVE_FILE_EVENT
} from './autosave'
import { createEditorAutosaveEventHandlers } from './autosave-event-handlers'
import { createEditorAutosaveScheduler } from './autosave-scheduler'
import type { AppStoreApi } from './autosave-scheduler'
import {
  autosaveSubscriberInputsEqual,
  getAutosaveSubscriberInputs
} from './autosave-state-projections'

export function attachEditorAutosaveController(store: AppStoreApi): () => void {
  const scheduler = createEditorAutosaveScheduler(store)
  const handlers = createEditorAutosaveEventHandlers(store, scheduler)

  let previousInputs = getAutosaveSubscriberInputs(store.getState())
  const unsubscribe = store.subscribe(() => {
    const nextInputs = getAutosaveSubscriberInputs(store.getState())
    if (autosaveSubscriberInputsEqual(previousInputs, nextInputs)) {
      return
    }
    previousInputs = nextInputs
    scheduler.syncAutoSave()
  })
  scheduler.syncAutoSave()

  window.addEventListener(
    AGENTSTART_EDITOR_SAVE_DIRTY_FILES_EVENT,
    handlers.handleSaveDirtyFiles as EventListener
  )
  window.addEventListener(
    AGENTSTART_EDITOR_PREPARE_HOT_EXIT_EVENT,
    handlers.handlePrepareHotExit as EventListener
  )
  window.addEventListener(
    AGENTSTART_EDITOR_SAVE_AND_CLOSE_EVENT,
    handlers.handleSaveAndClose as EventListener
  )
  window.addEventListener(
    AGENTSTART_EDITOR_SAVE_FILE_EVENT,
    handlers.handleSaveFile as EventListener
  )
  window.addEventListener(
    AGENTSTART_EDITOR_QUIESCE_FILE_SAVES_EVENT,
    handlers.handleQuiesce as EventListener
  )
  window.addEventListener(
    AGENTSTART_EDITOR_EXTERNAL_FILE_CHANGE_EVENT,
    handlers.handleExternalFileChange as EventListener
  )

  return () => {
    unsubscribe()
    window.removeEventListener(
      AGENTSTART_EDITOR_SAVE_DIRTY_FILES_EVENT,
      handlers.handleSaveDirtyFiles as EventListener
    )
    window.removeEventListener(
      AGENTSTART_EDITOR_PREPARE_HOT_EXIT_EVENT,
      handlers.handlePrepareHotExit as EventListener
    )
    window.removeEventListener(
      AGENTSTART_EDITOR_SAVE_AND_CLOSE_EVENT,
      handlers.handleSaveAndClose as EventListener
    )
    window.removeEventListener(
      AGENTSTART_EDITOR_SAVE_FILE_EVENT,
      handlers.handleSaveFile as EventListener
    )
    window.removeEventListener(
      AGENTSTART_EDITOR_QUIESCE_FILE_SAVES_EVENT,
      handlers.handleQuiesce as EventListener
    )
    window.removeEventListener(
      AGENTSTART_EDITOR_EXTERNAL_FILE_CHANGE_EVENT,
      handlers.handleExternalFileChange as EventListener
    )
    scheduler.dispose()
  }
}
