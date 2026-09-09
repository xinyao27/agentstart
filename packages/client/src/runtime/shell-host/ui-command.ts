import type {
  ShellHostUiCommand,
  ShellHostStartupLaunch,
  ShellHostLaunchTelemetry
} from '@yiru/protocol/shell-host'
import { translate } from '~renderer/i18n/i18n'

import type { handleShellServicesUICommand } from '../ui-command-shell-request'
import { choice, delivery, launchAgent, splitSource } from './command-values'

type Command = Parameters<typeof handleShellServicesUICommand>[0]
type Startup = NonNullable<Extract<Command, { type: 'activateWorktree' }>['startup']>

export function decodeUiCommand(input: ShellHostUiCommand): Command {
  const command = input.command
  switch (command.case) {
    case 'activateWorktree':
      return {
        type: 'activateWorktree',
        repoId: command.value.repoId,
        worktreeId: command.value.worktreeId,
        setup: command.value.setup,
        startup: command.value.startup ? decodeStartup(command.value.startup) : undefined,
        defaultTabs: command.value.defaultTabs
      }
    case 'splitTerminal':
      return {
        type: 'splitTerminal',
        ...command.value,
        direction: choice(command.value.direction, ['horizontal', 'vertical']),
        telemetrySource: splitSource(command.value.telemetrySource)
      }
    case 'renameTerminal':
      return {
        type: 'renameTerminal',
        tabId: command.value.tabId,
        title: command.value.title ?? null
      }
    case 'focusTerminal':
      return { type: 'focusTerminal', ...command.value }
    case 'focusEditorTab':
      return { type: 'focusEditorTab', ...command.value }
    case 'closeSessionTab':
      return { type: 'closeSessionTab', ...command.value }
    case 'moveSessionTab': {
      const value = command.value
      const target = {
        type: 'moveSessionTab',
        tabId: value.tabId,
        worktreeId: value.worktreeId,
        targetGroupId: value.targetGroupId
      } satisfies Pick<
        Extract<Command, { type: 'moveSessionTab' }>,
        'type' | 'tabId' | 'worktreeId' | 'targetGroupId'
      >
      switch (value.move.case) {
        case 'reorder':
          return { ...target, kind: 'reorder', tabOrder: value.move.value.tabOrder }
        case 'moveToGroup':
          return { ...target, kind: 'move-to-group', index: value.move.value.index }
        case 'split':
          return {
            ...target,
            kind: 'split',
            splitDirection: choice(value.move.value.direction, ['left', 'right', 'up', 'down'])
          }
        case undefined:
          throw new Error(
            translate('runtime.shellHost.missingTabMove', 'Tab move command is missing')
          )
      }
    }
    case 'openFile':
      return { type: 'openFile', ...command.value }
    case 'openDiff':
      return { type: 'openDiff', ...command.value }
    case 'closeTerminal':
      return { type: 'closeTerminal', ...command.value }
    case 'sleepWorktree':
      return { type: 'sleepWorktree', ...command.value }
    case 'resumeSleepingAgents':
      return { type: 'resumeSleepingAgents', ...command.value }
    case undefined:
      throw new Error(translate('runtime.shellHost.missingUiCommand', 'Window command is missing'))
  }
}

function decodeStartup(value: ShellHostStartupLaunch): Startup {
  return {
    command: value.command,
    env: value.env,
    launchConfig: value.launchConfig,
    launchToken: value.launchToken,
    launchAgent: launchAgent(value.launchAgent),
    startupCommandDelivery: delivery(value.startupCommandDelivery),
    telemetry: value.telemetry ? decodeTelemetry(value.telemetry) : undefined
  }
}

function decodeTelemetry(value: ShellHostLaunchTelemetry): NonNullable<Startup['telemetry']> {
  const agent =
    value.agentKind === 'claude-code' || value.agentKind === 'other'
      ? value.agentKind
      : launchAgent(value.agentKind)
  if (!agent || agent === 'claude') {
    throw new Error(
      translate('runtime.shellHost.invalidTelemetryAgent', 'Invalid launch telemetry agent')
    )
  }
  return {
    agent_kind: agent,
    launch_source: choice(value.launchSource, [
      'command_palette',
      'sidebar',
      'quick_command',
      'tab_bar_quick_launch',
      'task_page',
      'new_workspace_composer',
      'workspace_jump_palette',
      'shortcut',
      'onboarding',
      'diff_notes_send',
      'notes_send',
      'conflict_resolution',
      'source_control_recovery',
      'terminal_context_menu',
      'unknown'
    ]),
    request_kind: choice(value.requestKind, ['new', 'resume', 'followup'])
  }
}
