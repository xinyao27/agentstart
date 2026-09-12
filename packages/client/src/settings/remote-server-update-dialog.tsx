import type React from 'react'
import { useEffect } from 'react'
import { translate } from '~renderer/i18n/i18n'
import { Warning as AlertTriangle } from '~renderer/icons/hugeicons'
import { LoadingIndicator } from '~renderer/loading/indicator'
import type { RemoteServerUpdateEntry } from '~renderer/runtime/remote-server-update-coordinator'
import { useAppStore } from '~renderer/store/state'
import { Button } from '~renderer/ui/button'
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle
} from '~renderer/ui/dialog'
import { Progress } from '~renderer/ui/progress'

import {
  getRemoteServerManualUpdateHelp,
  RemoteServerUpdateStatus
} from './remote-server-update-status'

function versionDescription(entry: RemoteServerUpdateEntry): string {
  if (entry.currentVersion && entry.targetVersion && entry.currentVersion !== entry.targetVersion) {
    return `${entry.currentVersion} → ${entry.targetVersion}`
  }
  if (entry.currentVersion) {
    return `v${entry.currentVersion}`
  }
  return translate(
    'auto.components.settings.RemoteServerUpdateDialog.versionUnavailable',
    'Version unavailable'
  )
}

function entryHelp(entry: RemoteServerUpdateEntry): string | null {
  if (entry.error) {
    return entry.error
  }
  if (entry.phase === 'manual') {
    return getRemoteServerManualUpdateHelp(entry)
  }
  if (entry.phase === 'restarting') {
    return translate(
      'auto.components.settings.RemoteServerUpdateDialog.restartingHelp',
      'Waiting for the replacement server to reconnect on the new version.'
    )
  }
  return null
}

function ServerUpdateRow({
  entry,
  disabled,
  onUpdate
}: {
  entry: RemoteServerUpdateEntry
  disabled: boolean
  onUpdate: () => void
}): React.JSX.Element {
  const canUpdate = entry.phase === 'available' || entry.phase === 'failed'
  const help = entryHelp(entry)
  return (
    <div className="space-y-2 px-3 py-3">
      <div className="flex items-start gap-3">
        <div className="min-w-0 flex-1 space-y-0.5">
          <div className="flex flex-wrap items-center gap-2">
            <span className="text-sm font-medium">{entry.name}</span>
            <RemoteServerUpdateStatus entry={entry} compact />
          </div>
          <p className="text-muted-foreground text-xs">{versionDescription(entry)}</p>
        </div>
        {canUpdate ? (
          <Button type="button" variant="outline" size="xs" onClick={onUpdate} disabled={disabled}>
            {entry.phase === 'failed'
              ? translate('auto.components.settings.RemoteServerUpdateDialog.retry', 'Retry')
              : translate(
                  'auto.components.settings.RemoteServerUpdateDialog.update',
                  'Update this server'
                )}
          </Button>
        ) : null}
      </div>
      {entry.phase === 'downloading' && entry.progress !== null ? (
        <Progress
          value={entry.progress}
          aria-label={translate(
            'auto.components.settings.RemoteServerUpdateDialog.downloadProgress',
            '{{value0}} download progress',
            { value0: entry.name }
          )}
        />
      ) : null}
      {help ? (
        <p
          className={
            entry.phase === 'failed' ? 'text-destructive text-xs' : 'text-muted-foreground text-xs'
          }
        >
          {help}
        </p>
      ) : null}
    </div>
  )
}

