import type { ShellHostTerminalCreate, ShellHostTerminalReveal } from '@yiru/protocol/shell-host'

import type { createTerminalTabViaShell } from '../terminal-create-shell-request'
import type { revealTerminalSessionViaShell } from '../terminal-reveal-shell-request'
import { delivery, launchAgent, optionalChoice, splitSource } from './command-values'

export function decodeTerminalCreate(
  input: ShellHostTerminalCreate
): Parameters<typeof createTerminalTabViaShell>[0] {
  return {
    worktreeId: input.worktreeId,
    afterTabId: input.afterTabId,
    targetGroupId: input.targetGroupId,
    command: input.command,
    cwd: input.cwd,
    env: input.env,
    envToDelete: input.envToDelete,
    launchConfig: input.launchConfig,
    launchToken: input.launchToken,
    launchAgent: launchAgent(input.launchAgent),
    startupCommandDelivery: delivery(input.startupCommandDelivery),
    title: input.title,
    activate: input.activate,
    presentation: optionalChoice(input.presentation, ['background', 'visible', 'focused']),
    source: optionalChoice(input.source, ['runtime-session'])
  }
}

export function decodeTerminalReveal(
  input: ShellHostTerminalReveal
): Parameters<typeof revealTerminalSessionViaShell>[0] {
  return {
    worktreeId: input.worktreeId,
    ptyId: input.ptyId,
    durablePtyId: input.durablePtyId,
    title: input.title,
    cwd: input.cwd,
    launchConfig: input.launchConfig,
    launchToken: input.launchToken,
    launchAgent: launchAgent(input.launchAgent),
    activate: input.activate,
    presentation: optionalChoice(input.presentation, ['background', 'visible', 'focused']),
    tabId: input.tabId,
    leafId: input.leafId,
    splitFromLeafId: input.splitFromLeafId,
    splitDirection: optionalChoice(input.splitDirection, ['horizontal', 'vertical']),
    splitTelemetrySource: splitSource(input.splitTelemetrySource),
    source: optionalChoice(input.source, ['runtime-session'])
  }
}
