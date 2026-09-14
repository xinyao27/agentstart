import type { TuiAgent } from '@agentstart/protocol/agent/types'
import type {
  SourceControlActionRecipe,
  SourceControlLaunchActionId
} from '@agentstart/protocol/source-control/ai-actions'
import type { LaunchSource } from '@agentstart/protocol/telemetry/events/foundations'
import React from 'react'
import type { SourceControlAiWriteTarget } from '~renderer/source-control/ai-recipe-save'
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle
} from '~renderer/ui/dialog'

import { SourceControlAgentActionDialogForm } from './agent-action-dialog-form'
import { useSourceControlAgentActionDialog } from './use-agent-action-dialog'

export type SourceControlAgentActionDialogProps = {
  open: boolean
  onOpenChange: (open: boolean) => void
  actionId: SourceControlLaunchActionId
  title: string
  description: string
  baseCommandInput: string
  savedCommandInputTemplate?: string | null
  savedAgentArgs?: string | null
  worktreeId?: string | null
  groupId?: string | null
  connectionId?: string | null
  repoId?: string | null
  promptDelivery?: 'auto-submit' | 'draft' | 'submit-after-ready'
  launchPlatform?: NodeJS.Platform
  launchSource: LaunchSource
  savedAgentId?: TuiAgent | null
  onSaveAgentDefault?: (
    target: SourceControlAiWriteTarget,
    actionId: SourceControlLaunchActionId,
    recipe: SourceControlActionRecipe
  ) => void | Promise<void>
  onOpenSettings?: () => void
  onLaunched?: () => void
  startLabel?: string
  onStart?: (args: {
    agent: TuiAgent
    commandInput: string
    agentArgs: string
  }) => boolean | Promise<boolean>
}

export function SourceControlAgentActionDialog(
  props: SourceControlAgentActionDialogProps
): React.JSX.Element {
  const {
    open,
    actionId,
    title,
    description,
    baseCommandInput,
    savedCommandInputTemplate,
    onOpenSettings,
    startLabel = 'Start agent',
    onSaveAgentDefault
  } = props
  const {
    handleOpenChange,
    shouldRenderDialog,
    agentScopeNote,
    agentOptions,
    selectedAgent,
    hasEnabledAgents,
    detecting,
    statusCopy,
    agentArgs,
    commandTemplate,
    saveLaunchRecipe,
    saveTargetValue,
    saveTargets,
    settings,
    repo,
    deliveryPlan,
    canStart,
    isStarting,
    onSelectedAgentChange,
    onAgentArgsChange,
    onCommandTemplateChange,
    onSaveLaunchRecipeChange,
    onSaveAgentDefaultChange,
    handleStart
  } = useSourceControlAgentActionDialog(props)

  return (
    <Dialog open={open && shouldRenderDialog} onOpenChange={handleOpenChange}>
      {/* Why: an open modal with no popup makes the workbench look frozen while
          a saved recipe waits for agent detection. Keep the modal closed while
          that recipe auto-starts in the background. */}
      {shouldRenderDialog ? (
        <DialogContent className="flex max-h-[min(82vh,42rem)] min-w-0 flex-col overflow-hidden sm:max-w-2xl">
          <DialogHeader className="shrink-0">
            <DialogTitle className="text-sm">{title}</DialogTitle>
            <DialogDescription className="text-xs">{description}</DialogDescription>
          </DialogHeader>
          <SourceControlAgentActionDialogForm
            actionId={actionId}
            baseCommandInput={baseCommandInput}
            agentScopeNote={agentScopeNote}
            agentOptions={agentOptions}
            selectedAgent={selectedAgent}
            hasEnabledAgents={hasEnabledAgents}
            detecting={detecting}
            statusCopy={statusCopy}
            agentArgs={agentArgs}
            commandTemplate={commandTemplate}
            savedCommandInputTemplate={savedCommandInputTemplate}
            saveLaunchRecipe={saveLaunchRecipe}
            saveTargetValue={saveTargetValue}
            saveTargets={saveTargets}
            settings={settings}
            repo={repo}
            canSaveAgentDefault={Boolean(onSaveAgentDefault)}
            deliveryPlan={deliveryPlan}
            canStart={canStart}
            isStarting={isStarting}
            startLabel={startLabel}
            onSelectedAgentChange={onSelectedAgentChange}
            onAgentArgsChange={onAgentArgsChange}
            onCommandTemplateChange={onCommandTemplateChange}
            onSaveLaunchRecipeChange={onSaveLaunchRecipeChange}
            onSaveAgentDefaultChange={onSaveAgentDefaultChange}
            onOpenSettings={onOpenSettings}
            onCancel={() => handleOpenChange(false)}
            onStart={() => void handleStart()}
          />
        </DialogContent>
      ) : null}
    </Dialog>
  )
}
