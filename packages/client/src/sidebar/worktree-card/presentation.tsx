import type { TerminalTab } from '@agentstart/protocol/workspace/tabs'
import React from 'react'
import { GitPullRequest } from '~renderer/icons/hugeicons'

// ── Pure helper functions ────────────────────────────────────────────

export function branchDisplayName(branch: string): string {
  return branch.replace(/^refs\/heads\//, '')
}

// ── Stable empty arrays for tabs fallback ────────────────────────────

export const EMPTY_TABS: TerminalTab[] = []
export const EMPTY_BROWSER_TABS: { id: string }[] = []

export function PullRequestIcon({ className }: { className?: string }): React.JSX.Element {
  return <GitPullRequest className={className} aria-hidden />
}
