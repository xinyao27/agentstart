import type { SparsePreset } from '@yiru/protocol/worktree/create-result'
import type { SetupAgentStartupPolicy } from '@yiru/protocol/worktree/hooks'
import React from 'react'
import { translate } from '~renderer/i18n/i18n'
import { CaretDown as ChevronDown } from '~renderer/icons/hugeicons'
import type { SmartWorkspaceNameSelection } from '~renderer/new-workspace/smart-workspace-name-field'
import type { SetupConfig } from '~renderer/new-workspace/workspace-creation'
import { Button } from '~renderer/ui/button'
import { cn } from '~renderer/ui/class-names'
import { Input } from '~renderer/ui/input'

import { NoteField } from './note-field'
import { SetupSection } from './setup-section'
import { SparseCheckoutSection } from './sparse-checkout-section'

type AdvancedSectionProps = {
  advancedOpen: boolean
  onToggleAdvanced: () => void
  smartNameSelection: SmartWorkspaceNameSelection | null
  name: string
  onNameValueChange: (value: string) => void
  selectedRepoIsGit: boolean
  branchesEnabled: boolean
  branchNameOverride: string | undefined
  onBranchNameOverrideChange: (value: string | undefined) => void
  note: string
  onNoteChange: (value: string) => void
  setupControlsEnabled: boolean
  setupConfig: SetupConfig | null
  requiresExplicitSetupChoice: boolean
  setupDecision: 'run' | 'skip' | null
  onSetupDecisionChange: (value: 'run' | 'skip') => void
  setupAgentStartupPolicy: SetupAgentStartupPolicy
  onSetupAgentStartupPolicyChange: (value: SetupAgentStartupPolicy) => void
  shouldWaitForSetupCheck: boolean
  resolvedSetupDecision: 'run' | 'skip' | null
  sparseControlsEnabled: boolean
  repoId: string
  sparsePresets: SparsePreset[]
  sparseSelectedPresetId: string | null
  onSparseSelectPreset: (preset: SparsePreset | null) => void
  canUseSparseCheckout: boolean
}

export function AdvancedSection({
  advancedOpen,
  onToggleAdvanced,
  smartNameSelection,
  name,
  onNameValueChange,
  selectedRepoIsGit,
  branchesEnabled,
  branchNameOverride,
  onBranchNameOverrideChange,
  note,
  onNoteChange,
  setupControlsEnabled,
  setupConfig,
  requiresExplicitSetupChoice,
  setupDecision,
  onSetupDecisionChange,
  setupAgentStartupPolicy,
  onSetupAgentStartupPolicyChange,
  shouldWaitForSetupCheck,
  resolvedSetupDecision,
  sparseControlsEnabled,
  repoId,
  sparsePresets,
  sparseSelectedPresetId,
  onSparseSelectPreset,
  canUseSparseCheckout
}: AdvancedSectionProps): React.JSX.Element {
  const branchNameInputId = React.useId()

  return (
    <>
      {/* Why: Advanced is a disclosure header, so keep it visually grouped
          with the content or footer below it while preserving normal spacing
          from the Agent field above. */}
      <div className="!mb-2">
        <Button
          type="button"
          variant="ghost"
          size="sm"
          onClick={onToggleAdvanced}
          className="-ml-2 text-xs"
        >
          {translate('auto.components.NewWorkspaceComposerCard.f0470c7383', 'Advanced')}
          <ChevronDown
            className={cn('size-4 transition-transform', advancedOpen && 'rotate-180')}
          />
        </Button>
      </div>

      <div
        className={cn(
          'grid overflow-hidden transition-[grid-template-rows] duration-200 ease-out',
          !advancedOpen && '!mt-2',
          advancedOpen ? 'grid-rows-[1fr]' : 'grid-rows-[0fr]'
        )}
        aria-hidden={!advancedOpen}
      >
        <div className="min-h-0">
          <div
            className={cn(
              'space-y-4 pt-1 pb-3 transition-[opacity,transform] duration-150 ease-out',
              advancedOpen
                ? 'translate-y-0 opacity-100 delay-200'
                : '-translate-y-1 opacity-0 delay-0'
            )}
          >
            {smartNameSelection ? (
              // Why: when a source (PR/branch) is picked the
              // smart field shows a pill instead of an editable name, so
              // surface the auto-derived workspace name here under Advanced
              // where it can be reviewed/overridden. When the user typed an
              // explicit name there's no source pill — the smart input is
              // already the name field, so we don't duplicate it here.
              <div className="space-y-1">
                <label className="text-muted-foreground text-xs font-medium">
                  {translate('auto.components.NewWorkspaceComposerCard.2688050e4b', 'Name')}
                </label>
                <Input
                  type="text"
                  size="default"
                  value={name}
                  onChange={(event) => onNameValueChange(event.target.value)}
                  placeholder={translate(
                    'auto.components.NewWorkspaceComposerCard.0ee17638fe',
                    'Workspace name'
                  )}
                />
              </div>
            ) : null}

            {/* Why: only offer a manual branch name when creating from a
                typed name or a base branch. When a tracked GitHub PR is the
                source, the branch is derived from that item and re-resolved at submit,
                so an override typed here would be silently ignored. */}
            {selectedRepoIsGit &&
            branchesEnabled &&
            (!smartNameSelection || smartNameSelection.kind === 'branch') ? (
              <div className="space-y-1">
                <label
                  htmlFor={branchNameInputId}
                  className="text-muted-foreground text-xs font-medium"
                >
                  {translate('auto.components.NewWorkspaceComposerCard.branchName', 'Branch name')}
                </label>
                <Input
                  id={branchNameInputId}
                  type="text"
                  size="default"
                  value={branchNameOverride ?? ''}
                  onChange={(event) => onBranchNameOverrideChange(event.target.value)}
                  placeholder={translate(
                    'auto.components.NewWorkspaceComposerCard.branchNamePlaceholder',
                    'feature/my-branch'
                  )}
                />
              </div>
            ) : null}

            <NoteField note={note} onNoteChange={onNoteChange} />

            {setupControlsEnabled && setupConfig ? (
              <SetupSection
                setupConfig={setupConfig}
                requiresExplicitSetupChoice={requiresExplicitSetupChoice}
                setupDecision={setupDecision}
                onSetupDecisionChange={onSetupDecisionChange}
                setupAgentStartupPolicy={setupAgentStartupPolicy}
                onSetupAgentStartupPolicyChange={onSetupAgentStartupPolicyChange}
                shouldWaitForSetupCheck={shouldWaitForSetupCheck}
                resolvedSetupDecision={resolvedSetupDecision}
              />
            ) : null}

            {sparseControlsEnabled ? (
              <SparseCheckoutSection
                repoId={repoId}
                sparsePresets={sparsePresets}
                sparseSelectedPresetId={sparseSelectedPresetId}
                onSparseSelectPreset={onSparseSelectPreset}
                canUseSparseCheckout={canUseSparseCheckout}
              />
            ) : null}
          </div>
        </div>
      </div>
    </>
  )
}
