import type { SetupAgentStartupPolicy } from '@agentstart/protocol/worktree/hooks'
import React from 'react'
import { translate } from '~renderer/i18n/i18n'
import type { SetupConfig } from '~renderer/new-workspace/workspace-creation'
import { SettingsSwitch } from '~renderer/settings/form-controls'
import { Button } from '~renderer/ui/button'
import { Checkbox } from '~renderer/ui/checkbox'

import { SetupCommandPreview } from './setup-command-preview'

type SetupSectionProps = {
  setupConfig: SetupConfig
  requiresExplicitSetupChoice: boolean
  setupDecision: 'run' | 'skip' | null
  onSetupDecisionChange: (value: 'run' | 'skip') => void
  setupAgentStartupPolicy: SetupAgentStartupPolicy
  onSetupAgentStartupPolicyChange: (value: SetupAgentStartupPolicy) => void
  shouldWaitForSetupCheck: boolean
  resolvedSetupDecision: 'run' | 'skip' | null
}

export function SetupSection({
  setupConfig,
  requiresExplicitSetupChoice,
  setupDecision,
  onSetupDecisionChange,
  setupAgentStartupPolicy,
  onSetupAgentStartupPolicyChange,
  shouldWaitForSetupCheck,
  resolvedSetupDecision
}: SetupSectionProps): React.JSX.Element {
  const setupConfigLabel =
    setupConfig.kind === 'default-tabs'
      ? 'Default tab commands'
      : setupConfig.kind === 'setup-and-default-tabs'
        ? 'Setup and default tab commands'
        : 'Setup script'
  const setupRunLabel =
    setupConfig.kind === 'default-tabs'
      ? 'Run default tab commands'
      : setupConfig.kind === 'setup-and-default-tabs'
        ? 'Run setup and default tab commands'
        : 'Run setup command'
  const setupAskLabel =
    setupConfig.kind === 'default-tabs'
      ? 'Run default tab commands now?'
      : setupConfig.kind === 'setup-and-default-tabs'
        ? 'Run setup and default tab commands now?'
        : 'Run setup now?'
  const setupRunButtonLabel =
    setupConfig.kind === 'default-tabs'
      ? 'Run commands now'
      : setupConfig.kind === 'setup-and-default-tabs'
        ? 'Run commands now'
        : 'Run setup now'
  const setupSkipButtonLabel = setupConfig.kind === 'setup' ? 'Skip for now' : 'Skip commands'
  // Why: defaultTabs launch commands can be long-running too, but they are not
  // the setup command this setting gates agent startup on.
  const showSetupAgentStartupPolicy = setupConfig.kind !== 'default-tabs'

  return (
    <div className="space-y-2">
      <div className="flex flex-wrap items-center justify-between gap-2">
        <label className="text-muted-foreground text-xs font-medium">{setupConfigLabel}</label>
        <span className="border-border/70 bg-muted/45 text-foreground/70 border px-2 py-0.5 text-[10px] font-medium tracking-[0.14em] uppercase">
          {setupConfig.source === 'yaml'
            ? translate('auto.components.NewWorkspaceComposerCard.23bb365554', 'agentstart.yaml')
            : setupConfig.source === 'both'
              ? translate(
                  'auto.components.NewWorkspaceComposerCard.326a578923',
                  'agentstart.yaml + local'
                )
              : translate('auto.components.NewWorkspaceComposerCard.92e34f0311', 'local settings')}
        </span>
      </div>

      {/* Why: `agentstart.yaml` is the committed source of truth for shared setup,
          so the preview reconstructs the real YAML shape instead of showing a raw
          shell blob that hides where the command came from. */}
      <SetupCommandPreview
        setupConfig={setupConfig}
        headerAction={
          requiresExplicitSetupChoice ? null : (
            <label className="text-foreground flex items-center gap-2 text-xs">
              <Checkbox
                checked={resolvedSetupDecision === 'run'}
                onCheckedChange={(checked) => onSetupDecisionChange(checked ? 'run' : 'skip')}
              />
              <span>{setupRunLabel}</span>
            </label>
          )
        }
      />

      {requiresExplicitSetupChoice ? (
        <div className="space-y-2">
          <div className="text-muted-foreground text-[11px] font-medium">{setupAskLabel}</div>
          <div className="flex flex-wrap items-center gap-2">
            <Button
              type="button"
              onClick={() => onSetupDecisionChange('run')}
              variant={setupDecision === 'run' ? 'default' : 'outline'}
              size="sm"
            >
              {setupRunButtonLabel}
            </Button>
            <Button
              type="button"
              onClick={() => onSetupDecisionChange('skip')}
              variant={setupDecision === 'skip' ? 'secondary' : 'outline'}
              size="sm"
            >
              {setupSkipButtonLabel}
            </Button>
          </div>
          {!setupDecision ? (
            <div className="text-muted-foreground text-xs">
              {shouldWaitForSetupCheck
                ? translate(
                    'auto.components.NewWorkspaceComposerCard.803b7fe72f',
                    'Checking setup configuration...'
                  )
                : translate(
                    'auto.components.NewWorkspaceComposerCard.9a70e4859e',
                    'Choose whether to run setup before creating this workspace.'
                  )}
            </div>
          ) : null}
        </div>
      ) : null}

      {showSetupAgentStartupPolicy ? (
        <div className="border-border/60 bg-muted/25 flex items-start justify-between gap-3 border p-3">
          <span className="min-w-0 space-y-1">
            <span className="text-foreground block text-xs font-medium">
              {translate(
                'auto.components.NewWorkspaceComposerCard.waitForSetupBeforeAgent',
                'Wait for setup to complete before starting agent'
              )}
            </span>
            <span className="text-muted-foreground block text-[11px]">
              {translate(
                'auto.components.NewWorkspaceComposerCard.waitForSetupBeforeAgentHelp',
                'Turn this on when setup installs dependencies, MCP servers, or config files the agent needs during startup.'
              )}
            </span>
          </span>
          <SettingsSwitch
            checked={setupAgentStartupPolicy === 'wait-for-setup'}
            onChange={() =>
              onSetupAgentStartupPolicyChange(
                setupAgentStartupPolicy === 'wait-for-setup'
                  ? 'start-immediately'
                  : 'wait-for-setup'
              )
            }
            ariaLabel={translate(
              'auto.components.NewWorkspaceComposerCard.waitForSetupBeforeAgent',
              'Wait for setup to complete before starting agent'
            )}
          />
        </div>
      ) : null}
    </div>
  )
}
