import { AGENTSTART_CLI_SKILL_INSTALL_COMMAND } from '~renderer/agent/feature-install-commands'
import { translate } from '~renderer/i18n/i18n'
import { LoadingIndicator } from '~renderer/loading/indicator'
import {
  AGENT_SKILL_CLI_PREREQUISITE_NOTICE,
  ensureAgentStartCliAvailableForAgentSkillTerminal
} from '~renderer/skills/agent-cli-prerequisite'
import { useAppStore } from '~renderer/store/state'
import { cn } from '~renderer/ui/class-names'

import { AgentSkillSetupPanel } from '../settings/agent/skill-setup-panel'
import { Button } from '../ui/button'
import { Tooltip, TooltipContent, TooltipProvider, TooltipTrigger } from '../ui/tooltip'
import {
  getMobileEmulatorCliStepBadgeState,
  shouldShowMobileEmulatorSkillPreInstallNotice
} from './mobile-emulator-agent-setup-cli-state'
import { StepBadge } from './setup-step-badge'
import type { useMobileEmulatorAgentSetupState } from './use-mobile-emulator-agent-setup-state'

type MobileEmulatorAgentSetupGuideStepsProps = {
  setup: ReturnType<typeof useMobileEmulatorAgentSetupState>
  worktreeId: string
}

