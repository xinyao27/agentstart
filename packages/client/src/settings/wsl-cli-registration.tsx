import type { CliInstallStatus } from '@agentstart/protocol/cli-values'
import { useEffect, useState } from 'react'
import { toast } from 'sonner'
import { translate } from '~renderer/i18n/i18n'
import { ArrowClockwise as RefreshCw } from '~renderer/icons/hugeicons'
import { useEventCallback } from '~renderer/react/use-event-callback'
import { useMountedRef } from '~renderer/react/use-mounted-ref'
import {
  installWslCliCommand,
  readWslCliInstallStatus,
  removeWslCliCommand
} from '~renderer/runtime/cli-install-client'
import { useWindowsTerminalCapabilities } from '~renderer/terminal/windows/capabilities'
import { Switch } from '~renderer/ui/switch'

import { Button } from '../ui/button'
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle
} from '../ui/dialog'
import { Label } from '../ui/label'
import { Tooltip, TooltipContent, TooltipProvider, TooltipTrigger } from '../ui/tooltip'

type WslCliRegistrationProps = {
  currentPlatform: string
}

export function WslCliRegistration({
  currentPlatform
}: WslCliRegistrationProps): React.JSX.Element | null {
  const [status, setStatus] = useState<CliInstallStatus | null>(null)
  const [loading, setLoading] = useState(false)
  const [dialogOpen, setDialogOpen] = useState(false)
  const [busyAction, setBusyAction] = useState<'install' | 'remove' | null>(null)
  const mountedRef = useMountedRef()
  const { wslAvailable } = useWindowsTerminalCapabilities(currentPlatform === 'win32')
  const showWslCli = currentPlatform === 'win32' && wslAvailable

  const refreshStatus = useEventCallback(async (): Promise<void> => {
    setLoading(true)
    try {
      const next = await readWslCliInstallStatus()
      if (mountedRef.current) {
        setStatus(next)
      }
    } catch (error) {
      if (mountedRef.current) {
        toast.error(
          error instanceof Error
            ? error.message
            : translate(
                'auto.components.settings.WslCliRegistration.26b4b3b00f',
                'Failed to load WSL CLI status.'
              )
        )
      }
    } finally {
      if (mountedRef.current) {
        setLoading(false)
      }
    }
  })

  useEffect(() => {
    if (showWslCli) {
      void refreshStatus()
    }
  }, [refreshStatus, showWslCli])

  if (!showWslCli) {
    return null
  }

  const isEnabled = status?.state === 'installed'
  const isSupported = status?.supported ?? false
  const commandName = status?.commandName ?? 'agentstart'

  const handleInstall = async (): Promise<void> => {
    setBusyAction('install')
    try {
      const next = await installWslCliCommand()
      if (!mountedRef.current) {
        return
      }
      setStatus(next)
      setDialogOpen(false)
      toast.success(
        translate(
          'auto.components.settings.WslCliRegistration.951536dda5',
          'Registered `{{value0}}` in WSL.',
          { value0: next.commandName }
        )
      )
    } catch (error) {
      if (mountedRef.current) {
        toast.error(
          error instanceof Error
            ? error.message
            : translate(
                'auto.components.settings.WslCliRegistration.6f91ad1333',
                'Failed to register `{{value0}}` in WSL.',
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
      const next = await removeWslCliCommand()
      if (!mountedRef.current) {
        return
      }
      setStatus(next)
      setDialogOpen(false)
      toast.success(
        translate(
          'auto.components.settings.WslCliRegistration.89c7414cf5',
          'Removed `{{value0}}` from WSL.',
          { value0: next.commandName }
        )
      )
    } catch (error) {
      if (mountedRef.current) {
        toast.error(
          error instanceof Error
            ? error.message
            : translate(
                'auto.components.settings.WslCliRegistration.52d990420e',
                'Failed to remove `{{value0}}` from WSL.',
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
    <>
      <div className="border-border/60 bg-card/50 space-y-3 rounded-xl border p-4">
        <div className="flex items-center justify-between gap-4">
          <div className="space-y-0.5">
            <Label>
              {translate(
                'auto.components.settings.WslCliRegistration.d9c6880dbd',
                'WSL shell command'
              )}
            </Label>
            <p className="text-muted-foreground text-xs">
              {loading
                ? translate(
                    'auto.components.settings.WslCliRegistration.0307677bb9',
                    'Checking WSL CLI registration...'
                  )
                : (status?.detail ??
                  translate(
                    'auto.components.settings.WslCliRegistration.7aa456a460',
                    'Register `agentstart` in ~/.local/bin inside WSL.'
                  ))}
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
                        'auto.components.settings.WslCliRegistration.ab6b022a5c',
                        'Refresh WSL CLI status'
                      )}
                    >
                      <RefreshCw className="size-3.5" />
                    </Button>
                  }
                />
                <TooltipContent side="bottom" sideOffset={6}>
                  {translate('auto.components.settings.WslCliRegistration.9b6627522c', 'Refresh')}
                </TooltipContent>
              </Tooltip>
            </TooltipProvider>
            <Switch
              checked={isEnabled}
              disabled={loading || !isSupported || busyAction !== null}
              onCheckedChange={() => setDialogOpen(true)}
            />
          </div>
        </div>

        {status?.commandPath ? (
          <p className="text-muted-foreground text-xs">
            {translate('auto.components.settings.WslCliRegistration.554305956d', 'Command path:')}{' '}
            <code className="bg-muted rounded px-1 py-0.5 text-[11px]">{status.commandPath}</code>
          </p>
        ) : null}

        {status?.state === 'stale' && status.currentTarget ? (
          <p className="text-xs text-amber-600 dark:text-amber-400">
            {translate(
              'auto.components.settings.WslCliRegistration.1dbb0377d9',
              'Existing launcher target:'
            )}
            <code>{status.currentTarget}</code>
          </p>
        ) : null}
      </div>

      <Dialog open={dialogOpen} onOpenChange={setDialogOpen}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>
              {isEnabled
                ? translate(
                    'auto.components.settings.WslCliRegistration.61ac55278e',
                    'Remove `{{value0}}` from WSL?',
                    { value0: commandName }
                  )
                : translate(
                    'auto.components.settings.WslCliRegistration.e49688f67f',
                    'Register `{{value0}}` in WSL?',
                    { value0: commandName }
                  )}
            </DialogTitle>
            <DialogDescription>
              {isEnabled
                ? translate(
                    'auto.components.settings.WslCliRegistration.d8216eb22e',
                    'This removes the WSL shell command. AgentStart itself remains installed on Windows.'
                  )
                : translate(
                    'auto.components.settings.WslCliRegistration.7ee4e52b99',
                    'AgentStart will register {{value0}} so the command works from WSL terminals.',
                    { value0: status?.commandPath ?? commandName }
                  )}
            </DialogDescription>
          </DialogHeader>
          {status?.commandPath ? (
            <p className="text-muted-foreground text-xs">
              {translate('auto.components.settings.WslCliRegistration.119fef6cd2', 'Target path:')}{' '}
              <code className="bg-muted rounded px-1 py-0.5 text-[11px]">{status.commandPath}</code>
            </p>
          ) : null}
          <DialogFooter>
            <Button
              variant="outline"
              onClick={() => setDialogOpen(false)}
              disabled={busyAction !== null}
            >
              {translate('auto.components.settings.WslCliRegistration.c6f6f89d7c', 'Cancel')}
            </Button>
            <Button
              onClick={() => void (isEnabled ? handleRemove() : handleInstall())}
              disabled={busyAction !== null || !isSupported}
            >
              {busyAction === 'remove'
                ? translate('auto.components.settings.WslCliRegistration.4598b18464', 'Removing...')
                : busyAction === 'install'
                  ? translate(
                      'auto.components.settings.WslCliRegistration.4c4a9178a3',
                      'Registering...'
                    )
                  : isEnabled
                    ? translate('auto.components.settings.WslCliRegistration.f951f85196', 'Remove')
                    : translate(
                        'auto.components.settings.WslCliRegistration.290bfff3ab',
                        'Register'
                      )}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </>
  )
}
