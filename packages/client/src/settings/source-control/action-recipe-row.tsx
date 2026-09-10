import type { TuiAgent } from '@agentstart/protocol/agent/types'
import type { GlobalSettings } from '@agentstart/protocol/settings/global/model'
import type { SourceControlActionId } from '@agentstart/protocol/source-control/ai-actions'
import type { CustomAgentId } from '@agentstart/protocol/source-control/custom-agent'
import { CUSTOM_AGENT_ID, isCustomAgentId } from '@agentstart/protocol/source-control/custom-agent'
import { AgentIcon } from '~renderer/agent/catalog'
import { translate } from '~renderer/i18n/i18n'
import { Terminal } from '~renderer/icons/hugeicons'
import { SourceControlActionVariableChips } from '~renderer/source-control/action-variable-chips'
import { getSourceControlActionLabels } from '~renderer/source-control/ai/action-copy'
import { Button } from '~renderer/ui/button'
import { Input } from '~renderer/ui/input'
import { Label } from '~renderer/ui/label'
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '~renderer/ui/select'
import { Textarea } from '~renderer/ui/textarea'

import {
  getActionDescriptions,
  SOURCE_CONTROL_TEXT_ACTION_ID_SET,
  getAgentCatalogForAction,
  getSourceControlActionAgentSupportText,
  getSourceControlActionAgentWarningText,
  getSourceControlAgentArgsPlaceholder
} from './action-recipe-options'
import type { ActionRecipeDraftValue } from './ai-action-recipe-draft'

const DEFAULT_AGENT_VALUE = '__default_agent__'

type SourceControlActionRecipeRowProps = {
  actionId: SourceControlActionId
  selectedAgent: TuiAgent | CustomAgentId | null
  draftValue: ActionRecipeDraftValue
  baseValue: ActionRecipeDraftValue
  defaultTuiAgent: GlobalSettings['defaultTuiAgent']
  isSavingTemplate: boolean
  repoOverrideNote?: React.ReactNode
  onAgentChange: (actionId: SourceControlActionId, value: string) => void
  onTemplateChange: (actionId: SourceControlActionId, value: string) => void
  onAgentArgsChange: (actionId: SourceControlActionId, value: string) => void
  onAppendVariable: (actionId: SourceControlActionId, variable: string) => void
  onDiscard: (actionId: SourceControlActionId) => void
  onSave: (actionId: SourceControlActionId) => void
}

function resolveAgentArgsPlaceholderAgent(
  selectedAgent: TuiAgent | CustomAgentId | null | undefined,
  defaultTuiAgent: GlobalSettings['defaultTuiAgent']
): TuiAgent | null {
  if (selectedAgent && !isCustomAgentId(selectedAgent)) {
    return selectedAgent
  }
  return defaultTuiAgent && defaultTuiAgent !== 'blank' ? defaultTuiAgent : null
}