export function MobileEmulatorAgentSetupGuideSteps({
  setup,
  worktreeId
}: MobileEmulatorAgentSetupGuideStepsProps): React.JSX.Element {
  const recordFeatureInteraction = useAppStore((s) => s.recordFeatureInteraction)
  const terminalWorktreeId = `mobile-emulator-${worktreeId}-agentstart-cli-skill-terminal`
  const showSkillPreInstallNotice = shouldShowMobileEmulatorSkillPreInstallNotice({
    cliEnabled: setup.cliEnabled,
    cliSkillInstalled: setup.cliSkillInstalled
  })

  return (
    <div className="divide-border/40 divide-y">
      <div className="flex items-center gap-3 py-2.5">
        <StepBadge
          index={1}
          state={getMobileEmulatorCliStepBadgeState({
            cliBusy: setup.cliBusy,
            cliEnabled: setup.cliEnabled,
            cliPathNeedsAttention: setup.cliPathNeedsAttention
          })}
        />
        <div className="min-w-0 flex-1 space-y-0.5">
          <p className="text-sm font-medium">
            {translate(
              'auto.components.emulator.pane.MobileEmulatorAgentSetupGuideSteps.9b49d892e3',
              'Enable AgentStart CLI'
            )}
          </p>
          <p className="text-muted-foreground text-xs">
            {translate(
              'auto.components.emulator.pane.MobileEmulatorAgentSetupGuideSteps.3d8dc52c93',
              'Registers the agentstart command for emulator control in agent shells.'
            )}
          </p>
          {setup.cliInstallStatus?.commandPath && setup.cliEnabled ? (
            <p className="text-muted-foreground text-[11px]">
              {translate(
                'auto.components.settings.MobileEmulatorAgentControlRow.aaf62a3dd2',
                'Installed at'
              )}{' '}
              <code className="bg-muted rounded px-1 py-0.5">
                {setup.cliInstallStatus.commandPath}
              </code>
            </p>
          ) : null}
          {setup.cliPathNeedsAttention && setup.cliInstallStatus?.detail ? (
            <p className="text-[11px] text-amber-600 dark:text-amber-400">
              {setup.cliInstallStatus.detail}
            </p>
          ) : null}
          {setup.cliBusy ? (
            <p className="text-muted-foreground text-[11px] leading-snug">
              {translate(
                'auto.components.emulator.pane.MobileEmulatorAgentSetupGuideSteps.3d34423e88',
                'Registering the AgentStart CLI'
              )}{' '}
              {setup.cliInstallStatus?.commandPath ? (
                <code className="bg-muted rounded px-1 py-0.5">
                  {setup.cliInstallStatus.commandPath}
                </code>
              ) : null}{' '}
              {translate(
                'auto.components.emulator.pane.MobileEmulatorAgentSetupGuideSteps.3be27641c9',
                'so emulator commands can run from agent shells.'
              )}
            </p>
          ) : null}
          {!setup.cliEnabled && !setup.cliPathNeedsAttention && setup.cliInstallStatus?.detail ? (
            <p className="text-muted-foreground text-[11px]">{setup.cliInstallStatus.detail}</p>
          ) : null}
        </div>
        <TooltipProvider>
          <Tooltip>
            <TooltipTrigger
              render={
                <span>
                  <Button
                    type="button"
                    size="sm"
                    variant={setup.cliEnabled ? 'outline' : 'default'}
                    disabled={
                      setup.cliLoading || setup.cliBusy || !setup.cliSupported || setup.cliEnabled
                    }
                    onClick={() => {
                      recordFeatureInteraction('mobile-emulator-agent-setup')
                      void setup.handleEnableCli()
                    }}
                  >
                    {setup.cliLoading || setup.cliBusy ? (
                      <LoadingIndicator className="size-3.5" />
                    ) : null}
                    {setup.cliActionLabel}
                  </Button>
                </span>
              }
            />
            {!setup.cliSupported && !setup.cliLoading && setup.cliInstallStatus?.detail ? (
              <TooltipContent side="left" sideOffset={6}>
                {setup.cliInstallStatus.detail}
              </TooltipContent>
            ) : null}
          </Tooltip>
        </TooltipProvider>
      </div>

      <div className={cn('flex items-start gap-3 py-2.5', setup.step2Blocked && 'opacity-60')}>
        <div className="mt-0.5 shrink-0">
          <StepBadge index={2} state={setup.cliSkillInstalled ? 'done' : 'pending'} />
        </div>
        <div className="min-w-0 flex-1">
          <p className="text-sm font-medium">
            {translate(
              'auto.components.emulator.pane.MobileEmulatorAgentSetupGuideSteps.21f5687c07',
              'AgentStart CLI skill'
            )}
          </p>
          <AgentSkillSetupPanel
            variant="inline"
            hideHeader
            className="min-w-0"
            title={translate(
              'auto.components.emulator.pane.MobileEmulatorAgentSetupGuideSteps.21f5687c07',
              'AgentStart CLI skill'
            )}
            description={translate(
              'auto.components.emulator.pane.MobileEmulatorAgentSetupGuideSteps.64fb057667',
              'Teaches agents the agentstart emulator commands for this worktree.'
            )}
            command={AGENTSTART_CLI_SKILL_INSTALL_COMMAND}
            terminalTitle={translate(
              'auto.components.emulator.pane.MobileEmulatorAgentSetupGuideSteps.5c59ea96ca',
              'Mobile emulator AgentStart CLI skill setup'
            )}
            terminalAriaLabel={translate(
              'auto.components.emulator.pane.MobileEmulatorAgentSetupGuideSteps.bff5341ac3',
              'Mobile emulator AgentStart CLI skill install terminal'
            )}
            terminalWorktreeId={terminalWorktreeId}
            installed={setup.cliSkillInstalled}
            loading={setup.cliSkillLoading || setup.setupRechecking}
            error={setup.cliSkillError}
            installDisabled={setup.step2Blocked}
            showInstallWhenInstalled={!setup.cliSkillInstalled}
            terminalHeightPx={112}
            preInstallNotice={
              showSkillPreInstallNotice ? AGENT_SKILL_CLI_PREREQUISITE_NOTICE : undefined
            }
            openingHint={translate(
              'auto.components.emulator.pane.MobileEmulatorAgentSetupGuideSteps.3941719a56',
              'Checking AgentStart CLI before opening skill setup.'
            )}
            onBeforeOpenTerminal={async () => {
              recordFeatureInteraction('mobile-emulator-agent-setup')
              await ensureAgentStartCliAvailableForAgentSkillTerminal()
            }}
            onRecheck={() => {
              recordFeatureInteraction('mobile-emulator-agent-setup')
              void setup.recheckSetup()
            }}
          />
        </div>
      </div>
    </div>
  )
}
