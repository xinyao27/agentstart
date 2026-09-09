import type { TuiAgent } from '@yiru/protocol/agent/types'
import type { Repo } from '@yiru/protocol/project/repository'
import type { GlobalSettings } from '@yiru/protocol/settings/global/model'
import type { SourceControlTextActionId } from '@yiru/protocol/source-control/ai-actions'
import { listCommitMessageAgentCapabilities } from '@yiru/protocol/source-control/catalog/agents'
import { CUSTOM_AGENT_ID, isCustomAgentId } from '@yiru/protocol/source-control/custom-agent'
import type { ResolvedSourceControlAiGenerationParams } from '@yiru/protocol/source-control/resolution'
import React, { useState } from 'react'
import { toast } from 'sonner'
import { getAgentCatalog, AgentIcon } from '~renderer/agent/catalog'
import { translate } from '~renderer/i18n/i18n'
import {
  FloppyDisk as Save,
  Sparkle as Sparkles,
  Terminal,
  Warning as TriangleAlert
} from '~renderer/icons/hugeicons'
import { LoadingIndicator } from '~renderer/loading/indicator'
import { SourceControlActionVariableChips } from '~renderer/source-control/action-variable-chips'
import type { SourceControlAiWriteTarget } from '~renderer/source-control/ai-recipe-save'
import { Button } from '~renderer/ui/button'
import { DialogFooter } from '~renderer/ui/dialog'
import { Input } from '~renderer/ui/input'
import { Label } from '~renderer/ui/label'
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '~renderer/ui/select'
import { Textarea } from '~renderer/ui/textarea'

import { planSourceControlTextGeneration } from './generation-plan'
import { sourceControlTextGenerationDefaultsMatchTarget } from './text-generation-defaults'
import {
  buildCommitMessageGenerationParams,
  type CommitMessageGenerationAgentChoice
} from './text-generation-params'

const UNCONFIGURED_AGENT_SELECT_VALUE = ''

export type SourceControlTextGenerationSaveTarget = {
  target: SourceControlAiWriteTarget
  label: string
  successMessage: string
}

type SourceControlTextGenerationDialogFormProps = {
  actionId: SourceControlTextActionId
  generateLabel: string
  settings: GlobalSettings | null
  repo: Pick<Repo, 'id' | 'sourceControlAi'> | null
  baseParams: ResolvedSourceControlAiGenerationParams | null
  basePromptPreview?: string
  saveTargets: SourceControlTextGenerationSaveTarget[]
  onGenerate: (params: ResolvedSourceControlAiGenerationParams) => void
  onOpenChange: (open: boolean) => void
  onSaveDefaults: (
    target: SourceControlAiWriteTarget,
    params: ResolvedSourceControlAiGenerationParams
  ) => Promise<void> | void
}

export function sourceControlTextGenerationSaveTargetKey(
  target: SourceControlAiWriteTarget
): string {
  return target.type === 'repo' ? `repo:${target.repoId}` : 'global'
}

export function getDefaultSourceControlTextGenerationSaveTargetKey(
  saveTargets: SourceControlTextGenerationSaveTarget[]
): string {
  const defaultTarget =
    saveTargets.find((saveTarget) => saveTarget.target.type === 'global') ?? saveTargets[0]
  return defaultTarget ? sourceControlTextGenerationSaveTargetKey(defaultTarget.target) : 'global'
}

function agentLabel(agentId: TuiAgent): string {
  return getAgentCatalog().find((agent) => agent.id === agentId)?.label ?? agentId
}

