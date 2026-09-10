import {
  AGENTSTART_CLI_SKILL_INSTALL_COMMAND,
  AGENTSTART_CLI_SKILL_UPDATE_COMMAND
} from '~renderer/agent/feature-install-commands'
import { useMobileEmulatorAgentSetupState } from '~renderer/emulator-pane/use-mobile-emulator-agent-setup-state'
import { translate } from '~renderer/i18n/i18n'
import { DownloadSimple as Import } from '~renderer/icons/hugeicons'
import { LoadingIndicator } from '~renderer/loading/indicator'
import {
  AGENT_SKILL_CLI_PREREQUISITE_NOTICE,
  ensureAgentStartCliAvailableForAgentSkillTerminal
} from '~renderer/skills/agent-cli-prerequisite'
import { Button } from '~renderer/ui/button'
import { cn } from '~renderer/ui/class-names'
import { Tooltip, TooltipContent, TooltipProvider, TooltipTrigger } from '~renderer/ui/tooltip'

import { StepBadge } from '../../emulator-pane/setup-step-badge'
import { AgentSkillSetupPanel } from '../agent/skill-setup-panel'
import { buildSkillCommandForRuntime } from '../cli-skill-runtime-setup'
import { MobileEmulatorExamples } from './emulator-examples'

const EMULATOR_CLI_COMMANDS = [
  'agentstart emulator list --json',
  'agentstart emulator attach "iPhone 16 Pro" --json',
  'agentstart emulator tap 0.5 0.7 --json',
  'agentstart emulator type "hello" --json'
] as const

export function MobileEmulatorAgentControlRow(): React.JSX.Element {
  const setup = useMobileEmulatorAgentSetupState(true)
  const cliSkillInstallCommand = buildSkillCommandForRuntime(AGENTSTART_CLI_SKILL_INSTALL_COMMAND)
  const cliSkillUpdateCommand = buildSkillCommandForRuntime(AGENTSTART_CLI_SKILL_UPDATE_COMMAND)

  const handleEnableCli = async (): Promise<void> => {
    await setup.handleEnableCli()
  }

  return (
    <div className="border-border/60 bg-card/30 rounded-2xl border p-4">
      <div className="flex items-center justify-between gap-3">
        <div className="space-y-0.5">
          <p className="text-sm font-semibold">
            {translate(
              'auto.components.settings.MobileEmulatorAgentControlRow.2a674aa810',
              'Agent Mobile Emulator Control'
            )}
          </p>
          <p className="text-muted-foreground text-xs">
            {translate(
              'auto.components.settings.MobileEmulatorAgentControlRow.ff4b7e65d6',
              'Let coding agents control the active mobile emulator with AgentStart CLI commands.'
            )}
          </p>
        </div>
        <span
          className={cn(
            'shrink-0 px-2 py-0.5 text-[10px] font-medium rounded-full',
            setup.completedCount === 2
              ? 'bg-emerald-500/15 text-emerald-700 dark:text-emerald-400'
              : 'bg-muted text-muted-foreground'
          )}
        >
          {setup.completedCount}/2
        </span>
      </div>

      <div className="divide-border/40 mt-3 divide-y">
        <div className="flex items-start gap-3 py-3">
          <StepBadge
            index={1}
            state={setup.cliEnabled ? 'done' : setup.cliBusy ? 'in-progress' : 'pending'}
          />
          <div className="min-w-0 flex-1 space-y-1">
            <p className="text-sm font-medium">
              {translate(
                'auto.components.settings.MobileEmulatorAgentControlRow.4f2205f3b6',
                'Enable AgentStart CLI'
              )}
            </p>
            <p className="text-muted-foreground text-xs">
              {translate(
                'auto.components.settings.MobileEmulatorAgentControlRow.2fef055608',
                'Registers the AgentStart CLI command so agents can control the active emulator from their shell.'
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
            {!setup.cliEnabled && setup.cliInstallStatus?.detail ? (
              <p className="text-muted-foreground text-[11px]">{setup.cliInstallStatus.detail}</p>
            ) : null}
            {setup.cliBusy ? (
              <p className="text-muted-foreground text-[11px] leading-snug">
                {translate(
                  'auto.components.settings.MobileEmulatorAgentControlRow.3d34423e88',
                  'Registering the AgentStart CLI'
                )}{' '}
                {setup.cliInstallStatus?.commandPath ? (
                  <code className="bg-muted rounded px-1 py-0.5">
                    {setup.cliInstallStatus.commandPath}
                  </code>
                ) : null}{' '}
                {translate(
                  'auto.components.settings.MobileEmulatorAgentControlRow.3be27641c9',
                  'so emulator commands can run from agent shells.'
                )}
              </p>
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
                      onClick={() => void handleEnableCli()}
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

        <div className={cn('py-3', setup.step2Blocked && 'opacity-60')}>
          <AgentSkillSetupPanel
            variant="inline"
            title={translate(
              'auto.components.settings.MobileEmulatorAgentControlRow.67e19ee03c',
              'AgentStart CLI skill'
            )}
            description={translate(
              'auto.components.settings.MobileEmulatorAgentControlRow.d94ca6a623',
              'Enables agents to use AgentStart CLI commands, including mobile emulator control.'
            )}
            command={cliSkillInstallCommand}
            installedCommand={cliSkillUpdateCommand}
            terminalTitle="AgentStart CLI skill setup"
            terminalAriaLabel="AgentStart CLI skill install terminal"
            terminalWorktreeId="settings-mobile-emulator-agentstart-cli-skill-terminal"
            installed={setup.cliSkillInstalled}
            loading={setup.cliSkillLoading}
            error={setup.cliSkillError}
            installDisabled={setup.step2Blocked}
            leading={<StepBadge index={2} state={setup.cliSkillInstalled ? 'done' : 'pending'} />}
            preInstallNotice={AGENT_SKILL_CLI_PREREQUISITE_NOTICE}
            openingHint={translate(
              'auto.components.settings.MobileEmulatorAgentControlRow.3941719a56',
              'Checking AgentStart CLI before opening skill setup.'
            )}
            onBeforeOpenTerminal={async () => {
              await ensureAgentStartCliAvailableForAgentSkillTerminal()
            }}
            onRecheck={setup.refreshCliSkill}
          />
        </div>

        <div className="py-3">
          <div className="flex items-center gap-2">
            <Import className="text-muted-foreground size-3.5" />
            <p className="text-sm font-medium">
              {translate(
                'auto.components.settings.MobileEmulatorAgentControlRow.c7f3fe0a6e',
                'Common emulator commands'
              )}
            </p>
          </div>
          <p className="text-muted-foreground mt-1 text-xs">
            {translate(
              'auto.components.settings.MobileEmulatorAgentControlRow.8af7a8bc38',
              'Commands target the active emulator for the current worktree. Coordinates are normalized from 0..1.'
            )}
          </p>
          <div className="mt-3 grid gap-1.5 [@media(min-width:520px)]:grid-cols-2">
            {EMULATOR_CLI_COMMANDS.map((command) => (
              <code
                key={command}
                className="border-border/60 bg-background/60 text-foreground block rounded-md border px-2 py-1 font-mono text-[11px] leading-snug break-all"
              >
                {command}
              </code>
            ))}
          </div>
        </div>

        <MobileEmulatorExamples variant="inline" />
      </div>
    </div>
  )
}
