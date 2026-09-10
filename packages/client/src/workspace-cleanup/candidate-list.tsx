import type { WorkspaceCleanupCandidate } from '@agentstart/protocol'
import { LegendList, type LegendListRenderItemProps } from '@legendapp/list/react'
import type React from 'react'
import { LEGEND_LIST_SCROLL_AREA_PROPS } from '~renderer/sidebar/list-scroll-area'

// Why: a collapsed row is a single metadata line (~48px with px-3 py-2.5);
// expanded rows and failure banners are taller, so LegendList starts from the
// common height and measures the tall variants after first paint.
const WORKSPACE_CLEANUP_ROW_ESTIMATE_PX = 48

function getWorkspaceCleanupCandidateKey(candidate: WorkspaceCleanupCandidate): string {
  return candidate.worktreeId
}

export function WorkspaceCleanupCandidateList({
  rows,
  renderRow,
  header
}: {
  rows: readonly WorkspaceCleanupCandidate[]
  renderRow: (candidate: WorkspaceCleanupCandidate, index: number) => React.ReactNode
  header?: React.ReactElement | null
}): React.JSX.Element {
  return (
    <div className="min-h-0 flex-1">
      <LegendList<WorkspaceCleanupCandidate>
        {...LEGEND_LIST_SCROLL_AREA_PROPS}
        data={rows}
        keyExtractor={getWorkspaceCleanupCandidateKey}
        estimatedItemSize={WORKSPACE_CLEANUP_ROW_ESTIMATE_PX}
        // Why: row output depends on selection, expansion, and failure state the
        // list never sees, all of which the caller closes over in renderRow.
        extraData={renderRow}
        ListHeaderComponent={header}
        renderItem={({ item, index }: LegendListRenderItemProps<WorkspaceCleanupCandidate>) =>
          renderRow(item, index)
        }
      />
    </div>
  )
}
