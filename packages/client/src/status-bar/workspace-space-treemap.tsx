import type { WorkspaceSpaceWorktreeValue as WorkspaceSpaceWorktree } from '@agentstart/protocol'
import React from 'react'
import { translate } from '~renderer/i18n/i18n'
import {
  MagnifyingGlassPlus as ZoomIn,
  MagnifyingGlassMinus as ZoomOut
} from '~renderer/icons/hugeicons'
import { LoadingIndicator } from '~renderer/loading/indicator'
import { Button } from '~renderer/ui/button'
import { cn } from '~renderer/ui/class-names'

import { formatBytes } from './workspace-space-format'
import { buildTreemapLayout } from './workspace-space-layout'
import { getTreemapFill } from './workspace-space-metrics'

export function WorkspaceTreemap({
  rows,
  isScanning,
  selectedWorktreeId,
  zoomedWorktree,
  onSelect,
  onZoomChange
}: {
  rows: WorkspaceSpaceWorktree[]
  isScanning: boolean
  selectedWorktreeId: string | null
  zoomedWorktree: WorkspaceSpaceWorktree | null
  onSelect: (worktreeId: string) => void
  onZoomChange: (worktreeId: string | null) => void
}): React.JSX.Element {
  const selectedWorktree = rows.find((row) => row.worktreeId === selectedWorktreeId) ?? null
  const canZoomSelected =
    !!selectedWorktree &&
    selectedWorktree.status === 'ok' &&
    selectedWorktree.topLevelItems.length > 0
  const isZoomed = !!zoomedWorktree
  const rects = (() =>
    buildTreemapLayout(
      zoomedWorktree
        ? zoomedWorktree.topLevelItems
            .filter((item) => item.sizeBytes > 0)
            .map((item) => ({
              id: item.path,
              label: item.name,
              sizeBytes: item.sizeBytes
            }))
        : rows
            .filter((row) => row.status === 'ok' && row.sizeBytes > 0)
            .map((row) => ({
              id: row.worktreeId,
              label: row.displayName,
              sizeBytes: row.sizeBytes
            }))
    ))()

  if (rects.length === 0) {
    return (
      <div className="border-border/70 bg-muted/20 text-muted-foreground relative flex h-72 items-center justify-center border border-dashed text-sm">
        {zoomedWorktree ? (
          <Button
            variant="outline"
            size="xs"
            onClick={() => onZoomChange(null)}
            className="bg-background absolute top-2 right-2 gap-1.5 px-2.5"
          >
            <ZoomOut className="size-3" />
            {translate('auto.components.status.bar.WorkspaceSpaceManagerPanel.ef890d31b9', 'All')}
          </Button>
        ) : null}
        <span className="flex items-center gap-2">
          {isScanning ? <LoadingIndicator className="size-4" /> : null}
          {isScanning
            ? translate(
                'auto.components.status.bar.WorkspaceSpaceManagerPanel.c5135e7e4a',
                'Scanning workspace sizes. You can leave this page.'
              )
            : isZoomed
              ? translate(
                  'auto.components.status.bar.WorkspaceSpaceManagerPanel.977bdf9a36',
                  'No top-level items to show.'
                )
              : translate(
                  'auto.components.status.bar.WorkspaceSpaceManagerPanel.0990a63160',
                  'No scanned workspace sizes yet.'
                )}
        </span>
      </div>
    )
  }

  return (
    <div className="border-border/70 bg-muted/20 relative h-72 overflow-hidden border">
      <div className="absolute top-2 right-2 z-10 flex max-w-[calc(100%-1rem)] items-center gap-2">
        {zoomedWorktree ? (
          <>
            <div className="border-border/70 bg-background max-w-56 truncate rounded-md border px-2 py-1 text-[11px] font-medium">
              {zoomedWorktree.displayName}
            </div>
            <Button
              variant="outline"
              size="xs"
              onClick={() => onZoomChange(null)}
              className="bg-background gap-1.5 px-2.5"
            >
              <ZoomOut className="size-3" />
              {translate('auto.components.status.bar.WorkspaceSpaceManagerPanel.ef890d31b9', 'All')}
            </Button>
          </>
        ) : canZoomSelected ? (
          <Button
            variant="outline"
            size="xs"
            onClick={() => onZoomChange(selectedWorktree.worktreeId)}
            className="bg-background gap-1.5 px-2.5"
          >
            <ZoomIn className="size-3" />
            {translate('auto.components.status.bar.WorkspaceSpaceManagerPanel.d3f9c69ddc', 'Zoom')}
          </Button>
        ) : null}
      </div>
      {rects.map((rect) => {
        const area = rect.width * rect.height
        const selected = !isZoomed && rect.id === selectedWorktreeId
        const rectStyle = {
          left: `${rect.x}%`,
          top: `${rect.y}%`,
          width: `${rect.width}%`,
          height: `${rect.height}%`,
          background: getTreemapFill(rect, selected)
        }
        const rectContent =
          area >= 80 ? (
            <span className="text-foreground block min-w-0 text-[11px] leading-tight font-medium">
              <span className="block truncate">{rect.label}</span>
              {area >= 180 ? (
                <span className="text-muted-foreground mt-0.5 block truncate">
                  {formatBytes(rect.sizeBytes)}
                </span>
              ) : null}
            </span>
          ) : null

        if (isZoomed) {
          return (
            <div
              key={rect.id}
              title={`${rect.label} • ${formatBytes(rect.sizeBytes)}`}
              className="border-background/80 absolute overflow-hidden border p-2 text-left"
              style={rectStyle}
            >
              {rectContent}
            </div>
          )
        }

        return (
          <Button
            variant="outline"
            size="xs"
            key={rect.id}
            type="button"
            aria-label={`${rect.label}, ${formatBytes(rect.sizeBytes)}`}
            title={`${rect.label} • ${formatBytes(rect.sizeBytes)}`}
            onClick={() => onSelect(rect.id)}
            className={cn(
              'h-auto w-auto absolute overflow-hidden border-background/80 p-2 text-left transition-[filter,border-color] hover:brightness-105 ',
              selected && 'border-ring'
            )}
            style={rectStyle}
          >
            {rectContent}
          </Button>
        )
      })}
    </div>
  )
}
