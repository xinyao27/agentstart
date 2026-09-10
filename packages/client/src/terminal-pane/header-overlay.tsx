import type { BaseUIEvent } from '@base-ui/react/types'
import type { CSSProperties, RefObject } from 'react'
import { translate } from '~renderer/i18n/i18n'
import { ArrowSquareOut, SquareSplitVertical, X } from '~renderer/icons/hugeicons'

// Why: this file is the only place that renders `.pane-title-bar` /
// `.pane-title-overlay-layer` / `[data-pane-title-surface]`, and it is only
// reachable through the terminal-pane lazy chunk — keeping the stylesheet
// here instead of main.css keeps title-bar chrome out of eager first-paint CSS.
import './pane-title.css'
import { isImeCompositionKeyDown } from '~renderer/keyboard-input/ime-composition'
import type { ManagedPane, PaneManager } from '~renderer/terminal-pane/pane-manager/pane-manager'
import { Button } from '~renderer/ui/button'
import { ContextMenuTrigger } from '~renderer/ui/context-menu'
import { Input } from '~renderer/ui/input'
import { Tooltip, TooltipContent, TooltipTrigger } from '~renderer/ui/tooltip'

import { handleInternalTerminalFileDrop } from './drop/handler'
import { carriesWorkspaceFilePaths } from './drop/workspace-file-payload'
import type { PtyTransport } from './pty/transport-types'

type PaneTitleOverlayRect = {
  left: number
  top: number
  width: number
}

type TerminalPaneHeaderOverlayProps = {
  tabId: string
  worktreeId: string
  cwd: string
  showAlwaysOnHeaders: boolean
  /** Used by ephemeral one-off command terminals that omit the header affordance. */
  showSplitButton?: boolean
  paneCount: number
  activePaneId: number | null | undefined
  panes: readonly ManagedPane[]
  paneTitles: Readonly<Record<number, string>>
  paneTitleOverlayRects: Readonly<Record<number, PaneTitleOverlayRect>>
  renamingPaneId: number | null
  renameValue: string
  renameInputRef: RefObject<HTMLInputElement | null>
  titleUsesLightSurface: boolean
  paneTitleBackground: string
  terminalContentVisible: boolean
  hiddenStartupStyle: CSSProperties
  managerRef: RefObject<PaneManager | null>
  paneTransportsRef: RefObject<Map<number, PtyTransport>>
  canContinueAgentSessionInNewSession?: boolean
  onContinueAgentSessionInNewSession?: (pane: ManagedPane) => void
  onSplitPane: (pane: ManagedPane, direction: 'vertical' | 'horizontal') => void
  onBeginPaneDrag: (paneId: number, handle: HTMLElement, event: PointerEvent) => void
  onActivatePaneTitleInteraction: (paneId: number) => void
  onPaneTitleContextMenu: (
    event: BaseUIEvent<React.MouseEvent<HTMLElement>>,
    paneId: number
  ) => void
  onStartRename: (paneId: number) => void
  onRemoveTitle: (paneId: number) => void
  onClosePane: (paneId: number) => void
  onRenameValueChange: (value: string) => void
  onRenameSubmit: () => void
  onRenameCancel: () => void
  onRenameBlur: () => void
}

