import type React from 'react'
import { translate } from '~renderer/i18n/i18n'
import { Button } from '~renderer/ui/button'

import { type GitGraphColumnWidths, gitGraphColumnFlexStyle } from './column-widths'
import { gitGraphVertexPath } from './vertex-mosaic'

// Why: pinned pseudo-row for the dirty worktree, rendered above the real
// commit graph. It draws its own small grey vertex rather than participating
// in the shared GitGraphSvg instance (owned by layout.ts/graph-svg.tsx) —
// there is no real commit/parent edge for uncommitted changes to hang off of,
// so folding it into the shared vertex/edge model would need a fabricated
// commit node the layout algorithm was never designed to represent.
export function GitGraphUncommittedRow({
  graphColumnWidth,
  columnWidths,
  onOpen
}: {
  graphColumnWidth: number
  columnWidths: GitGraphColumnWidths
  onOpen: () => void
}): React.JSX.Element {
  const label = translate(
    'auto.components.workspacePanel.git-graph.UncommittedRow.a1b2c3d4e5',
    'Uncommitted Changes'
  )

  return (
    <Button
      type="button"
      variant="ghost"
      onClick={onOpen}
      className="hover:bg-accent/40 focus-visible:bg-accent/40 border-border/60 h-auto w-full min-w-0 justify-start border-0 border-b px-0 text-left text-xs whitespace-normal"
      style={{ height: 24 }}
    >
      <span
        className="flex h-full shrink-0 items-center justify-center"
        style={{ width: graphColumnWidth }}
      >
        {/* Why: hollow square + dashed stem in the same pixel register as
            GitGraphSvg, so the pinned pseudo-row reads as part of the graph. */}
        <svg
          width="16"
          height="24"
          viewBox="0 0 16 24"
          aria-hidden="true"
          shapeRendering="crispEdges"
        >
          <path d={gitGraphVertexPath(8, 12, 'uncommitted')} fill="var(--muted-foreground)" />
          <line
            x1="8"
            y1="16"
            x2="8"
            y2="24"
            stroke="var(--muted-foreground)"
            strokeLinecap="butt"
            strokeWidth="2"
            strokeDasharray="2"
          />
        </svg>
      </span>
      <span
        className="text-foreground min-w-0 truncate font-medium italic"
        style={gitGraphColumnFlexStyle('description', columnWidths)}
      >
        {label}
      </span>
    </Button>
  )
}
