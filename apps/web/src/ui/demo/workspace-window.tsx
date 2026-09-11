import { BrowserPane } from './browser-pane'
import { Cursor } from './cursor'
import { DiffPane } from './diff-pane'
import { Phone } from './phone'
import { SessionView } from './session-view'
import { PROJECT_NAME } from './state'
import type { DemoState, PaneGroup, TabId } from './state'
import { TabStrip } from './tab-strip'
import { WindowChrome } from './window-chrome'
import { WorktreeRail } from './worktree-rail'

function renderPane(tab: TabId, state: DemoState): React.JSX.Element {
  switch (tab) {
    case 'claude':
      return <SessionView state={state} />
    case 'diff':
      return <DiffPane state={state} />
    case 'browser':
      return <BrowserPane state={state} />
  }
}

function PaneColumn({ group, state }: { group: PaneGroup; state: DemoState }): React.JSX.Element {
  return (
    <div className="flex min-w-0 flex-1 flex-col">
      <TabStrip tabs={group.tabs} activeTab={group.activeTab} />
      {/* Why: min-h-0 or the row's auto minimum is its content, and the agent
          session — which prints more than fits on purpose — pushes the column
          past the window instead of scrolling off its own top edge. */}
      <div className="flex min-h-0 min-w-0 flex-1">{renderPane(group.activeTab, state)}</div>
    </div>
  )
}

export type WorkspaceWindowProps = {
  state: DemoState
}

export function WorkspaceWindow({ state }: WorkspaceWindowProps): React.JSX.Element {
  return (
    <div className="border-hairline rounded-card relative flex min-w-0 flex-1 flex-col overflow-hidden border">
      <WindowChrome title={PROJECT_NAME} />
      {/* Why: a fixed height, not a floor. 318px is the tallest beat any pane
          needs — the twelve-line diff hunk at 291px — and the agent session
          deliberately prints more than fits, so it can scroll off the top the
          way a terminal does. A floor would let it push the window to twice the
          page's height instead. */}
      <div className="flex h-[318px]">
        <WorktreeRail state={state} />
        <div className="divide-hairline flex min-w-0 flex-1 divide-x">
          {state.groups.map((group) => (
            <PaneColumn key={group.tabs.join('-')} group={group} state={state} />
          ))}
        </div>
      </div>

      <Phone state={state} />

      <Cursor at={state.cursor} pressed={state.cursorPressed} />
    </div>
  )
}