export default function TerminalPaneHeaderOverlay({
  tabId,
  worktreeId,
  cwd,
  showAlwaysOnHeaders,
  showSplitButton = true,
  paneCount,
  activePaneId,
  panes,
  paneTitles,
  paneTitleOverlayRects,
  renamingPaneId,
  renameValue,
  renameInputRef,
  titleUsesLightSurface,
  paneTitleBackground,
  terminalContentVisible,
  hiddenStartupStyle,
  managerRef,
  paneTransportsRef,
  canContinueAgentSessionInNewSession,
  onContinueAgentSessionInNewSession,
  onSplitPane,
  onBeginPaneDrag,
  onActivatePaneTitleInteraction,
  onPaneTitleContextMenu,
  onStartRename,
  onRemoveTitle,
  onClosePane,
  onRenameValueChange,
  onRenameSubmit,
  onRenameCancel,
  onRenameBlur
}: TerminalPaneHeaderOverlayProps): React.JSX.Element {
  const splitRightLabel = translate(
    'auto.components.terminal.pane.TerminalContextMenu.20e565d865',
    'Split Terminal Right'
  )

  return (
    <div
      className="pane-title-overlay-layer"
      data-pane-title-surface={titleUsesLightSurface ? 'light' : 'dark'}
      style={{
        display: terminalContentVisible ? undefined : 'none',
        ['--agentstart-pane-title-bg' as string]: paneTitleBackground,
        ...hiddenStartupStyle
      }}
    >
      {panes.map((pane) => {
        const title = paneTitles[pane.id]
        const isEditing = renamingPaneId === pane.id
        const overlayRect = paneTitleOverlayRects[pane.id]
        const isActivePane = activePaneId === pane.id
        const isChromeless = showAlwaysOnHeaders && !title && !isEditing
        const showHeader = overlayRect && (showAlwaysOnHeaders || Boolean(title) || isEditing)
        if (!showHeader || !overlayRect) {
          return null
        }

        return (
          // Why: the pane header renders outside the terminal container, so it
          // needs its own trigger to reach the shared pane context menu.
          <ContextMenuTrigger
            key={`pane-title-${pane.leafId}`}
            className="pane-title-bar"
            data-terminal-tab-id={tabId}
            data-pane-prevent-terminal-focus=""
            {...(isActivePane ? { 'data-active-pane': '' } : {})}
            {...(isChromeless ? { 'data-chromeless': '' } : {})}
            {...(isEditing ? { 'data-editing': '' } : {})}
            onPointerDownCapture={
              title || isEditing ? () => onActivatePaneTitleInteraction(pane.id) : undefined
            }
            onDragOver={(event) => {
              onActivatePaneTitleInteraction(pane.id)
              if (carriesWorkspaceFilePaths(event.dataTransfer)) {
                event.preventDefault()
                event.dataTransfer.dropEffect = 'copy'
              }
            }}
            onDrop={(event) => {
              if (!carriesWorkspaceFilePaths(event.dataTransfer)) {
                return
              }
              event.preventDefault()
              event.stopPropagation()
              onActivatePaneTitleInteraction(pane.id)
              const manager = managerRef.current
              if (!manager) {
                return
              }
              void handleInternalTerminalFileDrop({
                manager,
                paneTransports: paneTransportsRef.current,
                worktreeId,
                tabId,
                cwd,
                dataTransfer: event.dataTransfer,
                dropTarget: event.target
              })
            }}
            onContextMenu={(event) => onPaneTitleContextMenu(event, pane.id)}
            style={{
              left: overlayRect.left,
              top: overlayRect.top,
              width: overlayRect.width
            }}
          >
            {isEditing ? (
              <Input
                ref={renameInputRef}
                variant="chrome-free"
                className="pane-title-input focus-visible:border-ring outline-none"
                aria-label={translate(
                  'auto.components.terminal.pane.TerminalPane.7dbbfcbecc',
                  'Pane title'
                )}
                placeholder={translate(
                  'auto.components.terminal.pane.TerminalPane.7dbbfcbecc',
                  'Pane title'
                )}
                value={renameValue}
                onChange={(event) => onRenameValueChange(event.target.value)}
                onKeyDown={(event) => {
                  // Why: an Enter that only confirms a CJK IME candidate must
                  // not commit the rename; wait for a non-composition Enter.
                  if (isImeCompositionKeyDown(event)) {
                    return
                  }
                  if (event.key === 'Enter') {
                    onRenameSubmit()
                  } else if (event.key === 'Tab') {
                    // Why: commit on Tab directly instead of relying on the
                    // browser advancing focus (which fires blur). Headless / no
                    // window-focus environments (xvfb, some SSH sessions) don't
                    // always move focus off the input, so the blur-driven commit
                    // never runs. Submitting closes the editor, so the default
                    // Tab focus move is moot and any follow-on blur is a no-op.
                    onRenameSubmit()
                  } else if (event.key === 'Escape') {
                    onRenameCancel()
                  }
                }}
                onBlur={onRenameBlur}
              />
            ) : (
              <>
                {paneCount > 1 && !isChromeless && (
                  <div
                    className="pane-title-drag-handle"
                    aria-hidden="true"
                    onPointerDown={(event) => {
                      onBeginPaneDrag(pane.id, event.currentTarget, event.nativeEvent)
                    }}
                  />
                )}
                {title ? (
                  <Button
                    variant="ghost"
                    size="xs"
                    type="button"
                    className="pane-title-text focus-visible:bg-accent h-auto w-auto p-0"
                    onClick={() => onStartRename(pane.id)}
                    aria-label={translate(
                      'auto.components.terminal.pane.TerminalPane.cc5a2dc706',
                      'Edit pane title: {{value0}}',
                      { value0: title }
                    )}
                  >
                    {title}
                  </Button>
                ) : null}
                <div className="pane-title-actions ml-auto flex shrink-0 items-center gap-0">
                  {canContinueAgentSessionInNewSession && isActivePane ? (
                    <Tooltip>
                      <TooltipTrigger
                        render={
                          <Button
                            type="button"
                            variant="ghost"
                            size="icon-xs"
                            className="pane-title-split-trigger"
                            aria-label={translate(
                              'components.agentSessionContinuation.continueInNewSession',
                              'Continue in New Session…'
                            )}
                            onClick={(event) => {
                              event.stopPropagation()
                              onContinueAgentSessionInNewSession?.(pane)
                            }}
                          >
                            <ArrowSquareOut className="size-3" />
                          </Button>
                        }
                      />
                      <TooltipContent side="bottom" sideOffset={4}>
                        {translate(
                          'components.agentSessionContinuation.continueInNewSession',
                          'Continue in New Session…'
                        )}
                      </TooltipContent>
                    </Tooltip>
                  ) : null}
                  {showAlwaysOnHeaders && showSplitButton ? (
                    <Tooltip>
                      <TooltipTrigger
                        render={
                          <Button
                            type="button"
                            variant="ghost"
                            size="icon-xs"
                            className="pane-title-split-trigger"
                            data-contextual-tour-target={
                              isActivePane ? 'terminal-pane-split-target' : undefined
                            }
                            aria-label={splitRightLabel}
                            onClick={(event) => {
                              event.stopPropagation()
                              onSplitPane(pane, 'vertical')
                            }}
                          >
                            <SquareSplitVertical className="size-3" />
                          </Button>
                        }
                      />
                      <TooltipContent side="bottom" sideOffset={4}>
                        {splitRightLabel}
                      </TooltipContent>
                    </Tooltip>
                  ) : null}
                  {title ? (
                    <Tooltip>
                      <TooltipTrigger
                        render={
                          <Button
                            type="button"
                            variant="ghost"
                            size="icon-xs"
                            className="pane-title-close"
                            onClick={(event) => {
                              event.stopPropagation()
                              onRemoveTitle(pane.id)
                            }}
                            aria-label={translate(
                              'auto.components.terminal.pane.TerminalPane.f984ab2a30',
                              'Remove pane title: {{value0}}',
                              { value0: title }
                            )}
                          >
                            <X className="size-3" />
                          </Button>
                        }
                      />
                      <TooltipContent side="bottom" sideOffset={4}>
                        {translate(
                          'auto.components.terminal.pane.TerminalPane.ac112e9036',
                          'Remove title'
                        )}
                      </TooltipContent>
                    </Tooltip>
                  ) : paneCount > 1 && showAlwaysOnHeaders ? (
                    <Tooltip>
                      <TooltipTrigger
                        render={
                          <Button
                            type="button"
                            variant="ghost"
                            size="icon-xs"
                            className="pane-title-close"
                            onClick={(event) => {
                              event.stopPropagation()
                              onClosePane(pane.id)
                            }}
                            aria-label={translate(
                              'auto.components.terminal.pane.TerminalContextMenu.8c17d6786d',
                              'Close Pane'
                            )}
                          >
                            <X className="size-3" />
                          </Button>
                        }
                      />
                      <TooltipContent side="bottom" sideOffset={4}>
                        {translate(
                          'auto.components.terminal.pane.TerminalContextMenu.8c17d6786d',
                          'Close Pane'
                        )}
                      </TooltipContent>
                    </Tooltip>
                  ) : null}
                </div>
              </>
            )}
          </ContextMenuTrigger>
        )
      })}
    </div>
  )
}
