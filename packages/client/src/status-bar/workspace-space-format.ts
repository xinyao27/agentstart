import type {
  WorkspaceSpaceScanStatusName as WorkspaceSpaceScanStatus,
  WorkspaceSpaceWorktreeValue as WorkspaceSpaceWorktree
} from '@agentstart/protocol'
import { translate } from '~renderer/i18n/i18n'

const BYTE_UNITS = ['B', 'KB', 'MB', 'GB', 'TB', 'PB'] as const
const relativeTimeFormatter = new Intl.RelativeTimeFormat(undefined, { numeric: 'auto' })
const fullDateTimeFormatter = new Intl.DateTimeFormat(undefined, {
  dateStyle: 'medium',
  timeStyle: 'short'
})

export function formatBytes(bytes: number): string {
  if (!Number.isFinite(bytes) || bytes <= 0) {
    return '0 B'
  }

  let value = bytes
  let unitIndex = 0
  while (value >= 1024 && unitIndex < BYTE_UNITS.length - 1) {
    value /= 1024
    unitIndex += 1
  }

  const precision = value >= 100 || unitIndex === 0 ? 0 : value >= 10 ? 1 : 2
  return `${value.toFixed(precision)} ${BYTE_UNITS[unitIndex]}`
}

export function formatCompactCount(count: number): string {
  if (!Number.isFinite(count) || count <= 0) {
    return '0'
  }
  if (count < 1000) {
    return String(count)
  }
  if (count < 1_000_000) {
    return `${(count / 1000).toFixed(count >= 10_000 ? 0 : 1)}k`
  }
  return `${(count / 1_000_000).toFixed(count >= 10_000_000 ? 0 : 1)}m`
}

export function getWorkspaceSpaceScanTimeLabel(scannedAt: number, now = Date.now()): string {
  const diffMs = scannedAt - now
  const diffMinutes = Math.round(diffMs / 60_000)
  if (Math.abs(diffMinutes) < 60) {
    return relativeTimeFormatter.format(diffMinutes, 'minute')
  }

  const diffHours = Math.round(diffMinutes / 60)
  if (Math.abs(diffHours) < 24) {
    return relativeTimeFormatter.format(diffHours, 'hour')
  }

  const diffDays = Math.round(diffHours / 24)
  return relativeTimeFormatter.format(diffDays, 'day')
}

export function getWorkspaceSpaceScanDateTimeLabel(scannedAt: number): string {
  return fullDateTimeFormatter.format(new Date(scannedAt))
}

export function getWorkspaceSpaceScanningLabel(): string {
  return translate('workspaceSpace.scanning', 'Scanning workspace sizes')
}

export function getWorkspaceSpaceStatusLabel(status: WorkspaceSpaceScanStatus): string {
  switch (status) {
    case 'ok':
      return translate('workspaceSpace.status.scanned', 'Scanned')
    case 'missing':
      return translate('workspaceSpace.status.missing', 'Missing')
    case 'permission-denied':
      return translate('workspaceSpace.status.noaccess', 'No access')
    case 'unavailable':
      return translate('workspaceSpace.status.unavailable', 'Unavailable')
    case 'error':
      return translate('workspaceSpace.status.failed', 'Failed')
  }
}

export function getWorkspaceSpaceBranchLabel(worktree: WorkspaceSpaceWorktree): string {
  const branch = worktree.branch.replace(/^refs\/heads\//, '').trim()
  return (
    branch ||
    (worktree.isMainWorktree
      ? translate('workspaceSpace.mainWorktree', 'main worktree')
      : translate('workspaceSpace.detached', 'detached'))
  )
}
