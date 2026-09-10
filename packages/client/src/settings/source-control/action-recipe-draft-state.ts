import { setSourceControlActionDefault } from '@agentstart/protocol/source-control/action-recipes'
import type { SourceControlActionId } from '@agentstart/protocol/source-control/ai-actions'
import type {
  SourceControlAiSettings,
  SourceControlAiSettingsPatch
} from '@agentstart/protocol/source-control/ai-types'
import { useEffect, useState } from 'react'

import type { ActionRecipeDraftState } from './ai-action-recipe-draft'
import {
  readActionRecipeInputValues,
  serializeActionRecipeInputValues
} from './ai-action-recipe-draft'

type UseSourceControlActionRecipeDraftStateArgs = {
  config: SourceControlAiSettings
  customPromptDiscardSignal?: number
  onCustomPromptDirtyChange?: (dirty: boolean) => void
  writeConfig: (patch: SourceControlAiSettingsPatch) => Promise<void>
}

export function useSourceControlActionRecipeDraftState({
  config,
  customPromptDiscardSignal,
  onCustomPromptDirtyChange,
  writeConfig
}: UseSourceControlActionRecipeDraftStateArgs) {
  const persistedActionRecipeValues = (() => readActionRecipeInputValues(config))()
  const persistedActionRecipeSerialized = (() =>
    serializeActionRecipeInputValues(persistedActionRecipeValues))()
  const [actionRecipeDraftState, setActionRecipeDraftState] = useState<ActionRecipeDraftState>(
    () => ({
      values: persistedActionRecipeValues,
      baseValues: persistedActionRecipeValues
    })
  )
  const [savingActionTemplateIds, setSavingActionTemplateIds] = useState<
    Partial<Record<SourceControlActionId, boolean>>
  >({})
  const [syncedPersistedSerialized, setSyncedPersistedSerialized] = useState(
    persistedActionRecipeSerialized
  )
  const [consumedDiscardSignal, setConsumedDiscardSignal] = useState(customPromptDiscardSignal)
  const actionRecipeDraftSerialized = (() =>
    serializeActionRecipeInputValues(actionRecipeDraftState.values))()
  const actionRecipeBaseSerialized = (() =>
    serializeActionRecipeInputValues(actionRecipeDraftState.baseValues))()
  const actionTemplateDirty = actionRecipeDraftSerialized !== actionRecipeBaseSerialized

  if (syncedPersistedSerialized !== persistedActionRecipeSerialized) {
    setSyncedPersistedSerialized(persistedActionRecipeSerialized)
    setActionRecipeDraftState((current) => {
      const currentSerialized = serializeActionRecipeInputValues(current.values)
      const baseSerialized = serializeActionRecipeInputValues(current.baseValues)
      if (
        currentSerialized === baseSerialized ||
        currentSerialized === persistedActionRecipeSerialized
      ) {
        return {
          values: persistedActionRecipeValues,
          baseValues: persistedActionRecipeValues
        }
      }
      return {
        values: current.values,
        baseValues: persistedActionRecipeValues
      }
    })
  }

  if (consumedDiscardSignal !== customPromptDiscardSignal) {
    setConsumedDiscardSignal(customPromptDiscardSignal)
    setActionRecipeDraftState({
      values: persistedActionRecipeValues,
      baseValues: persistedActionRecipeValues
    })
  }

  useEffect(() => {
    onCustomPromptDirtyChange?.(actionTemplateDirty)
  }, [actionTemplateDirty, onCustomPromptDirtyChange])

  useEffect(
    () => () => {
      onCustomPromptDirtyChange?.(false)
    },
    [onCustomPromptDirtyChange]
  )

  const onActionTemplateChange = (actionId: SourceControlActionId, value: string): void => {
    setActionRecipeDraftState((current) => ({
      ...current,
      values: {
        ...current.values,
        [actionId]: {
          ...current.values[actionId],
          commandInputTemplate: value
        }
      }
    }))
  }

  const onActionAgentArgsChange = (actionId: SourceControlActionId, value: string): void => {
    setActionRecipeDraftState((current) => ({
      ...current,
      values: {
        ...current.values,
        [actionId]: {
          ...current.values[actionId],
          agentArgs: value
        }
      }
    }))
  }

  const saveActionTemplateDraft = async (actionId: SourceControlActionId): Promise<void> => {
    const nextValue = actionRecipeDraftState.values[actionId]
    if (
      JSON.stringify(nextValue) === JSON.stringify(actionRecipeDraftState.baseValues[actionId]) ||
      savingActionTemplateIds[actionId]
    ) {
      return
    }
    setSavingActionTemplateIds((current) => ({ ...current, [actionId]: true }))
    try {
      await writeConfig((current) => {
        return {
          actions: setSourceControlActionDefault(current.actions, actionId, {
            commandInputTemplate: nextValue.commandInputTemplate,
            agentArgs: nextValue.agentArgs
          })
        }
      })
      setActionRecipeDraftState((current) => ({
        values: current.values,
        baseValues: {
          ...current.baseValues,
          [actionId]: nextValue
        }
      }))
    } finally {
      setSavingActionTemplateIds((current) => ({ ...current, [actionId]: false }))
    }
  }

  const discardActionTemplateDraft = (actionId: SourceControlActionId): void => {
    setActionRecipeDraftState((current) => ({
      ...current,
      values: {
        ...current.values,
        [actionId]: current.baseValues[actionId]
      }
    }))
  }

  const appendVariable = (actionId: SourceControlActionId, variable: string): void => {
    setActionRecipeDraftState((current) => {
      const currentTemplate = current.values[actionId].commandInputTemplate
      const separator = currentTemplate.endsWith('\n') || currentTemplate.length === 0 ? '' : ' '
      return {
        ...current,
        values: {
          ...current.values,
          [actionId]: {
            ...current.values[actionId],
            commandInputTemplate: `${currentTemplate}${separator}{${variable}}`
          }
        }
      }
    })
  }

  return {
    actionRecipeDraftState,
    savingActionTemplateIds,
    onActionTemplateChange,
    onActionAgentArgsChange,
    saveActionTemplateDraft,
    discardActionTemplateDraft,
    appendVariable
  }
}
