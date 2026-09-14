import { SortableContext } from '@dnd-kit/sortable'
import React from 'react'
import { resolveTerminalTabTitle } from '~renderer/tab-title-resolution'

import type { OpenFile } from '../editor/state'
import type { TabDragItemData } from '../tab-group/use-tab-drag-split'
import BrowserTab from './browser-tab'
import EditorFileTab from './editor-file-tab'
import { GitGraphTab } from './git-graph-tab'
import { WorkspacePageStripTab } from './page-tab'
import SortableTab from './sortable-tab'
import type { TabBarProps } from './tab-bar-types'
import { getTabStripDragLabel, useTabStripModel } from './use-tab-strip-model'
import { WorkspaceTabStripViewport } from './workspace-tab-strip-viewport'

const noopMakePermanent = (): void => {}

export function TabStrip(props: TabBarProps): React.JSX.Element {
  const {
    activeBrowserTabId,
    activeFileId,
    activeGitGraphTabId,
    activeSimulatorTabId,
    activeTabId,
    activeTabType,
    expandedPaneByTabId,
    onActivate,
    onActivateBrowserTab,
    onActivateFile,
    onActivateGitGraphTab,
    onClose,
    onCloseAllFiles,
    onCloseBrowserTab,
    onCloseFile,
    onCloseOthers,
    onCloseToRight,
    onDuplicateBrowserTab,
    onMakePreviewFilePermanent,
    onSetCustomTitle,
    onSetTabColor,
    onTogglePaneExpand,
    worktreeId
  } = props
  const model = useTabStripModel(props)

  return (
    <WorkspaceTabStripViewport
      activeTabId={model.activeVisibleTabId}
      layoutKey={model.layoutKey}
      tabCount={model.orderedItems.length}
      navigationScopeId={worktreeId}
    >
      <SortableContext items={model.sortableIds}>
        {model.orderedItems.map((item, index) => {
          const dragData: TabDragItemData = {
            kind: 'tab',
            worktreeId,
            groupId: model.resolvedGroupId,
            unifiedTabId: item.unifiedTabId,
            visibleTabId: item.id,
            tabType: item.type,
            label: getTabStripDragLabel(item, model.generatedTitlesEnabled),
            iconPath: item.type === 'editor' ? item.data.filePath : undefined,
            color: item.type === 'terminal' ? (item.data.color ?? null) : null
          }
          const hasTabsToRight = index < model.orderedItems.length - 1
          const dropIndicator = model.dropIndicatorByVisibleId.get(item.id) ?? null

          // Why: page tabs render inside the strip queue and are drag
          // participants like any other tab, so they take the same drag payload
          // and drop indicator the workspace tabs do.
          if (item.type === 'page') {
            return (
              <WorkspacePageStripTab
                key={item.id}
                view={item.data}
                active={item.id === model.activeVisibleTabId}
                dragData={dragData}
                dropIndicator={dropIndicator}
              />
            )
          }

          if (item.type === 'terminal') {
            const terminalTab = {
              ...item.data,
              title: resolveTerminalTabTitle(
                item.data,
                model.generatedTitlesEnabled,
                item.data.title
              )
            }
            return (
              <SortableTab
                key={item.id}
                tab={terminalTab}
                unifiedTabId={item.unifiedTabId}
                groupId={model.resolvedGroupId}
                tabCount={model.orderedItems.length}
                hasTabsToRight={hasTabsToRight}
                isActive={
                  (activeTabType === 'terminal' || activeTabType === 'simulator') &&
                  item.id === activeTabId
                }
                isPinned={item.isPinned}
                isExpanded={expandedPaneByTabId[item.id] === true}
                onActivate={onActivate}
                onClose={onClose}
                onCloseOthers={onCloseOthers}
                onCloseToRight={onCloseToRight}
                onSetCustomTitle={onSetCustomTitle}
                onSetTabColor={onSetTabColor}
                onTogglePin={() => model.togglePinned(item)}
                onToggleExpand={onTogglePaneExpand}
                dragData={dragData}
                dropIndicator={dropIndicator}
              />
            )
          }
          if (item.type === 'browser') {
            return (
              <BrowserTab
                key={item.id}
                tab={item.data}
                isActive={activeTabType === 'browser' && activeBrowserTabId === item.id}
                isPinned={item.isPinned}
                hasTabsToRight={hasTabsToRight}
                onActivate={() => onActivateBrowserTab?.(item.id)}
                onClose={() => onCloseBrowserTab?.(item.id)}
                onCloseToRight={() => onCloseToRight(item.id)}
                onDuplicate={() => onDuplicateBrowserTab?.(item.id)}
                onTogglePin={() => model.togglePinned(item)}
                dragData={dragData}
                dropIndicator={dropIndicator}
              />
            )
          }
          if (item.type === 'simulator') {
            const label = item.data.label || 'Mobile Emulator'
            const simulatorFile: OpenFile & { tabId: string } = {
              id: item.id,
              tabId: item.id,
              filePath: label,
              relativePath: label,
              worktreeId,
              language: 'simulator',
              isPreview: false,
              isDirty: false,
              mode: 'edit'
            }
            return (
              <EditorFileTab
                key={item.id}
                file={simulatorFile}
                isActive={activeTabType === 'simulator' && item.id === activeSimulatorTabId}
                isPinned={item.isPinned}
                hasTabsToRight={hasTabsToRight}
                statusByRelativePath={model.statusByRelativePath}
                onActivate={() => onActivateFile?.(item.id)}
                onClose={() => onCloseFile?.(item.id)}
                onCloseToRight={() => onCloseToRight(item.id)}
                onCloseAll={() => onCloseAllFiles?.()}
                onMakePermanent={noopMakePermanent}
                onTogglePin={() => model.togglePinned(item)}
                dragData={dragData}
                dropIndicator={dropIndicator}
              />
            )
          }
          if (item.type === 'git-graph') {
            return (
              <GitGraphTab
                key={item.id}
                id={item.id}
                label={item.data.label}
                isActive={item.id === activeGitGraphTabId}
                onActivate={() => onActivateGitGraphTab?.(item.id)}
                onClose={() => onCloseFile?.(item.id)}
                dragData={dragData}
                dropIndicator={dropIndicator}
              />
            )
          }
          return (
            <EditorFileTab
              key={item.id}
              file={item.data}
              isActive={
                (activeTabType === 'editor' || activeTabType === 'simulator') &&
                activeFileId === item.id
              }
              isPinned={item.isPinned}
              hasTabsToRight={hasTabsToRight}
              statusByRelativePath={model.statusByRelativePath}
              onActivate={() => onActivateFile?.(item.id)}
              onClose={() => onCloseFile?.(item.id)}
              onCloseToRight={() => onCloseToRight(item.id)}
              onCloseAll={() => onCloseAllFiles?.()}
              onMakePermanent={() => onMakePreviewFilePermanent?.(item.data.id, item.data.tabId)}
              onTogglePin={() => model.togglePinned(item)}
              dragData={dragData}
              dropIndicator={dropIndicator}
            />
          )
        })}
      </SortableContext>
    </WorkspaceTabStripViewport>
  )
}
