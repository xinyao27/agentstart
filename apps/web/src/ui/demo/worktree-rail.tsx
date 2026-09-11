import { Folder01Icon, GitMergeIcon } from '@hugeicons/core-free-icons'
import { HugeiconsIcon } from '@hugeicons/react'
import { cn } from 'cnfast'

import { ClaudeGlyph } from './claude-glyph'
import { OrbLoader } from './orb-loader'
import { PROJECT_NAME } from './state'
import type { AgentRow, DemoState, WorktreeRow, WorktreeStatus } from './state'

// Why: geometry ported from the desktop sidebar's nested-row rails — a vertical
// run down the parent's glyph column that
// elbows into each child glyph, with a gap so it points at the art rather than
// crossing it. Both levels of the tree get one.
const HEADER_PADDING_LEFT = 10
const REPO_GLYPH_SIZE = 16
const REPO_GLYPH_CENTER = HEADER_PADDING_LEFT + REPO_GLYPH_SIZE / 2
const CARD_PADDING_LEFT = 28
const STATUS_SLOT_WIDTH = 22
const STATUS_GLYPH_SIZE = 14
const STATUS_CENTER_LEFT = STATUS_SLOT_WIDTH / 2 + 1
const WORKTREE_GLYPH_CENTER = CARD_PADDING_LEFT + STATUS_CENTER_LEFT
const WORKTREE_GLYPH_LEFT = WORKTREE_GLYPH_CENTER - STATUS_GLYPH_SIZE / 2
const WORKTREE_ROW_HEIGHT = 26
const AGENT_ROW_HEIGHT = 26
const AGENT_LIST_LEFT = STATUS_SLOT_WIDTH + 2
const AGENT_GLYPH_LEFT = CARD_PADDING_LEFT + AGENT_LIST_LEFT + 4
const GLYPH_RADIUS = 7
const RAIL_GAP = 6
// Why: the desktop elbow runs to the child glyph's leading edge minus one gap
// — measuring to the centre and subtracting a radius leaves a broken stub.
const PROJECT_ELBOW_WIDTH = WORKTREE_GLYPH_LEFT - REPO_GLYPH_CENTER - RAIL_GAP
const AGENT_ELBOW_WIDTH = AGENT_GLYPH_LEFT - WORKTREE_GLYPH_CENTER - RAIL_GAP

function StatusMarker({ status }: { status: WorktreeStatus }): React.JSX.Element {
  if (status === 'running') {
    return <OrbLoader className="text-status-working size-4" />
  }
  // Why: branch identity is the desktop's resting glyph for a worktree — see
  // sidebar/worktree-card/status-slot.tsx, which renders the Hugeicons GitMerge glyph.
  return (
    <HugeiconsIcon
      icon={GitMergeIcon}
      className={cn('size-3.5', status === 'review' ? 'text-status-attention' : 'text-faint')}
      aria-hidden="true"
    />
  )
}

function RepoGlyph(): React.JSX.Element {
  return (
    <HugeiconsIcon icon={Folder01Icon} className="text-muted size-4 shrink-0" aria-hidden="true" />
  )
}

function AgentEntry({ agent }: { agent: AgentRow }): React.JSX.Element {
  return (
    <div
      className="flex items-center gap-1.5 px-1 text-[12px] leading-none"
      style={{ height: AGENT_ROW_HEIGHT }}
    >
      <ClaudeGlyph className="size-3.5 shrink-0" />
      <span className="text-copy truncate">{agent.name}</span>
      <span className="text-faint ml-auto shrink-0 font-mono text-[11px] tabular-nums">
        {agent.detail}
      </span>
    </div>
  )
}

function WorktreeEntry({
  worktree,
  isLast
}: {
  worktree: WorktreeRow
  isLast: boolean
}): React.JSX.Element {
  const agentCount = worktree.agents.length
  const agentRailBottom = AGENT_ROW_HEIGHT * (agentCount - 1) + AGENT_ROW_HEIGHT / 2
  return (
    <div className="relative pr-2" style={{ paddingLeft: CARD_PADDING_LEFT }}>
      <span
        aria-hidden="true"
        className="bg-rule pointer-events-none absolute w-px"
        style={{
          left: REPO_GLYPH_CENTER,
          top: 0,
          ...(isLast ? { height: WORKTREE_ROW_HEIGHT / 2 } : { bottom: 0 })
        }}
      />
      <span
        aria-hidden="true"
        className="bg-rule pointer-events-none absolute h-px"
        style={{
          left: REPO_GLYPH_CENTER,
          top: WORKTREE_ROW_HEIGHT / 2,
          width: PROJECT_ELBOW_WIDTH
        }}
      />

      <div className="flex items-center" style={{ height: WORKTREE_ROW_HEIGHT }}>
        <span
          className="flex shrink-0 items-center justify-center"
          style={{ width: STATUS_SLOT_WIDTH }}
        >
          <StatusMarker status={worktree.status} />
        </span>
        <span
          className={cn(
            'truncate font-mono text-[12px]',
            worktree.active ? 'text-ink' : 'text-copy'
          )}
        >
          {worktree.branch}
        </span>
      </div>

      {agentCount > 0 ? (
        <>
          <span
            aria-hidden="true"
            className="bg-rule pointer-events-none absolute w-px"
            style={{
              left: WORKTREE_GLYPH_CENTER,
              top: WORKTREE_ROW_HEIGHT / 2 + GLYPH_RADIUS + RAIL_GAP,
              bottom: agentRailBottom
            }}
          />
          <span
            aria-hidden="true"
            className="bg-rule pointer-events-none absolute h-px"
            style={{
              left: WORKTREE_GLYPH_CENTER,
              bottom: agentRailBottom,
              width: AGENT_ELBOW_WIDTH
            }}
          />
          <div style={{ marginLeft: AGENT_LIST_LEFT }}>
            {worktree.agents.map((agent) => (
              <AgentEntry key={agent.name} agent={agent} />
            ))}
          </div>
        </>
      ) : null}
    </div>
  )
}

export type WorktreeRailProps = {
  state: DemoState
}

export function WorktreeRail({ state }: WorktreeRailProps): React.JSX.Element {
  return (
    <div className="border-hairline w-[236px] shrink-0 border-r py-2.5">
      <div
        className="flex items-center gap-2 pr-2 pb-1"
        style={{ paddingLeft: HEADER_PADDING_LEFT }}
      >
        <RepoGlyph />
        <span className="text-ink truncate text-[12.5px] font-medium">{PROJECT_NAME}</span>
      </div>
      {state.worktrees.map((worktree, index) => (
        <WorktreeEntry
          key={worktree.branch}
          worktree={worktree}
          isLast={index === state.worktrees.length - 1}
        />
      ))}
    </div>
  )
}
