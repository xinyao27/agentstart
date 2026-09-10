import { createElement } from 'react'
import { AgentIcon } from '~renderer/agent/catalog'
import { getFileTypeIcon } from '~renderer/file-presentation/icons'
import { GitBranch, Globe, Terminal as TerminalIcon } from '~renderer/icons/hugeicons'

import type { TabDragItemData } from '../tab-group/use-tab-drag-split'

// Why: a terminal tab running an agent leads with the provider glyph so the
// ghost matches the resting tab; plain terminals keep the generic icon.
function LeadingIcon({ drag }: { drag: TabDragItemData }): React.JSX.Element {
  if (drag.tabType === 'browser') {
    return <Globe className="h-3.5 w-3.5 shrink-0" />
  }
  if (drag.tabType === 'editor') {
    const FileIcon = getFileTypeIcon(drag.iconPath ?? drag.label)
    return createElement(FileIcon, { className: 'h-3.5 w-3.5 shrink-0' })
  }
  if (drag.tabType === 'git-graph') {
    return <GitBranch className="h-3.5 w-3.5 shrink-0" />
  }
  if (drag.agent) {
    return <AgentIcon agent={drag.agent} size={14} />
  }
  return <TerminalIcon className="h-3.5 w-3.5 shrink-0" />
}

// Why: rendered inside dnd-kit's DragOverlay (a document-level portal), so
// the dragged tab stays visible under the cursor even when it leaves its
// source tab strip. The DragOverlay sizes its wrapper from the source
// element's rect; `h-full w-full` on this chip fills that wrapper so the
// ghost lines up with the cursor instead of rendering as a tiny pill in
// the wrapper's top-left.
export default function TabDragPreview({ drag }: { drag: TabDragItemData }): React.JSX.Element {
  return (
    <div className="border-border bg-accent text-foreground pointer-events-none flex h-full w-full items-center gap-1.5 rounded-sm border px-2 text-xs">
      <span className="inline-flex shrink-0">
        <LeadingIcon drag={drag} />
      </span>
      <span className="truncate">{drag.label}</span>
      {drag.color ? (
        <span className="size-2 shrink-0 rounded-full" style={{ backgroundColor: drag.color }} />
      ) : null}
    </div>
  )
}