export function SourceControlTextGenerationDialogForm({
  actionId,
  generateLabel,
  settings,
  repo,
  baseParams,
  basePromptPreview,
  saveTargets,
  onGenerate,
  onOpenChange,
  onSaveDefaults
}: SourceControlTextGenerationDialogFormProps): React.JSX.Element {
  const capabilities = (() => listCommitMessageAgentCapabilities())()
  const showCustomAgent = Boolean(
    baseParams && (isCustomAgentId(baseParams.agentId) || baseParams.customAgentCommand?.trim())
  )
  const [agentId, setAgentId] = useState<CommitMessageGenerationAgentChoice>(
    baseParams?.agentId ?? ''
  )
  const [commandTemplate, setCommandTemplate] = useState(
    baseParams?.commandInputTemplate ?? '{basePrompt}'
  )
  const [agentArgs, setAgentArgs] = useState(baseParams?.agentArgs ?? '')
  const [generationError, setGenerationError] = useState<string | null>(null)
  const [savingTargetKey, setSavingTargetKey] = useState<string | null>(null)
  const defaultSaveTargetKey = getDefaultSourceControlTextGenerationSaveTargetKey(saveTargets)
  const [saveTargetKey, setSaveTargetKey] = useState(defaultSaveTargetKey)
  const commandTemplateId = `source-control-${actionId}-command-template`
  const selectedSaveTarget =
    saveTargets.find((saveTarget) => {
      return sourceControlTextGenerationSaveTargetKey(saveTarget.target) === saveTargetKey
    }) ?? saveTargets[0]

  const params = buildCommitMessageGenerationParams({
    agentId,
    commandTemplate,
    agentArgs,
    baseParams,
    settings,
    customAgentCommand: baseParams?.customAgentCommand
  })
  const paramsPlanResult = params ? planSourceControlTextGeneration(actionId, params) : null
  const canRunGeneration = Boolean(params && paramsPlanResult?.ok)
  const saving = savingTargetKey !== null
  const defaultsAlreadySaved = Boolean(
    params &&
    selectedSaveTarget &&
    sourceControlTextGenerationDefaultsMatchTarget({
      actionId,
      target: selectedSaveTarget.target,
      params,
      settings,
      repo
    })
  )
  const allSaveTargetsAlreadySaved = Boolean(
    params &&
    saveTargets.length > 0 &&
    saveTargets.every((saveTarget) =>
      sourceControlTextGenerationDefaultsMatchTarget({
        actionId,
        target: saveTarget.target,
        params,
        settings,
        repo
      })
    )
  )
  const showSaveRecipeControl = Boolean(selectedSaveTarget && !allSaveTargetsAlreadySaved)

  const saveCurrentDefaults = async (
    saveTarget: SourceControlTextGenerationSaveTarget,
    options: { showToast: boolean; showErrors: boolean }
  ): Promise<boolean> => {
    if (!params || saving || !paramsPlanResult?.ok) {
      if (options.showErrors) {
        setGenerationError(
          paramsPlanResult && !paramsPlanResult.ok
            ? paramsPlanResult.error
            : 'Choose an agent before saving defaults.'
        )
      }
      return false
    }
    const targetKey = sourceControlTextGenerationSaveTargetKey(saveTarget.target)
    setSavingTargetKey(targetKey)
    try {
      await onSaveDefaults(saveTarget.target, params)
      if (options.showToast) {
        toast.success(saveTarget.successMessage)
      }
      return true
    } finally {
      setSavingTargetKey(null)
    }
  }

  const handleGenerate = (): void => {
    if (!params || !paramsPlanResult?.ok) {
      setGenerationError(
        paramsPlanResult && !paramsPlanResult.ok
          ? paramsPlanResult.error
          : 'Choose an agent before generating.'
      )
      return
    }
    onGenerate(params)
    onOpenChange(false)
  }

  const handleSaveDefaults = async (
    saveTarget: SourceControlTextGenerationSaveTarget
  ): Promise<void> => {
    await saveCurrentDefaults(saveTarget, { showToast: true, showErrors: true })
  }

  return (
    <>
      <div className="min-w-0 space-y-4">
        <div className="space-y-2">
          <Label className="text-xs">
            {translate(
              'auto.components.right.sidebar.SourceControlTextGenerationDialogForm.9c14186dd2',
              'Agent'
            )}
          </Label>
          <Select
            value={agentId || UNCONFIGURED_AGENT_SELECT_VALUE}
            onValueChange={(value) => {
              if (value === UNCONFIGURED_AGENT_SELECT_VALUE) {
                return
              }
              setAgentId(value === CUSTOM_AGENT_ID ? CUSTOM_AGENT_ID : (value as TuiAgent))
              setGenerationError(null)
            }}
          >
            <SelectTrigger size="sm" className="h-8 text-xs">
              <SelectValue
                placeholder={translate(
                  'auto.components.right.sidebar.SourceControlTextGenerationDialogForm.cce2cbd01d',
                  'Choose agent'
                )}
              />
            </SelectTrigger>
            <SelectContent>
              {capabilities.map((capability) => (
                <SelectItem key={capability.id} value={capability.id}>
                  <span className="flex items-center gap-2">
                    <AgentIcon agent={capability.id} size={14} />
                    {agentLabel(capability.id)}
                  </span>
                </SelectItem>
              ))}
              {showCustomAgent ? (
                <SelectItem value={CUSTOM_AGENT_ID}>
                  <span className="flex items-center gap-2">
                    <Terminal className="text-muted-foreground size-3.5" />
                    {translate(
                      'auto.components.right.sidebar.SourceControlTextGenerationDialogForm.914c8f6ac2',
                      'Custom command'
                    )}
                  </span>
                </SelectItem>
              ) : null}
            </SelectContent>
          </Select>
        </div>

        <div className="space-y-2">
          <Label htmlFor={`source-control-${actionId}-cli-args`} className="text-xs">
            {translate(
              'auto.components.right.sidebar.SourceControlTextGenerationDialogForm.4eab815004',
              'CLI arguments'
            )}
          </Label>
          <Input
            id={`source-control-${actionId}-cli-args`}
            value={agentArgs}
            spellCheck={false}
            placeholder={translate(
              'auto.components.right.sidebar.SourceControlTextGenerationDialogForm.551ffd111b',
              '--model sonnet'
            )}
            onChange={(event) => {
              setAgentArgs(event.target.value)
              setGenerationError(null)
            }}
            className="h-8 font-mono text-xs"
          />
        </div>

        <div className="space-y-2">
          <Label htmlFor={commandTemplateId} className="text-xs">
            {translate(
              'auto.components.right.sidebar.SourceControlTextGenerationDialogForm.1f6fcfb6cf',
              'Command template'
            )}
          </Label>
          <Textarea
            id={commandTemplateId}
            rows={8}
            value={commandTemplate}
            spellCheck={false}
            onChange={(event) => {
              setCommandTemplate(event.target.value)
              setGenerationError(null)
            }}
            className="border-border bg-background text-foreground placeholder:text-muted-foreground/70 box-border w-full max-w-full min-w-0 resize-y border px-2.5 py-2 font-mono text-xs outline-none"
          />
          <SourceControlActionVariableChips
            actionId={actionId}
            variablePreviews={basePromptPreview ? { basePrompt: basePromptPreview } : undefined}
            onInsert={(variable) => {
              const separator =
                commandTemplate.endsWith('\n') || commandTemplate.length === 0 ? '' : ' '
              setCommandTemplate(`${commandTemplate}${separator}{${variable}}`)
              setGenerationError(null)
            }}
          />
        </div>

        {showSaveRecipeControl ? (
          <div className="space-y-2">
            <Label className="text-xs">
              {translate(
                'auto.components.right.sidebar.SourceControlTextGenerationDialogForm.d91b0a189d',
                'Save recipe'
              )}
            </Label>
            <Select
              value={saveTargetKey}
              onValueChange={(value) => value != null && setSaveTargetKey(value)}
            >
              <SelectTrigger size="sm" className="h-8 w-full text-xs">
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                {saveTargets.map((saveTarget) => {
                  const targetKey = sourceControlTextGenerationSaveTargetKey(saveTarget.target)
                  return (
                    <SelectItem key={targetKey} value={targetKey}>
                      {saveTarget.label}
                    </SelectItem>
                  )
                })}
              </SelectContent>
            </Select>
          </div>
        ) : null}

        {generationError ? (
          <p className="border-destructive/30 bg-destructive/5 text-destructive flex items-start gap-1.5 border px-3 py-2 text-xs">
            <TriangleAlert className="mt-px size-3.5 shrink-0" />
            {generationError}
          </p>
        ) : null}
      </div>

      <DialogFooter className="flex-wrap gap-2 sm:justify-end">
        {selectedSaveTarget && !defaultsAlreadySaved ? (
          <Button
            type="button"
            variant="outline"
            size="sm"
            disabled={!canRunGeneration || saving}
            onClick={() => void handleSaveDefaults(selectedSaveTarget)}
          >
            {savingTargetKey === saveTargetKey ? (
              <LoadingIndicator className="size-4" />
            ) : (
              <Save className="size-4" />
            )}
            {translate(
              'auto.components.right.sidebar.SourceControlTextGenerationDialogForm.25fcd8e49a',
              'Save defaults'
            )}
          </Button>
        ) : null}
        <Button
          type="button"
          size="sm"
          disabled={!canRunGeneration || saving}
          onClick={handleGenerate}
        >
          <Sparkles className="size-4" />
          {generateLabel}
        </Button>
      </DialogFooter>
    </>
  )
}
