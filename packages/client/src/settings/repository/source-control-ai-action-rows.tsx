import type { TuiAgent } from '@agentstart/protocol/agent/types'
import {
  SOURCE_CONTROL_ACTION_IDS,
  type SourceControlActionId
} from '@agentstart/protocol/source-control/ai-actions'
import type {
  RepoSourceControlAiOverrides,
  SourceControlAiSettings
} from '@agentstart/protocol/source-control/ai-types'
import { CUSTOM_AGENT_ID } from '@agentstart/protocol/source-control/custom-agent'
import type React from 'react'
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
} from '../source-control/action-recipe-options'
import { getRepositorySourceControlAiActionRecipeSectionId } from './settings-targets'
import { hasOwnActionOverride } from './source-control-ai-draft'
import {
  ACTION_MODE_INHERIT,
  ACTION_MODE_OVERRIDE,
  DEFAULT_AGENT_VALUE,
  actionAgentSelectValue,
  actionScopeLabel,
  agentArgsStateLabel,
  commandTemplateStateLabel,
  readInheritedAgentArgs,
  readInheritedCommandTemplate,
  resolveAgentArgsPlaceholderAgent
} from './source-control-ai-labels'

type RepositorySourceControlAiActionRowsProps = {
  repoId: string
  repoAi: RepoSourceControlAiOverrides
  source: SourceControlAiSettings
  defaultTuiAgent: TuiAgent | 'blank' | null | undefined
  onActionModeChange: (actionId: SourceControlActionId, mode: string) => void
  onActionAgentChange: (actionId: SourceControlActionId, value: string) => void
  onActionTemplateChange: (actionId: SourceControlActionId, value: string) => void
  onActionAgentArgsChange: (actionId: SourceControlActionId, value: string) => void
  onAppendVariable: (actionId: SourceControlActionId, variable: string) => void
  isSaving: boolean
  actionDirtyById: Record<SourceControlActionId, boolean>
  onActionDiscard: (actionId: SourceControlActionId) => void
  onActionSave: (actionId: SourceControlActionId) => void
}