export function SourceControlActionRecipeRow({
  actionId,
  selectedAgent,
  draftValue,
  baseValue,
  defaultTuiAgent,
  isSavingTemplate,
  repoOverrideNote,
  onAgentChange,
  onTemplateChange,
  onAgentArgsChange,
  onAppendVariable,
  onDiscard,
  onSave
}: SourceControlActionRecipeRowProps): React.JSX.Element {
  const templateDirty = JSON.stringify(draftValue) !== JSON.stringify(baseValue)
  const agentArgsPlaceholder = getSourceControlAgentArgsPlaceholder(
    resolveAgentArgsPlaceholderAgent(selectedAgent, defaultTuiAgent)
  )
  const agentOptions = getAgentCatalogForAction(actionId, selectedAgent)
  const agentWarningText = getSourceControlActionAgentWarningText(actionId, selectedAgent)
  const agentSupportText = getSourceControlActionAgentSupportText(actionId)

  return (
    <div className="border-border rounded-md border px-3 py-3">
      <div className="flex flex-col gap-3 sm:flex-row sm:items-start sm:justify-between">
        <div className="min-w-0 space-y-0.5">
          <p className="text-foreground text-xs font-medium">
            {getSourceControlActionLabels()[actionId]}
          </p>
          <p className="text-muted-foreground text-[11px]">{getActionDescriptions()[actionId]}</p>
        </div>
        <div className="w-full shrink-0 space-y-1 sm:w-[220px]">
          <Select
            value={selectedAgent ?? DEFAULT_AGENT_VALUE}
            onValueChange={(value) => {
              if (value) {
                onAgentChange(actionId, value)
              }
            }}
          >
            <SelectTrigger size="sm" className="h-8 w-full text-xs">
              <SelectValue />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value={DEFAULT_AGENT_VALUE}>
                <span className="flex items-center gap-2">
                  <Terminal className="text-muted-foreground size-3.5" />
                  {translate(
                    'auto.components.settings.SourceControlAiActionRecipeDefaults.ee0e5c2a48',
                    'Use default agent'
                  )}
                </span>
              </SelectItem>
              {SOURCE_CONTROL_TEXT_ACTION_ID_SET.has(actionId) ? (
                <SelectItem value={CUSTOM_AGENT_ID}>
                  <span className="flex items-center gap-2">
                    <Terminal className="text-muted-foreground size-3.5" />
                    {translate(
                      'auto.components.settings.SourceControlAiActionRecipeDefaults.0740d30915',
                      'Custom command'
                    )}
                  </span>
                </SelectItem>
              ) : null}
              {agentOptions.map((agent) => (
                <SelectItem key={agent.id} value={agent.id}>
                  <span className="flex items-center gap-2">
                    <AgentIcon agent={agent.id} size={14} />
                    {agent.label}
                  </span>
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
          {agentWarningText ? (
            <p className="text-destructive text-[11px]">{agentWarningText}</p>
          ) : agentSupportText ? (
            <p className="text-muted-foreground text-[11px]">{agentSupportText}</p>
          ) : null}
        </div>
      </div>
      <div className="mt-3 grid gap-3 sm:grid-cols-[220px_1fr]">
        <div className="space-y-2">
          <Label className="text-muted-foreground text-[11px]">
            {translate(
              'auto.components.settings.SourceControlAiActionRecipeDefaults.2cb4bb7e5d',
              'CLI arguments'
            )}
          </Label>
          <Input
            value={draftValue.agentArgs}
            spellCheck={false}
            placeholder={agentArgsPlaceholder}
            onChange={(event) => onAgentArgsChange(actionId, event.target.value)}
            className="h-8 font-mono text-xs"
          />
        </div>
        <div className="space-y-2">
          <Label className="text-muted-foreground text-[11px]">
            {translate(
              'auto.components.settings.SourceControlAiActionRecipeDefaults.fb09da4345',
              'Command template'
            )}
          </Label>
          <Textarea
            value={draftValue.commandInputTemplate}
            rows={3}
            spellCheck={false}
            onChange={(event) => onTemplateChange(actionId, event.target.value)}
            className="border-border bg-background text-foreground placeholder:text-muted-foreground/70 w-full resize-y rounded-md border px-2.5 py-2 font-mono text-xs outline-none"
          />
          <SourceControlActionVariableChips
            actionId={actionId}
            onInsert={(variable) => onAppendVariable(actionId, variable)}
          />
        </div>
      </div>
      <div className="mt-3 space-y-2">
        {repoOverrideNote}
        <div className="flex items-center justify-between gap-3">
          <p className="text-muted-foreground text-[11px]">
            {templateDirty
              ? translate(
                  'auto.components.settings.SourceControlAiActionRecipeDefaults.817128d94e',
                  'Unsaved changes'
                )
              : translate(
                  'auto.components.settings.SourceControlAiActionRecipeDefaults.9d3cc627f8',
                  'Saved'
                )}
          </p>
          <div className="flex items-center gap-2">
            {templateDirty ? (
              <Button
                type="button"
                variant="ghost"
                size="xs"
                onClick={() => onDiscard(actionId)}
                disabled={isSavingTemplate}
              >
                {translate(
                  'auto.components.settings.SourceControlAiActionRecipeDefaults.b3914ecbbc',
                  'Discard'
                )}
              </Button>
            ) : null}
            <Button
              type="button"
              variant="secondary"
              size="xs"
              onClick={() => onSave(actionId)}
              disabled={!templateDirty || isSavingTemplate}
            >
              {isSavingTemplate
                ? translate(
                    'auto.components.settings.SourceControlAiActionRecipeDefaults.4f549a5fa8',
                    'Saving...'
                  )
                : translate(
                    'auto.components.settings.SourceControlAiActionRecipeDefaults.d18d665e12',
                    'Save'
                  )}
            </Button>
          </div>
        </div>
      </div>
    </div>
  )
}
