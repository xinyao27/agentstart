import type { GlobalAgentSettings } from './agents.js'
import type { GlobalExperimentalSettings } from './experimental.js'
import type { GlobalTerminalSettings } from './terminal.js'
import type { GlobalWorkbenchSettings } from './workbench.js'
import type { GlobalWorkspaceSettings } from './workspace.js'

export type GlobalSettings = GlobalWorkspaceSettings &
  GlobalTerminalSettings &
  GlobalWorkbenchSettings &
  GlobalAgentSettings &
  GlobalExperimentalSettings
