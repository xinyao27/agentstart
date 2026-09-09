import { parseExecutionHostId } from '@yiru/protocol/host/identity'
import type { Repo } from '@yiru/protocol/project/repository'
import { isFolderRepo } from '@yiru/protocol/project/repository'
import { DEFAULT_AGENT_ACTIVITY_DISPLAY_MODE } from '@yiru/protocol/settings/workspace-preferences'
import { parseWorkspaceKey } from '@yiru/protocol/workspace/identity'
import type { Tab, TerminalTab } from '@yiru/protocol/workspace/tabs'
import type { Worktree } from '@yiru/protocol/worktree/model'
import { useState } from 'react'

import { AgentPhaseLabel } from '../agent-session/phase'
import { useWorktreeAgentPhase } from '../agent-session/presence'
import { recordRendererCrashBreadcrumb } from '../crash-report/diagnostics'
import { translate } from '../i18n/i18n'
import { WarningCircle, GitMerge, Trash } from '../icons/hugeicons'
import { LoadingIndicator } from '../loading/indicator'
import { useAppStore } from '../store/state'
import { Badge } from '../ui/badge'
import { Button } from '../ui/button'
import { cn } from '../ui/class-names'
import { Tooltip, TooltipContent, TooltipTrigger } from '../ui/tooltip'
import { UnreadStatusIndicator } from '../ui/unread-status-indicator'
import { getWorktreeGitIdentityDisplay } from '../worktree/git-identity-display'
import { AutoRenameFailedDialog } from './auto-rename-failed-dialog'
import { runWorktreeDelete } from './delete-worktree/flow'
import { writeWorkspaceDragData } from './workspace-status'
import { activateWorktreeFromSidebar } from './worktree-activation'
import { isEventTargetInsideCurrentTarget } from './worktree-card/dom-events'
import type { WorktreeCardPrDisplay } from './worktree-card/pr-display'
import { WorktreeCardStatusSlot } from './worktree-card/status-slot'
import { WorktreeCardSurface, type WorktreeCardSurfaceActiveVariant } from './worktree-card/surface'
import { WorktreeCardTabs } from './worktree-card/tabs'
import { WorktreeContextMenu } from './worktree-context-menu/menu'
import { getFlushWorktreeCardPaddingLeft } from './worktree-list/indentation'
import { WorktreeTitleInlineRename } from './worktree-title-inline-rename'

type WorktreeRenameRequest = {
  rowKey?: string
  worktreeId: string
}

export type ActiveSurfaceVariant = WorktreeCardSurfaceActiveVariant

type WorktreeCardProps = {
  worktree: Worktree
  repo: Repo | undefined
  isActive: boolean
  isCurrentWorktree?: boolean
  isActiveSurface?: boolean
  activeSurfaceVariant?: ActiveSurfaceVariant
  isMultiSelected?: boolean
  revealHighlight?: boolean
  revealHighlightTone?: 'default' | 'ai'
  selectedWorktrees?: readonly Worktree[]
  hideRepoBadge?: boolean
  hostContextLabel?: string
  inPinnedSection?: boolean
  activationRowKey?: string
  renameRowKey?: string
  contentIndent?: number
  flushSurface?: boolean
  lineageChildCount?: number
  lineageCollapsed?: boolean
  lineageChildren?: React.ReactNode
  lineageChildrenStyle?: React.CSSProperties
  onLineageToggle?: (groupKey: string, event: React.MouseEvent<HTMLButtonElement>) => void
  lineageToggleGroupKey?: string
  isLineageDropTarget?: boolean
  onActivate?: () => void
  onImmediateActivate?: (worktreeId: string, rowKey: string | undefined) => void
  onSelectionGesture?: (event: React.MouseEvent<HTMLElement>, worktreeId: string) => boolean
  onContextMenuSelect?: (
    event: React.MouseEvent<HTMLElement>,
    worktree: Worktree
  ) => readonly Worktree[]
  onCardDragStart?: (
    event: React.DragEvent<HTMLDivElement>,
    worktreeId: string,
    draggedIds: readonly string[]
  ) => void
  onCardDragEnd?: (event: React.DragEvent<HTMLDivElement>) => void
  nativeDragEnabled?: boolean
  affiliateListMode?: boolean
  statusPrDisplay?: WorktreeCardPrDisplay | null
}

const EMPTY_OPEN_TABS: readonly Tab[] = []
const EMPTY_TERMINAL_TABS: readonly TerminalTab[] = []

export function shouldBeginWorktreeRename(
  request: WorktreeRenameRequest | null,
  worktreeId: string,
  rowKey: string | undefined
): boolean {
  return (
    request?.worktreeId === worktreeId &&
    (request.rowKey === undefined || request.rowKey === rowKey)
  )
}

function reviewNumber(worktree: Worktree): number | null {
  return worktree.linkedPR ?? null
}

