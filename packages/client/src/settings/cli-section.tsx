import type { CliInstallStatus } from '@yiru/protocol/cli-values'
import type { GlobalSettings } from '@yiru/protocol/settings/global/model'
import { useEffect, useState } from 'react'
import { toast } from 'sonner'
import {
  YIRU_CLI_SKILL_INSTALL_COMMAND,
  YIRU_CLI_SKILL_NAME,
  YIRU_CLI_SKILL_UPDATE_COMMAND
} from '~renderer/agent/feature-install-commands'
import { translate } from '~renderer/i18n/i18n'
import { FolderOpen, ArrowClockwise as RefreshCw } from '~renderer/icons/hugeicons'
import { useEventCallback } from '~renderer/react/use-event-callback'
import { useMountedRef } from '~renderer/react/use-mounted-ref'
import {
  installCliCommand,
  readCliInstallStatus,
  readWslCliInstallStatus,
  removeCliCommand
} from '~renderer/runtime/cli-install-client'
import { shellClient } from '~renderer/runtime/shell-client'
import {
  AGENT_SKILL_CLI_PREREQUISITE_NOTICE,
  ensureYiruCliAvailableForAgentSkillTerminal,
  isYiruCliAvailableOnPath
} from '~renderer/skills/agent-cli-prerequisite'
import {
  GLOBAL_AGENT_SKILL_SOURCE_KINDS,
  useInstalledAgentSkill
} from '~renderer/skills/use-installed-agents'

import { Button } from '../ui/button'
import { Label } from '../ui/label'
import { Switch } from '../ui/switch'
import { Tooltip, TooltipContent, TooltipProvider, TooltipTrigger } from '../ui/tooltip'
import { AgentSkillSetupPanel } from './agent/skill-setup-panel'
import { CliRegistrationDialog } from './cli-registration-dialog'
import {
  buildSkillCommandForRuntime,
  ensureWslCliAvailableForAgentSkillTerminal,
  getAgentSkillTerminalShellOverride,
  getSelectedAgentRuntime,
  getSkillDiscoveryTargetForRuntime,
  getWslCliDistroRequest
} from './cli-skill-runtime-setup'
import { WslCliRegistration } from './wsl-cli-registration'

type CliSectionProps = {
  currentPlatform: string
  settings: GlobalSettings
  wslSupportedPlatform?: boolean
  wslAvailable?: boolean
  wslCapabilitiesLoading?: boolean
}

function getRevealLabel(platform: string): string {
  return platform === 'darwin'
    ? 'Show in Finder'
    : platform === 'win32'
      ? 'Show in Explorer'
      : 'Show in File Manager'
}

function getInstallDescription(platform: string): string {
  if (platform === 'darwin') {
    return 'Register `yiru` in /usr/local/bin.'
  }
  if (platform === 'linux') {
    return 'Register `yiru` in ~/.local/bin.'
  }
  if (platform === 'win32') {
    return 'Register `yiru` in your user PATH.'
  }
  return 'CLI registration is not yet available on this platform.'
}

function getFallbackCommandName(): string {
  return 'yiru'
}

