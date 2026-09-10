import type { RuntimeHandlerRegistry } from '@agentstart/protocol'
import {
  ShellHostService,
  createShellHostResponse,
  decodeShellHostResume,
  type ShellHostRequest,
  type ShellHostResponse
} from '@agentstart/protocol/shell-host'
import { buildWorkspaceSessionPayload } from '~renderer/editor/workspace-session'
import { persistWorkspaceSessionByHost } from '~renderer/editor/workspace-session-host-persistence'
import { translate } from '~renderer/i18n/i18n'
import { handleRateLimitResumeDispatchRequest } from '~renderer/rate-limit-resume/use-rate-limit-resume-dispatch'
import { useAppStore } from '~renderer/store/state'
import { closeTerminalTab } from '~renderer/terminal/tab-actions'

import { readMobileMarkdownTab, saveMobileMarkdownTab } from '../mobile-markdown-bridge'
import { shellClient } from '../shell-client'
import { shellSessionApi } from '../shell-state-client'
import { createTerminalTabViaShell } from '../terminal-create-shell-request'
import { mountTerminalTabViaShell } from '../terminal-mount-shell-request'
import { revealTerminalSessionViaShell } from '../terminal-reveal-shell-request'
import { handleShellServicesUICommand } from '../ui-command-shell-request'
import { optionalChoice } from './command-values'
import { decodeTerminalCreate, decodeTerminalReveal } from './terminal-command'
import { decodeUiCommand } from './ui-command'

export function installShellHostHandlers(registry: RuntimeHandlerRegistry): () => void {
  return registry.registerUnary(ShellHostService.method.execute, execute)
}

async function execute(request: ShellHostRequest): Promise<ShellHostResponse> {
  const command = request.command
  switch (command.case) {
    case 'ui':
      return createShellHostResponse({
        result: {
          case: 'accepted',
          value: await handleShellServicesUICommand(decodeUiCommand(command.value))
        }
      })
    case 'terminalCreate':
      return createShellHostResponse({
        result: {
          case: 'terminalCreated',
          value: createTerminalTabViaShell(decodeTerminalCreate(command.value))
        }
      })
    case 'terminalReveal': {
      const result = revealTerminalSessionViaShell(decodeTerminalReveal(command.value))
      return createShellHostResponse({
        result: {
          case: 'terminalRevealed',
          value: { tabId: result.tabId, title: result.title ?? undefined }
        }
      })
    }
    case 'terminalMount':
      return createShellHostResponse({
        result: { case: 'accepted', value: await mountTerminalTabViaShell(command.value) }
      })
    case 'terminalClose':
      await closeTab(command.value.tabId)
      return createShellHostResponse({
        result: { case: 'terminalClosed', value: { closed: true } }
      })
    case 'markdownRead':
      return createShellHostResponse({
        result: {
          case: 'markdownContent',
          value: await readMobileMarkdownTab(command.value.worktreeId, command.value.tabId)
        }
      })
    case 'markdownSave':
      return createShellHostResponse({
        result: {
          case: 'markdownSaved',
          value: await saveMobileMarkdownTab(
            command.value.worktreeId,
            command.value.tabId,
            command.value.baseVersion,
            command.value.content
          )
        }
      })
    case 'resume':
      // Why: dispatch acknowledges immediately; completion uses the schedule service separately.
      void handleRateLimitResumeDispatchRequest(decodeShellHostResume(command.value))
      return createShellHostResponse({ result: { case: 'accepted', value: { accepted: true } } })
    case 'notificationDisplay':
      return createShellHostResponse({
        result: {
          case: 'notificationDisplayed',
          value: await shellClient.notifications.displayNative({
            ...command.value,
            source: optionalChoice(command.value.source, [
              'agent-task-complete',
              'terminal-bell',
              'test'
            ])
          })
        }
      })
    case 'notificationDismiss':
      return createShellHostResponse({
        result: {
          case: 'notificationDismissed',
          value: await shellClient.notifications.dismissNative(command.value.notificationIds)
        }
      })
    case undefined:
      throw new Error(translate('runtime.shellHost.missingCommand', 'Shell command is missing'))
  }
}

function closeTab(tabId: string): Promise<void> {
  return new Promise((resolve, reject) => {
    let responded = false
    const respond = (error?: string): void => {
      if (responded) {
        return
      }
      responded = true
      if (error) {
        reject(new Error(error))
      } else {
        resolve()
      }
    }
    closeTerminalTab(tabId, {
      rejectPinned: true,
      onCancel: () =>
        respond(
          translate('runtime.shellHost.pinnedTerminal', 'Pinned terminal tab could not be closed')
        ),
      onClosed: () => {
        // Why: the daemon must not acknowledge a close before the workspace save completes.
        void (async () => {
          const state = useAppStore.getState()
          await persistWorkspaceSessionByHost(
            shellSessionApi,
            buildWorkspaceSessionPayload(state),
            state
          )
          respond()
        })().catch((error: unknown) =>
          respond(
            error instanceof Error
              ? error.message
              : translate(
                  'runtime.shellHost.closeTerminalFailed',
                  'Terminal tab could not be closed'
                )
          )
        )
      }
    })
  })
}
