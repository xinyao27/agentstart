import { planMobileTerminalTabMount } from '~renderer/application-shell/mobile-terminal-tab-mount'
import { useAppStore } from '~renderer/store/state'
import { requestBackgroundTerminalWorktreeMount } from '~renderer/terminal/background-terminal-worktree-mount'

import type { TerminalMountRequest, TerminalMountResult } from './shell-host/terminal-request'
import { hasRegisteredRuntimeTerminalTab } from './sync-runtime-graph'

export function mountTerminalTabViaShell(input: TerminalMountRequest): TerminalMountResult {
  const mount = planMobileTerminalTabMount(useAppStore.getState(), input, {
    isTabMounted: hasRegisteredRuntimeTerminalTab
  })
  if (!mount) {
    return { accepted: false }
  }
  requestBackgroundTerminalWorktreeMount(mount)
  return { accepted: true }
}