function RemoteServerUpdateDialog(): React.JSX.Element {
  const open = useAppStore((state) => state.remoteServerUpdateDialogOpen)
  const setOpen = useAppStore((state) => state.setRemoteServerUpdateDialogOpen)
  const entries = [...useAppStore((state) => state.remoteServerUpdates).values()]
  const checking = useAppStore((state) => state.remoteServerUpdatesChecking)
  const running = useAppStore((state) => state.remoteServerUpdatesRunning)
  const refresh = useAppStore((state) => state.refreshRemoteServerUpdates)
  const start = useAppStore((state) => state.startRemoteServerUpdates)
  const eligible = entries.filter(
    (entry) => entry.phase === 'available' || entry.phase === 'failed'
  )
  const allCurrent =
    entries.length > 0 &&
    !checking &&
    !running &&
    entries.every((entry) => entry.phase === 'current' || entry.phase === 'updated')
  const liveTabCount = eligible.reduce((total, entry) => total + entry.liveTabCount, 0)
  const liveLeafCount = eligible.reduce((total, entry) => total + entry.liveLeafCount, 0)

  useEffect(() => {
    if (open) {
      void refresh()
    }
  }, [open, refresh])

  return (
    <Dialog open={open} onOpenChange={setOpen}>
      <DialogContent className="max-h-[min(720px,calc(100vh-2rem))] gap-4 sm:max-w-2xl">
        <DialogHeader>
          <DialogTitle>
            {translate(
              'auto.components.settings.RemoteServerUpdateDialog.title',
              'Update Remote Daemons'
            )}
          </DialogTitle>
          <DialogDescription>
            {translate(
              'auto.components.settings.RemoteServerUpdateDialog.description',
              'Review configured remote daemons and update supported installs.'
            )}
          </DialogDescription>
        </DialogHeader>

        {eligible.length > 0 && (liveTabCount > 0 || liveLeafCount > 0) ? (
          <div className="border-border bg-muted/40 flex gap-2 rounded-md border p-3 text-xs">
            <AlertTriangle className="text-muted-foreground mt-0.5 size-4 shrink-0" />
            <p>
              {translate(
                'auto.components.settings.RemoteServerUpdateDialog.restartWarning',
                'Updating restarts these hosts. {{value0}} live tabs and {{value1}} terminal panes may briefly disconnect.',
                { value0: liveTabCount, value1: liveLeafCount }
              )}
            </p>
          </div>
        ) : null}

        <div className="scrollbar-sleek border-border/50 bg-card/30 min-h-0 overflow-y-auto border">
          {entries.length === 0 ? (
            <div className="text-muted-foreground px-4 py-8 text-center text-sm">
              {checking ? (
                <span className="inline-flex items-center gap-2">
                  <LoadingIndicator className="size-4" />
                  {translate(
                    'auto.components.settings.RemoteServerUpdateDialog.checking',
                    'Checking remote daemons…'
                  )}
                </span>
              ) : (
                translate(
                  'auto.components.settings.RemoteServerUpdateDialog.empty',
                  'No remote daemons found.'
                )
              )}
            </div>
          ) : (
            <div className="divide-border/50 divide-y">
              {entries.map((entry) => (
                <ServerUpdateRow
                  key={entry.environmentId}
                  entry={entry}
                  disabled={running || checking}
                  onUpdate={() => void start([entry.environmentId])}
                />
              ))}
            </div>
          )}
        </div>

        {checking ? (
          <div className="text-muted-foreground inline-flex items-center gap-2 text-xs">
            <LoadingIndicator className="size-3.5" />
            {translate(
              'auto.components.settings.RemoteServerUpdateDialog.checking',
              'Checking remote daemons…'
            )}
          </div>
        ) : allCurrent ? (
          <p className="text-muted-foreground text-xs">
            {translate(
              'auto.components.settings.RemoteServerUpdateDialog.noUpdates',
              'All remote daemons are up to date.'
            )}
          </p>
        ) : null}

        {eligible.length > 1 ? (
          <DialogFooter>
            <Button
              type="button"
              size="sm"
              autoFocus
              onClick={() => void start()}
              disabled={checking || running}
            >
              {translate(
                'auto.components.settings.RemoteServerUpdateDialog.updateAll',
                'Update all {{value0}} hosts',
                { value0: eligible.length }
              )}
            </Button>
          </DialogFooter>
        ) : null}
      </DialogContent>
    </Dialog>
  )
}

export default RemoteServerUpdateDialog