export function RepositorySourceControlAiActionRows({
  repoId,
  repoAi,
  source,
  defaultTuiAgent,
  onActionModeChange,
  onActionAgentChange,
  onActionTemplateChange,
  onActionAgentArgsChange,
  onAppendVariable,
  isSaving,
  actionDirtyById,
  onActionDiscard,
  onActionSave
}: RepositorySourceControlAiActionRowsProps): React.JSX.Element {
  return (
    <div className="space-y-3">
      <Label className="text-xs font-medium">
        {translate(
          'auto.components.settings.RepositorySourceControlAiActionRows.f0aa2cfaea',
          'Action recipes'
        )}
      </Label>
      {SOURCE_CONTROL_ACTION_IDS.map((actionId) => {
        const hasOverride = hasOwnActionOverride(repoAi.actionOverrides, actionId)
        const override = repoAi.actionOverrides?.[actionId]
        const inheritedTemplate = readInheritedCommandTemplate(source, actionId)
        const inheritedAgentArgs = readInheritedAgentArgs(source, actionId)
        const templateValue =
          hasOverride && typeof override?.commandInputTemplate === 'string'
            ? override.commandInputTemplate
            : ''
        const agentArgsValue =
          hasOverride && typeof override?.agentArgs === 'string' ? override.agentArgs : ''
        const effectiveAgent = hasOverride ? override?.agentId : source.actions?.[actionId]?.agentId
        const agentArgsPlaceholder =
          hasOverride && agentArgsValue
            ? ''
            : inheritedAgentArgs ||
              getSourceControlAgentArgsPlaceholder(
                resolveAgentArgsPlaceholderAgent(effectiveAgent, source, actionId, defaultTuiAgent)
              )
        const agentOptions = getAgentCatalogForAction(actionId, effectiveAgent)
        const agentWarningText = getSourceControlActionAgentWarningText(actionId, effectiveAgent)
        const agentSupportText = getSourceControlActionAgentSupportText(actionId)
        const actionDirty = actionDirtyById[actionId]
        return (
          <div
            key={actionId}
            id={getRepositorySourceControlAiActionRecipeSectionId(repoId, actionId)}
            data-settings-section={getRepositorySourceControlAiActionRecipeSectionId(
              repoId,
              actionId
            )}
            className="border-border scroll-mt-8 space-y-3 rounded-md border px-3 py-3"
          >
            <div className="flex flex-col gap-3 sm:flex-row sm:items-start sm:justify-between">
              <div className="min-w-0 space-y-0.5">
                <p className="text-foreground text-xs font-medium">
                  {getSourceControlActionLabels()[actionId]}
                </p>
                <p className="text-muted-foreground text-[11px]">
                  {getActionDescriptions()[actionId]}
                </p>
                <div className="text-muted-foreground flex flex-wrap gap-x-2 gap-y-1 text-[11px]">
                  <span>{actionScopeLabel(hasOverride)}</span>
                  <span>
                    {commandTemplateStateLabel({ hasOverride, inheritedTemplate, actionId })}
                  </span>
                  <span>
                    {agentArgsStateLabel({
                      hasOverride,
                      inheritedAgentArgs,
                      repoAgentArgs: agentArgsValue
                    })}
                  </span>
                </div>
              </div>
              <Select
                value={hasOverride ? ACTION_MODE_OVERRIDE : ACTION_MODE_INHERIT}
                onValueChange={(value) => value && onActionModeChange(actionId, value)}
              >
                <SelectTrigger size="sm" className="h-8 w-full shrink-0 text-xs sm:w-[150px]">
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value={ACTION_MODE_INHERIT}>
                    {translate(
                      'auto.components.settings.RepositorySourceControlAiActionRows.403876bb48',
                      'Use global'
                    )}
                  </SelectItem>
                  <SelectItem value={ACTION_MODE_OVERRIDE}>
                    {translate(
                      'auto.components.settings.RepositorySourceControlAiActionRows.1cd88d470a',
                      'Customize'
                    )}
                  </SelectItem>
                </SelectContent>
              </Select>
            </div>
            <div className="grid gap-3 sm:grid-cols-[180px_1fr]">
              <div className="space-y-2">
                <Label className="text-muted-foreground text-[11px]">
                  {translate(
                    'auto.components.settings.RepositorySourceControlAiActionRows.f4310cf63f',
                    'Agent'
                  )}
                </Label>
                <Select
                  value={actionAgentSelectValue(effectiveAgent)}
                  onValueChange={(value) => value && onActionAgentChange(actionId, value)}
                  disabled={!hasOverride}
                >
                  <SelectTrigger size="sm" className="h-8 w-full text-xs">
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value={DEFAULT_AGENT_VALUE}>
                      <span className="flex items-center gap-2">
                        <Terminal className="text-muted-foreground size-3.5" />
                        {translate(
                          'auto.components.settings.RepositorySourceControlAiActionRows.0ffb081b3a',
                          'Use default agent'
                        )}
                      </span>
                    </SelectItem>
                    {SOURCE_CONTROL_TEXT_ACTION_ID_SET.has(actionId) ? (
                      <SelectItem value={CUSTOM_AGENT_ID}>
                        <span className="flex items-center gap-2">
                          <Terminal className="text-muted-foreground size-3.5" />
                          {translate(
                            'auto.components.settings.RepositorySourceControlAiActionRows.2b2f38652b',
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
                <Label className="text-muted-foreground text-[11px]">
                  {translate(
                    'auto.components.settings.RepositorySourceControlAiActionRows.7a3a8e431d',
                    'CLI arguments'
                  )}
                </Label>
                <Input
                  value={agentArgsValue}
                  onChange={(event) => onActionAgentArgsChange(actionId, event.target.value)}
                  disabled={!hasOverride}
                  placeholder={agentArgsPlaceholder}
                  spellCheck={false}
                  className="disabled:bg-muted/40 h-8 font-mono text-xs disabled:cursor-not-allowed"
                />
              </div>
              <div className="space-y-2">
                <Label className="text-muted-foreground text-[11px]">
                  {translate(
                    'auto.components.settings.RepositorySourceControlAiActionRows.548a6e1281',
                    'Command template'
                  )}
                </Label>
                <Textarea
                  rows={3}
                  value={templateValue}
                  onChange={(event) => onActionTemplateChange(actionId, event.target.value)}
                  disabled={!hasOverride}
                  placeholder={inheritedTemplate}
                  spellCheck={false}
                  className="border-border bg-background text-foreground placeholder:text-muted-foreground/70 disabled:bg-muted/40 w-full resize-y rounded-md border px-2.5 py-2 font-mono text-xs outline-none disabled:cursor-not-allowed"
                />
                <SourceControlActionVariableChips
                  actionId={actionId}
                  disabled={!hasOverride}
                  onInsert={(variable) => onAppendVariable(actionId, variable)}
                />
              </div>
            </div>
            {hasOverride ? (
              <div className="border-border flex items-center justify-between gap-3 border-t pt-3">
                <p className="text-muted-foreground text-[11px]">
                  {actionDirty
                    ? translate(
                        'auto.components.settings.RepositorySourceControlAiSection.e57dde9d93',
                        'Unsaved changes'
                      )
                    : translate(
                        'auto.components.settings.RepositorySourceControlAiSection.ccb07dd027',
                        'Saved'
                      )}
                </p>
                <div className="flex items-center gap-2">
                  {actionDirty ? (
                    <Button
                      type="button"
                      variant="ghost"
                      size="xs"
                      onClick={() => onActionDiscard(actionId)}
                      disabled={isSaving}
                    >
                      {translate(
                        'auto.components.settings.RepositorySourceControlAiSection.67b3ff5467',
                        'Discard'
                      )}
                    </Button>
                  ) : null}
                  <Button
                    type="button"
                    variant="secondary"
                    size="xs"
                    onClick={() => onActionSave(actionId)}
                    disabled={!actionDirty || isSaving}
                  >
                    {isSaving
                      ? translate(
                          'auto.components.settings.RepositorySourceControlAiSection.57e6e9d4b1',
                          'Saving...'
                        )
                      : translate(
                          'auto.components.settings.RepositorySourceControlAiSection.152268c295',
                          'Save'
                        )}
                  </Button>
                </div>
              </div>
            ) : null}
          </div>
        )
      })}
    </div>
  )
}
