import React from 'react'
import { translate } from '~renderer/i18n/i18n'
import {
  Minus,
  Plus,
  Trash,
  ArrowCounterClockwise as Undo2,
  GitDiff
} from '~renderer/icons/hugeicons'
import {
  getDiscardAllPaths,
  getUnstageAllPaths,
  isStageableStatusEntry
} from '~renderer/workspace-panel/discard-all-sequence'
import type { SourceControlController } from '~renderer/workspace-panel/source-control/controller'
import {
  CONFLICTS_SECTION_LABEL,
  SECTION_LABELS
} from '~renderer/workspace-panel/source-control/panel-constants'
import { ActionButton } from '~renderer/workspace-panel/source-control/tree/action-button'
import { SourceControlGroupRow } from '~renderer/workspace-panel/source-control/tree/group-row'
import { SourceControlPierreUncommittedTree } from '~renderer/workspace-panel/source-control/tree/pierre-tree'
import {
  getSourceControlSectionViewAction,
  type SourceControlDisplaySection
} from '~renderer/workspace-panel/source-control/tree/section-order'

export function SourceControlUncommittedGroupActions({
  controller,
  section
}: {
  controller: SourceControlController
  section: SourceControlDisplaySection
}): React.JSX.Element {
  const {
    activeWorktreeId,
    handleStageAllPaths,
    handleUnstagePaths,
    isExecutingBulk,
    normalizedFilter,
    openAllDiffs,
    openConflictReview,
    requestDiscardAllInArea,
    unfilteredDisplaySectionsById,
    worktreePath
  } = controller
  // Why: bulk actions operate on the unfiltered group — staging "all" of a
  // filtered view would do less than the label promises.
  const actionSection = unfilteredDisplaySectionsById.get(section.id) ?? section
  const { area, items } = actionSection
  const stageAllPaths = items.filter(isStageableStatusEntry).map((entry) => entry.path)
  const unstageAllPaths = getUnstageAllPaths(items)
  const discardAllPaths = getDiscardAllPaths(items, area)
  const viewAction = getSourceControlSectionViewAction(actionSection)

  return (
    <>
      {!normalizedFilter && discardAllPaths.length > 0 ? (
        <ActionButton
          surface="row"
          icon={area === 'untracked' ? Trash : Undo2}
          title={
            area === 'untracked'
              ? translate(
                  'auto.components.workspacePanel.SourceControl.2f609a2e7c',
                  'Delete all untracked'
                )
              : translate('auto.components.workspacePanel.SourceControl.ce41708855', 'Discard all')
          }
          onClick={() => requestDiscardAllInArea(area, discardAllPaths)}
          disabled={isExecutingBulk}
        />
      ) : null}
      {!normalizedFilter && stageAllPaths.length > 0 ? (
        <ActionButton
          surface="row"
          icon={Plus}
          title={translate('auto.components.workspacePanel.SourceControl.24d2598eff', 'Stage all')}
          onClick={() => void handleStageAllPaths(stageAllPaths)}
          disabled={isExecutingBulk}
        />
      ) : null}
      {!normalizedFilter && unstageAllPaths.length > 0 ? (
        <ActionButton
          surface="row"
          icon={Minus}
          title={translate(
            'auto.components.workspacePanel.SourceControl.9339382454',
            'Unstage all'
          )}
          onClick={() => void handleUnstagePaths(unstageAllPaths)}
          disabled={isExecutingBulk}
        />
      ) : null}
      {viewAction && activeWorktreeId && worktreePath ? (
        <ActionButton
          surface="row"
          icon={GitDiff}
          title={translate('auto.components.workspacePanel.SourceControl.48db37cca9', 'View all')}
          onClick={() => {
            if (viewAction.kind === 'conflict-review') {
              openConflictReview(activeWorktreeId, worktreePath, viewAction.entries, 'live-summary')
              return
            }
            openAllDiffs(
              activeWorktreeId,
              worktreePath,
              undefined,
              viewAction.area,
              viewAction.entries
            )
          }}
        />
      ) : null}
    </>
  )
}

export function getSourceControlGroupLabel(section: SourceControlDisplaySection): string {
  const label = section.id === 'conflicts' ? CONFLICTS_SECTION_LABEL : SECTION_LABELS[section.area]
  return translate(label.key, label.fallback)
}

function SourceControlUncommittedGroups({
  controller
}: {
  controller: SourceControlController
}): React.JSX.Element {
  const { collapsedSections, displaySections, toggleSection } = controller
  return (
    <>
      {displaySections.map((section) => {
        const isExpanded = !collapsedSections.has(section.id)
        return (
          <React.Fragment key={section.id}>
            <SourceControlGroupRow
              label={getSourceControlGroupLabel(section)}
              count={section.items.length}
              conflictCount={
                section.items.filter((entry) => entry.conflictStatus === 'unresolved').length
              }
              isExpanded={isExpanded}
              onToggle={() => toggleSection(section.id)}
              actions={
                <SourceControlUncommittedGroupActions controller={controller} section={section} />
              }
            />
            {isExpanded ? (
              <SourceControlPierreUncommittedTree controller={controller} sectionId={section.id} />
            ) : null}
          </React.Fragment>
        )
      })}
    </>
  )
}

// Why: `controller` is rebuilt on every render by the controller hook chain, and
// this component forwards the whole object to the file list, which reads roughly
// two dozen fields this one never touches — a field-scoped comparator would let
// that child render with stale data, so the compare stays a reference check.
export const SourceControlUncommittedGroupsMemo = SourceControlUncommittedGroups
