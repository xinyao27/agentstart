import type { ReadClipboardTextOptions } from '~renderer/clipboard/text'
import { translate } from '~renderer/i18n/i18n'
import { getConnectionId } from '~renderer/runtime/connection-context'
import { shellClient } from '~renderer/runtime/shell-client'
import { useAppStore } from '~renderer/store/state'
import { pasteTerminalText } from '~renderer/terminal/bracketed-paste'
import { getRuntimeEnvironmentIdForWorktree } from '~renderer/worktree/runtime-owner'

import type { ManagedPane, PaneManager } from './pane-manager/pane-manager'
import {
  executeTerminalPastePlan,
  planTerminalPasteWithYield,
  type TerminalPasteSource,
  type TerminalPasteTextOptions
} from './paste/coordinator'
import { formatTerminalPasteExecutionError } from './paste/errors'
import { resolveTerminalPasteRuntime } from './paste/runtime'
import {
  isTerminalPanePasteFocusCurrent,
  isTerminalPanePasteTargetCurrent
} from './paste/target-state'
import type { PtyTransport } from './pty/transport-types'
import { pasteTerminalClipboard } from './terminal-clipboard-paste'
import { reportTerminalPaneError } from './terminal-error-reporting'
import { recordTerminalUserInputForLeaf } from './terminal-input-activity'
import { writeTerminalPastePtyInput } from './terminal-pty-paste-writer'
import { scheduleImagePasteWebglAtlasRecovery } from './terminal-webgl-atlas-recovery'

type EventPasteSource = Extract<TerminalPasteSource, 'app-menu' | 'keyboard' | 'paste-event'>

type TerminalPanePasteActionsInput = {
  forceBracketedMultilineTextPaste: boolean
  managerRef: React.RefObject<PaneManager | null>
  paneTransportsRef: React.RefObject<Map<number, PtyTransport>>
  shortcutPlatform: NodeJS.Platform
  tabId: string
  worktreeId: string
}

type PasteFromClipboardInput = {
  activeElementAtDispatch: Element | null
  pane: ManagedPane
  readClipboardText?: (options?: ReadClipboardTextOptions) => Promise<string>
  source: EventPasteSource
}

type TerminalPanePasteActions = {
  pasteFromClipboard: (input: PasteFromClipboardInput) => void
}

function formatClipboardImagePasteError(error: unknown): string {
  const detail = error instanceof Error ? error.message : String(error)
  return translate(
    'auto.components.terminal.pane.TerminalPane.imagePasteFailed',
    'Image paste failed: {detail}',
    { detail }
  )
}

export function createTerminalPanePasteActions({
  forceBracketedMultilineTextPaste,
  managerRef,
  paneTransportsRef,
  shortcutPlatform,
  tabId,
  worktreeId
}: TerminalPanePasteActionsInput): TerminalPanePasteActions {
  const isPaneMounted = (
    pane: ManagedPane,
    transport: PtyTransport | undefined,
    ptyId: string | null
  ): boolean =>
    isTerminalPanePasteTargetCurrent({
      manager: managerRef.current,
      paneTransports: paneTransportsRef.current,
      paneId: pane.id,
      leafId: pane.leafId,
      transport,
      ptyId
    })

  const executePasteText = async (
    pane: ManagedPane,
    source: EventPasteSource,
    activeElementAtDispatch: Element | null,
    text: string,
    options?: TerminalPasteTextOptions
  ): Promise<void> => {
    const connectionId = getConnectionId(worktreeId) ?? null
    const transport = paneTransportsRef.current.get(pane.id)
    const ptyId = transport?.getPtyId() ?? null
    const requiresFocusedPane =
      source === 'keyboard' || source === 'paste-event' || source === 'app-menu'
    const plan = await planTerminalPasteWithYield({
      text,
      source,
      target: {
        kind: 'terminal',
        paneId: pane.id,
        leafId: pane.leafId,
        ptyId,
        runtime: resolveTerminalPasteRuntime({
          platform: shortcutPlatform,
          ptyId,
          connectionId,
          transport,
          isWindowsConpty: forceBracketedMultilineTextPaste
        })
      },
      forceBracketedPaste: options?.forceBracketedPaste,
      forceBracketedPasteForMultiline: options?.forceBracketedPasteForMultiline,
      terminalBracketedPasteMode: pane.terminal.modes.bracketedPasteMode
    })
    const execution = await executeTerminalPastePlan(plan, {
      pasteText: (pasteText, pasteOptions) =>
        pasteTerminalText(pane.terminal, pasteText, pasteOptions),
      writePty: (data) => writeTerminalPastePtyInput(transport, data),
      isTargetCurrent: () =>
        isPaneMounted(pane, transport, ptyId) &&
        isTerminalPanePasteFocusCurrent({
          requireSameFocusedElement: requiresFocusedPane,
          activeElementAtDispatch,
          paneContainer: pane.container
        }),
      canContinue: () => isPaneMounted(pane, transport, ptyId)
    })
    if (execution.status !== 'pasted') {
      reportTerminalPaneError(formatTerminalPasteExecutionError(execution.reason), 'terminal-paste')
      return
    }
    if (text) {
      recordTerminalUserInputForLeaf(tabId, pane.leafId)
    }
    if (options?.recoverImagePasteWebglAtlas) {
      scheduleImagePasteWebglAtlasRecovery()
    }
  }

  return {
    pasteFromClipboard: ({
      activeElementAtDispatch,
      pane,
      readClipboardText = shellClient.ui.readClipboardText,
      source
    }) => {
      const connectionId = getConnectionId(worktreeId) ?? null
      const runtimeEnvironmentId = getRuntimeEnvironmentIdForWorktree(
        useAppStore.getState(),
        worktreeId
      )
      void pasteTerminalClipboard({
        readClipboardText,
        saveClipboardImageAsTempFile: shellClient.ui.saveClipboardImageAsTempFile,
        connectionId,
        runtimeEnvironmentId,
        forceBracketedMultilineTextPaste,
        pasteText: (text, options) =>
          executePasteText(pane, source, activeElementAtDispatch, text, options),
        onTextPasteError: () =>
          reportTerminalPaneError(
            translate(
              'auto.components.terminal.pane.TerminalPane.pasteTooLarge',
              'Paste failed: clipboard text is too large for a safe terminal paste.'
            ),
            'terminal-paste'
          ),
        onImagePasteError: (error) =>
          reportTerminalPaneError(formatClipboardImagePasteError(error), 'terminal-paste')
      }).catch(() => {
        reportTerminalPaneError(
          translate('auto.components.terminal.pane.TerminalPane.pasteFailed', 'Paste failed.'),
          'terminal-paste'
        )
      })
    }
  }
}