export function CliSection({
  currentPlatform,
  settings,
  wslSupportedPlatform = false,
  wslAvailable = false,
  wslCapabilitiesLoading = false
}: CliSectionProps): React.JSX.Element {
  const [status, setStatus] = useState<CliInstallStatus | null>(null)
  const [loading, setLoading] = useState(true)
  const [dialogOpen, setDialogOpen] = useState(false)
  const [busyAction, setBusyAction] = useState<'install' | 'remove' | null>(null)
  const mountedRef = useMountedRef()
  const agentRuntime = (() =>
    getSelectedAgentRuntime(settings, wslSupportedPlatform, wslAvailable, wslCapabilitiesLoading))()
  const cliSkillDiscoveryTarget = (() => getSkillDiscoveryTargetForRuntime(agentRuntime))()
  const {
    installed: cliSkillDetected,
    loading: cliSkillLoading,
    error: cliSkillError,
    refresh: refreshCliSkill
  } = useInstalledAgentSkill(YIRU_CLI_SKILL_NAME, {
    discoveryTarget: cliSkillDiscoveryTarget,
    sourceKinds: GLOBAL_AGENT_SKILL_SOURCE_KINDS
  })
  const cliSkillInstallCommand = buildSkillCommandForRuntime(
    YIRU_CLI_SKILL_INSTALL_COMMAND,
    agentRuntime
  )
  const cliSkillUpdateCommand = buildSkillCommandForRuntime(
    YIRU_CLI_SKILL_UPDATE_COMMAND,
    agentRuntime
  )
  const cliSkillTerminalShellOverride = getAgentSkillTerminalShellOverride(
    currentPlatform,
    settings,
    agentRuntime
  )
  const getCliSkillPrerequisiteStatus = () =>
    agentRuntime.runtime === 'wsl'
      ? readWslCliInstallStatus(getWslCliDistroRequest(agentRuntime))
      : readCliInstallStatus()

  const handleStatusChange = (nextStatus: CliInstallStatus): void => {
    if (mountedRef.current) {
      setStatus(nextStatus)
    }
  }

  const refreshStatus = useEventCallback(async (): Promise<void> => {
    setLoading(true)
    try {
      handleStatusChange(await readCliInstallStatus())
    } catch (error) {
      if (mountedRef.current) {
        toast.error(
          error instanceof Error
            ? error.message
            : translate(
                'auto.components.settings.CliSection.7baec27029',
                'Failed to load CLI status.'
              )
        )
      }
    } finally {
      if (mountedRef.current) {
        setLoading(false)
      }
    }
  })

  useEffect(() => void refreshStatus(), [refreshStatus])

  const isEnabled = status?.state === 'installed'
  const isSupported = status?.supported ?? false
  const isBrowserManaged = status?.unsupportedReason === 'launch_mode_unavailable'
  const revealLabel = getRevealLabel(currentPlatform)
  const commandName = status?.commandName ?? getFallbackCommandName()
  const canRevealCommandPath =
    status?.commandPath != null && ['installed', 'stale', 'conflict'].includes(status.state)

  const handleInstall = async (): Promise<void> => {
    setBusyAction('install')
    try {
      const next = await installCliCommand()
      if (mountedRef.current) {
        setStatus(next)
        setDialogOpen(false)
        toast.success(
          translate(
            'auto.components.settings.CliSection.9cbcd31338',
            'Registered `{{value0}}` in PATH.',
            { value0: next.commandName }
          )
        )
      }
    } catch (error) {
      if (mountedRef.current) {
        toast.error(
          error instanceof Error
            ? error.message
            : translate(
                'auto.components.settings.CliSection.a2b13efa94',
                'Failed to register `{{value0}}` in PATH.',
                { value0: commandName }
              )
        )
      }
    } finally {
      if (mountedRef.current) {
        setBusyAction(null)
      }
    }
  }

  const handleRemove = async (): Promise<void> => {
    setBusyAction('remove')
    try {
      const next = await removeCliCommand()
      if (mountedRef.current) {
        setStatus(next)
        setDialogOpen(false)
        toast.success(
          translate(
            'auto.components.settings.CliSection.af5540930c',
            'Removed `{{value0}}` from PATH.',
            { value0: next.commandName }
          )
        )
      }
    } catch (error) {
      if (mountedRef.current) {
        toast.error(
          error instanceof Error
            ? error.message
            : translate(
                'auto.components.settings.CliSection.d77352f2df',
                'Failed to remove `{{value0}}` from PATH.',
                { value0: commandName }
              )
        )
      }
    } finally {
      if (mountedRef.current) {
        setBusyAction(null)
      }
    }
  }

  return (
    <section className="space-y-4" data-settings-section="cli">
      <div className="space-y-1">
        <h2 className="text-sm font-semibold">
          {translate('auto.components.settings.CliSection.c5c0f2641d', 'Yiru CLI')}
        </h2>
        <p className="text-muted-foreground text-xs">
          {translate(
            'auto.components.settings.CliSection.6930feda9e',
            'Use Yiru from your terminal to open the app, manage worktrees, and interact with Yiru terminals.'
          )}
        </p>
      </div>

      <div className="border-border/60 bg-card/50 space-y-3 border p-4">
        <div className="flex items-center justify-between gap-4">
          <div className="space-y-0.5">
            <Label>
              {translate('auto.components.settings.CliSection.38edbb5721', 'Shell command')}
            </Label>
            <p className="text-muted-foreground text-xs">
              {loading
                ? translate(
                    'auto.components.settings.CliSection.d363e5929b',
                    'Checking CLI registration…'
                  )
                : (status?.detail ?? getInstallDescription(currentPlatform))}
            </p>
          </div>
          <div className="flex items-center gap-2">
            <TooltipProvider>
              <Tooltip>
                <TooltipTrigger
                  render={
                    <Button
                      variant="ghost"
                      size="icon-xs"
                      onClick={() => void refreshStatus()}
                      disabled={loading || busyAction !== null}
                      aria-label={translate(
                        'auto.components.settings.CliSection.52e640f3a0',
                        'Refresh CLI status'
                      )}
                    >
                      <RefreshCw className="size-3.5" />
                    </Button>
                  }
                />
                <TooltipContent side="bottom" sideOffset={6}>
                  {translate('auto.components.settings.CliSection.5dae812f50', 'Refresh')}
                </TooltipContent>
              </Tooltip>
            </TooltipProvider>
            {!isBrowserManaged ? (
              <Switch
                checked={isEnabled}
                disabled={loading || !isSupported || busyAction !== null}
                onCheckedChange={() => setDialogOpen(true)}
              />
            ) : null}
          </div>
        </div>

        {status?.commandPath ? (
          <p className="text-muted-foreground text-xs">
            {translate('auto.components.settings.CliSection.15eaad0d31', 'Command path:')}{' '}
            <code className="bg-muted px-1 py-0.5 text-[11px]">{status.commandPath}</code>
          </p>
        ) : null}

        {status?.state === 'stale' && status.currentTarget ? (
          <p className="text-xs text-amber-600 dark:text-amber-400">
            {translate(
              'auto.components.settings.CliSection.b0c310ab46',
              'Existing launcher target:'
            )}
            <code>{status.currentTarget}</code>
          </p>
        ) : null}

        {status?.state === 'installed' && !status.pathConfigured && status.pathDirectory ? (
          <p className="text-xs text-amber-600 dark:text-amber-400">
            {status.pathDirectory}{' '}
            {translate(
              'auto.components.settings.CliSection.7f2747f7dd',
              'is not currently visible on PATH for this shell.'
            )}
          </p>
        ) : null}

        {!loading && !isSupported && !isBrowserManaged && status?.detail ? (
          <p className="text-muted-foreground text-xs">{status.detail}</p>
        ) : null}

        <div className="flex items-center gap-2">
          {status?.commandPath ? (
            <Button
              variant="ghost"
              size="sm"
              onClick={() => void shellClient.shell.openPath(status.commandPath as string)}
              disabled={loading || !canRevealCommandPath}
              className="gap-2"
            >
              <FolderOpen className="size-3.5" />
              {revealLabel}
            </Button>
          ) : null}
        </div>

        {!isBrowserManaged ? (
          <div className="border-border/60 border-t pt-3">
            <div className="space-y-0.5">
              <Label>
                {translate('auto.components.settings.CliSection.04873eea3e', 'Agent skills')}
              </Label>
              <p className="text-muted-foreground text-xs">
                {translate(
                  'auto.components.settings.CliSection.36a6f919ba',
                  'Give agents Yiru-aware workspace, terminal, and progress workflows.'
                )}
              </p>
            </div>

            <AgentSkillSetupPanel
              className="mt-3"
              variant="inline"
              title={translate('auto.components.settings.CliSection.6053cf736c', 'CLI skill')}
              description={translate(
                'auto.components.settings.CliSection.e8012c03a1',
                'Enables agents to use Yiru workspace, terminal, and progress commands.'
              )}
              command={cliSkillInstallCommand}
              installedCommand={cliSkillUpdateCommand}
              terminalTitle="CLI skill setup"
              terminalAriaLabel="CLI skill install terminal"
              terminalWorktreeId={`settings-cli-skill-terminal-${agentRuntime.runtime}`}
              terminalShellOverride={cliSkillTerminalShellOverride}
              installed={cliSkillDetected}
              loading={cliSkillLoading}
              error={cliSkillError}
              preInstallNotice={AGENT_SKILL_CLI_PREREQUISITE_NOTICE}
              getPrerequisiteStatus={getCliSkillPrerequisiteStatus}
              isPrerequisiteAvailable={isYiruCliAvailableOnPath}
              onBeforeOpenTerminal={async () => {
                await (agentRuntime.runtime === 'wsl'
                  ? ensureWslCliAvailableForAgentSkillTerminal(agentRuntime)
                  : ensureYiruCliAvailableForAgentSkillTerminal({
                      onStatusChange: handleStatusChange
                    }))
              }}
              onRecheck={refreshCliSkill}
              freshnessSkillName={agentRuntime.runtime === 'host' ? YIRU_CLI_SKILL_NAME : undefined}
            />
          </div>
        ) : null}
      </div>

      <WslCliRegistration currentPlatform={currentPlatform} />

      <CliRegistrationDialog
        busyAction={busyAction}
        commandName={commandName}
        commandPath={status?.commandPath}
        isEnabled={isEnabled}
        isSupported={isSupported}
        onInstall={handleInstall}
        onOpenChange={setDialogOpen}
        onRemove={handleRemove}
        open={dialogOpen}
      />
    </section>
  )
}
