import { translate } from '~renderer/i18n/i18n'
import {
  Warning as AlertTriangle,
  HardDrive,
  ArrowClockwise as RefreshCw,
  X
} from '~renderer/icons/hugeicons'
import { useAppStore } from '~renderer/store/state'

import { Badge } from '../ui/badge'
import { Button } from '../ui/button'
import {
  formatBytes,
  getWorkspaceSpaceScanningLabel,
  getWorkspaceSpaceScanTimeLabel
} from './workspace-space-format'

export function WorkspaceSpaceCompactPanel({
  onOpenFullPage
}: {
  onOpenFullPage: () => void
}): React.JSX.Element {
  const analysis = useAppStore((state) => state.workspaceSpaceAnalysis)
  const scanError = useAppStore((state) => state.workspaceSpaceScanError)
  const isScanning = useAppStore((state) => state.workspaceSpaceScanning)
  const refreshWorkspaceSpace = useAppStore((state) => state.refreshWorkspaceSpace)
  const cancelWorkspaceSpaceScan = useAppStore((state) => state.cancelWorkspaceSpaceScan)
  const progressLabel = getWorkspaceSpaceScanningLabel()

  const scan = (): void => {
    void refreshWorkspaceSpace().catch(() => {
      /* scanError is stored by the slice */
    })
  }

  const cancelScan = (): void => {
    void cancelWorkspaceSpaceScan()
  }

  return (
    <div className="border-border/50 bg-muted/15 border-t px-3 py-2">
      <div className="flex items-center justify-between gap-2">
        <div className="flex min-w-0 items-center gap-2">
          <HardDrive className="text-muted-foreground size-3.5 shrink-0" />
          <div className="min-w-0">
            <div className="text-foreground flex min-w-0 items-center gap-1.5 text-[11px] font-medium">
              <span className="truncate">
                {translate(
                  'auto.components.status.bar.WorkspaceSpaceCompactPanel.8ff597593d',
                  'Space'
                )}
              </span>
              <Badge variant="secondary" className="px-1.5 py-0 text-[9px]">
                {translate(
                  'auto.components.status.bar.WorkspaceSpaceCompactPanel.c361440dc0',
                  'Beta'
                )}
              </Badge>
            </div>
            <div className="text-muted-foreground truncate text-[11px]">
              {analysis
                ? isScanning
                  ? translate(
                      'auto.components.status.bar.WorkspaceSpaceCompactPanel.3d8d47ce77',
                      '{{value0}} · last result kept',
                      { value0: progressLabel }
                    )
                  : analysis.unavailableWorktreeCount > 0
                    ? translate(
                        'auto.components.status.bar.WorkspaceSpaceCompactPanel.bef4dc0457',
                        '{{value0}} reclaimable · {{value1}} unavailable',
                        {
                          value0: formatBytes(analysis.reclaimableBytes),
                          value1: analysis.unavailableWorktreeCount
                        }
                      )
                    : translate(
                        'auto.components.status.bar.WorkspaceSpaceCompactPanel.bef4dc0457',
                        '{{value0}} reclaimable · {{value1}} workspaces',
                        {
                          value0: formatBytes(analysis.reclaimableBytes),
                          value1: analysis.scannedWorktreeCount
                        }
                      )
                : isScanning
                  ? progressLabel
                  : translate(
                      'auto.components.status.bar.WorkspaceSpaceCompactPanel.0583c806ac',
                      'Workspace disk usage is not scanned.'
                    )}
            </div>
          </div>
        </div>

        <div className="flex shrink-0 items-center gap-1">
          <Button
            variant="outline"
            size="xs"
            onClick={isScanning ? cancelScan : scan}
            className="w-24"
          >
            {isScanning ? <X className="size-3" /> : <RefreshCw className="size-3" />}
            {isScanning
              ? translate(
                  'auto.components.status.bar.WorkspaceSpaceCompactPanel.2af2174d6d',
                  'Cancel'
                )
              : analysis
                ? translate(
                    'auto.components.status.bar.WorkspaceSpaceCompactPanel.f5e1a84d79',
                    'Refresh'
                  )
                : translate(
                    'auto.components.status.bar.WorkspaceSpaceCompactPanel.0582df6d2e',
                    'Scan'
                  )}
          </Button>
          <Button variant="ghost" size="xs" onClick={onOpenFullPage}>
            {translate(
              'auto.components.status.bar.WorkspaceSpaceCompactPanel.6a5dc3c61a',
              'Review'
            )}
          </Button>
        </div>
      </div>

      {analysis ? (
        <div className="mt-2 grid grid-cols-3 gap-1 text-[10px] tabular-nums">
          <div className="border-border/60 bg-background/40 border px-2 py-1">
            <div className="text-muted-foreground">
              {translate(
                'auto.components.status.bar.WorkspaceSpaceCompactPanel.f4d2651498',
                'Scanned'
              )}
            </div>
            <div className="text-foreground truncate font-medium">
              {formatBytes(analysis.totalSizeBytes)}
            </div>
          </div>
          <div className="border-border/60 bg-background/40 border px-2 py-1">
            <div className="text-muted-foreground">
              {translate(
                'auto.components.status.bar.WorkspaceSpaceCompactPanel.9be86c46a0',
                'Freeable'
              )}
            </div>
            <div className="text-foreground truncate font-medium">
              {formatBytes(analysis.reclaimableBytes)}
            </div>
          </div>
          <div className="border-border/60 bg-background/40 border px-2 py-1">
            <div className="text-muted-foreground">
              {translate(
                'auto.components.status.bar.WorkspaceSpaceCompactPanel.a471aa9c24',
                'Updated'
              )}
            </div>
            <div className="text-foreground truncate font-medium">
              {getWorkspaceSpaceScanTimeLabel(analysis.scannedAt)}
            </div>
          </div>
        </div>
      ) : null}

      {scanError ? (
        <div className="text-destructive mt-1.5 flex items-start gap-1.5 text-[11px]">
          <AlertTriangle className="mt-0.5 size-3 shrink-0" />
          <span className="min-w-0 truncate">{scanError}</span>
        </div>
      ) : null}
    </div>
  )
}