export function WorktreeCard({
  worktree,
  repo,
  isActive,
  isActiveSurface = isActive,
  activeSurfaceVariant = 'primary',
  isMultiSelected = false,
  revealHighlight = false,
  revealHighlightTone = 'default',
  selectedWorktrees,
  hostContextLabel,
  activationRowKey,
  renameRowKey,
  contentIndent = 0,
  flushSurface = false,
  lineageChildCount = 0,
  lineageCollapsed = false,
  lineageChildren,
  lineageChildrenStyle,
  onLineageToggle,
  lineageToggleGroupKey,
  isLineageDropTarget = false,
  onActivate,
  onImmediateActivate,
  onSelectionGesture,
  onContextMenuSelect,
  onCardDragStart,
  onCardDragEnd,
  nativeDragEnabled = true,
  affiliateListMode = false,
  statusPrDisplay = null
}: WorktreeCardProps): React.JSX.Element {
  const [showRenameError, setShowRenameError] = useState(false)
  const updateWorktreeMeta = useAppStore((state) => state.updateWorktreeMeta)
  const renamingWorktreeId = useAppStore((state) => state.renamingWorktreeId)
  const setRenamingWorktreeId = useAppStore((state) => state.setRenamingWorktreeId)
  const deleteState = useAppStore((state) => state.deleteStateByWorktreeId[worktree.id])
  const cardProperties = useAppStore((state) => state.worktreeCardProperties)
  const agentActivityDisplayMode =
    useAppStore((state) => state.agentActivityDisplayMode) ?? DEFAULT_AGENT_ACTIVITY_DISPLAY_MODE
  const openTabs = useAppStore(
    (state) => state.unifiedTabsByWorktree[worktree.id] ?? EMPTY_OPEN_TABS
  )
  const terminalTabs = useAppStore(
    (state) => state.tabsByWorktree[worktree.id] ?? EMPTY_TERMINAL_TABS
  )
  const isRuntimeDisconnected = useAppStore((state) => {
    const host = parseExecutionHostId(repo?.executionHostId)
    return host?.kind === 'runtime'
      ? !state.runtimeStatusByEnvironmentId.get(host.environmentId)?.status
      : false
  })
  const agentPhase = useWorktreeAgentPhase(worktree.id)
  const gitIdentity = getWorktreeGitIdentityDisplay(worktree)
  const identity = gitIdentity?.kind === 'branch' ? gitIdentity.branchName : null
  const folderScope = parseWorkspaceKey(worktree.id)
  const isFolder = repo ? isFolderRepo(repo) : folderScope?.type === 'folder'
  const isDeleting = deleteState?.isDeleting === true
  const showStatus = cardProperties.includes('status')
  const showTabs = cardProperties.includes('inline-agents')
  const showIdentity = cardProperties.includes('branch') && Boolean(identity)
  const linkedReviewNumber = reviewNumber(worktree)
  const cardPaddingLeft = flushSurface
    ? getFlushWorktreeCardPaddingLeft(contentIndent, showStatus)
    : contentIndent > 0
      ? `calc(0.125rem + ${contentIndent}px)`
      : undefined

  const activate = (event: React.MouseEvent<HTMLDivElement>): void => {
    if (!isEventTargetInsideCurrentTarget(event.currentTarget, event.target) || isDeleting) {
      return
    }
    if (!affiliateListMode && onSelectionGesture?.(event, worktree.id)) {
      return
    }
    recordRendererCrashBreadcrumb('sidebar_worktree_activate', {
      repoId: worktree.repoId,
      wasActive: isActive,
      worktreeId: worktree.id
    })
    onImmediateActivate?.(worktree.id, activationRowKey)
    activateWorktreeFromSidebar(worktree.id)
    onActivate?.()
  }

  const drag = (event: React.DragEvent<HTMLDivElement>): void => {
    const ids =
      isMultiSelected && selectedWorktrees && selectedWorktrees.length > 1
        ? selectedWorktrees.map((selected) => selected.id)
        : [worktree.id]
    writeWorkspaceDragData(event.dataTransfer, ids)
    onCardDragStart?.(event, worktree.id, ids)
  }

  const card = (
    <WorktreeCardSurface
      activeVariant={isActiveSurface ? activeSurfaceVariant : undefined}
      aria-busy={isDeleting}
      className={cn(
        revealHighlight && 'scroll-to-current-workspace-reveal-highlight',
        revealHighlight &&
          revealHighlightTone === 'ai' &&
          'scroll-to-current-workspace-reveal-highlight--ai',
        isDeleting && 'cursor-not-allowed opacity-50 grayscale',
        isRuntimeDisconnected && !isDeleting && 'opacity-60'
      )}
      density={showTabs && openTabs.length > 0 ? 'details' : 'title-only'}
      draggable={!affiliateListMode && nativeDragEnabled && !isDeleting}
      dropTarget={isLineageDropTarget}
      flush={flushSurface}
      multiSelected={isMultiSelected}
      onClick={activate}
      onDragEnd={onCardDragEnd}
      onDragStart={drag}
      style={cardPaddingLeft ? { paddingLeft: cardPaddingLeft } : undefined}
    >
      {isDeleting ? (
        <div className="bg-background/50 absolute inset-0 z-10 flex items-center justify-center">
          <LoadingIndicator className="size-3.5" />
        </div>
      ) : null}
      <div className="flex min-w-0 items-start gap-1">
        {showStatus ? (
          <div className="flex size-5 shrink-0 items-center justify-center">
            <WorktreeCardStatusSlot
              hasBranchIdentity={Boolean(identity)}
              prDisplay={statusPrDisplay}
              showStatus
              worktreeId={worktree.id}
            />
          </div>
        ) : null}
        <div className="min-w-0 flex-1">
          <div className="flex h-5 min-w-0 items-center gap-1.5">
            <WorktreeTitleInlineRename
              beginEditing={
                !affiliateListMode &&
                shouldBeginWorktreeRename(renamingWorktreeId, worktree.id, renameRowKey)
              }
              className="text-[13px] leading-5"
              disabled={isDeleting || affiliateListMode}
              displayName={worktree.displayName}
              onBeginEditingConsumed={() => setRenamingWorktreeId(null)}
              onRename={(displayName) => updateWorktreeMeta(worktree.id, { displayName })}
              showUnreadEmphasis={showStatus && worktree.isUnread}
            />
            {worktree.isMainWorktree && !isFolder ? (
              <Badge className="h-[13px] px-1 text-[9px]" variant="outline">
                {translate('sidebar.worktree.primary', 'primary')}
              </Badge>
            ) : null}
            {linkedReviewNumber ? (
              <Badge className="h-[13px] px-1 text-[9px]" variant="outline">
                #{linkedReviewNumber}
              </Badge>
            ) : null}
            {agentPhase ? <AgentPhaseLabel phase={agentPhase} /> : null}
            {showStatus && worktree.isUnread ? <UnreadStatusIndicator /> : null}
            {worktree.firstAgentMessageRenameError ? (
              <Button
                aria-label={translate('sidebar.worktree.renameFailed', 'View rename error')}
                onClick={(event) => {
                  event.stopPropagation()
                  setShowRenameError(true)
                }}
                size="icon-xs"
                type="button"
                variant="ghost"
              >
                <WarningCircle className="text-destructive size-3" />
              </Button>
            ) : null}
          </div>
          {showIdentity || hostContextLabel ? (
            <div className="text-muted-foreground flex h-4 items-center gap-1.5 truncate text-[10px]">
              {hostContextLabel ? <span>{hostContextLabel}</span> : null}
              {showIdentity ? <span className="truncate">{identity}</span> : null}
            </div>
          ) : null}
          {showTabs ? (
            <WorktreeCardTabs
              displayMode={agentActivityDisplayMode}
              hasLeadingStatusIcon={showStatus}
              tabs={openTabs}
              terminalTabs={terminalTabs}
              worktreeId={worktree.id}
            />
          ) : null}
          {lineageChildCount > 0 && lineageToggleGroupKey ? (
            <Button
              onClick={(event) => onLineageToggle?.(lineageToggleGroupKey, event)}
              size="xs"
              type="button"
              variant="ghost"
            >
              <GitMerge className="size-3" />
              {lineageCollapsed
                ? translate('sidebar.worktree.showChildren', 'Show {{count}} children', {
                    count: lineageChildCount
                  })
                : translate('sidebar.worktree.hideChildren', 'Hide {{count}} children', {
                    count: lineageChildCount
                  })}
            </Button>
          ) : null}
        </div>
        {!affiliateListMode && !worktree.isMainWorktree ? (
          <Tooltip>
            <TooltipTrigger
              render={
                <Button
                  aria-label={translate('sidebar.worktree.delete', 'Delete workspace')}
                  className="opacity-0 group-hover/worktree-card:opacity-100"
                  onClick={(event) => {
                    event.stopPropagation()
                    runWorktreeDelete(worktree.id)
                  }}
                  size="icon-xs"
                  type="button"
                  variant="ghost"
                >
                  <Trash className="size-3" />
                </Button>
              }
            />
            <TooltipContent side="right">
              {translate('sidebar.worktree.delete', 'Delete workspace')}
            </TooltipContent>
          </Tooltip>
        ) : null}
      </div>
      {lineageChildren ? (
        <div className="mt-1.5 space-y-1" style={lineageChildrenStyle}>
          {lineageChildren}
        </div>
      ) : null}
    </WorktreeCardSurface>
  )

  return (
    <>
      {affiliateListMode ? (
        card
      ) : (
        <WorktreeContextMenu
          onContextMenuSelect={(event) => onContextMenuSelect?.(event, worktree) ?? [worktree]}
          selectedWorktrees={selectedWorktrees}
          worktree={worktree}
        >
          {card}
        </WorktreeContextMenu>
      )}
      {worktree.firstAgentMessageRenameError ? (
        <AutoRenameFailedDialog
          error={worktree.firstAgentMessageRenameError}
          onOpenChange={setShowRenameError}
          open={showRenameError}
          worktreeId={worktree.id}
          worktreeName={worktree.displayName}
        />
      ) : null}
    </>
  )
}

export default WorktreeCard
