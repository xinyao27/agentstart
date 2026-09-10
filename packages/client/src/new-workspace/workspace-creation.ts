import { resolveHookCommandSourcePolicy } from '@agentstart/protocol/setup/command-source-policy'
import type { FolderWorkspaceLinkedReview } from '@agentstart/protocol/workspace/folder'
import type { AgentStartHooks } from '@agentstart/protocol/worktree/hooks'
import { sendFollowupPromptWhenAgentReady } from '~renderer/agent/followup-delivery'
import { showAgentPromptNotSentToast } from '~renderer/agent/prompt-timeout-toast'
import type { AgentStartupPlan } from '~renderer/agent/tui-startup'
import { createBrowserUuid } from '~renderer/browser/uuid'
import { slugifyForWorkspaceName } from '~renderer/new-workspace/naming/name'
import { useAppStore } from '~renderer/store/state'
import {
  getSettingsForAgentTabRuntimeOwner,
  pasteDraftToAgentPtyWhenReady
} from '~renderer/terminal-pane/agent/draft-delivery'

import {
  beginAgentStartupDeliveryAttempt,
  getAgentStartupTabPtyId,
  queuePendingAgentStartupDelivery,
  resolveAgentStartupTabId
} from '../terminal-pane/agent/startup-delayed-delivery'
export { PER_REPO_FETCH_LIMIT } from '~renderer/work-items'

export const CLIENT_PLATFORM: 'win32' | 'darwin' | 'linux' = navigator.userAgent.includes('Windows')
  ? 'win32'
  : navigator.userAgent.includes('Mac')
    ? 'darwin'
    : 'linux'

export type LinkedWorkItemSummary = Omit<FolderWorkspaceLinkedReview, 'provider'> & {
  provider?: FolderWorkspaceLinkedReview['provider']
}

export type SetupConfig = {
  source: 'yaml' | 'local' | 'both'
  command: string
  kind: 'setup' | 'default-tabs' | 'setup-and-default-tabs'
}

function getDefaultTabCommandPreview(yamlHooks: AgentStartHooks | null): string {
  return (yamlHooks?.defaultTabs ?? [])
    .map((tab, index) => {
      const command = tab.command?.trim()
      if (!command) {
        return null
      }
      const label = tab.title ? ` ${tab.title}` : ''
      return `# defaultTabs[${index + 1}]${label}\n${command}`
    })
    .filter((entry): entry is string => entry !== null)
    .join('\n\n')
}

function getSetupConfigKind(
  hasSetup: boolean,
  hasDefaultTabCommands: boolean
): SetupConfig['kind'] {
  if (hasSetup && hasDefaultTabCommands) {
    return 'setup-and-default-tabs'
  }
  if (hasDefaultTabCommands) {
    return 'default-tabs'
  }
  return 'setup'
}

export function buildAgentPromptWithContext(
  prompt: string,
  attachments: string[],
  linkedUrls: string[],
  linkedContextBlocks: string[] = []
): string {
  const trimmedPrompt = prompt.trim()
  const sections: string[] = []
  if (attachments.length > 0) {
    sections.push(`Attachments:\n${attachments.map((pathValue) => `- ${pathValue}`).join('\n')}`)
  }
  if (linkedUrls.length > 0) {
    sections.push(`Linked reviews:\n${linkedUrls.map((url) => `- ${url}`).join('\n')}`)
  }
  if (linkedContextBlocks.length > 0) {
    sections.push(linkedContextBlocks.join('\n\n'))
  }
  return [trimmedPrompt, ...sections].filter(Boolean).join('\n\n')
}

export function getAttachmentLabel(pathValue: string): string {
  return pathValue.split(/[/\\]/).at(-1) || pathValue
}

export function getSetupConfig(
  repo:
    | {
        hookSettings?: {
          commandSourcePolicy?: unknown
          scripts?: { setup?: string }
        }
      }
    | undefined,
  yamlHooks: AgentStartHooks | null
): SetupConfig | null {
  const yamlSetup = yamlHooks?.scripts?.setup?.trim()
  const yamlDefaultTabCommands = getDefaultTabCommandPreview(yamlHooks)
  const localSetup = repo?.hookSettings?.scripts?.setup?.trim()
  const sourcePolicy = resolveHookCommandSourcePolicy(repo?.hookSettings?.commandSourcePolicy, {
    hasLocalScript: Boolean(localSetup)
  })

  if (sourcePolicy === 'local-only') {
    return localSetup ? { source: 'local', command: localSetup, kind: 'setup' } : null
  }

  const yamlCommand = [yamlSetup, yamlDefaultTabCommands].filter(Boolean).join('\n\n')
  if (sourcePolicy === 'run-both' && yamlCommand && localSetup) {
    return {
      source: 'both',
      command: `${yamlCommand}\n\n${localSetup}`,
      kind: getSetupConfigKind(true, Boolean(yamlDefaultTabCommands))
    }
  }

  if (yamlCommand) {
    return {
      source: 'yaml',
      command: yamlCommand,
      kind: getSetupConfigKind(Boolean(yamlSetup), Boolean(yamlDefaultTabCommands))
    }
  }
  return null
}

export function getWorkspaceSeedName(args: {
  explicitName: string
  prompt: string
  linkedPR: number | null
  /** Why: when none of the other seed sources produce a name, the composer
   *  supplies a repo-scoped unique marine-creature name so blank submissions
   *  still get a distinct, readable workspace rather than a collision-prone
   *  "workspace" literal that git would append numeric suffixes to. */
  fallbackName?: string
}): string {
  const { explicitName, prompt, linkedPR, fallbackName } = args
  if (explicitName.trim()) {
    return explicitName.trim()
  }
  if (linkedPR !== null) {
    return `pr-${linkedPR}`
  }
  // Why: the prompt is free-form user text — it can easily exceed a sane
  // branch-name length or be composed entirely of characters that
  // sanitizeWorktreeName strips (emoji, CJK, punctuation). Slugify + truncate
  // here so the downstream branch/path sanitizer always has a usable seed,
  // and fall back to the stable default when the prompt collapses to empty.
  if (prompt.trim()) {
    const slug = slugifyForWorkspaceName(prompt)
    if (slug) {
      return slug
    }
  }
  if (fallbackName && fallbackName.trim()) {
    return fallbackName.trim()
  }
  // Why: the prompt is optional in this flow. Fall back to a stable default
  // branch/workspace seed so users can launch an empty draft without first
  // writing a brief or naming the workspace manually.
  return 'workspace'
}

export async function ensureAgentStartupInTerminal(args: {
  worktreeId: string
  primaryTabId?: string | null
  startup: AgentStartupPlan
}): Promise<void> {
  const { worktreeId, primaryTabId, startup } = args
  const draftPrompt = startup.draftPrompt ?? null
  if (startup.followupPrompt === null && draftPrompt === null) {
    return
  }
  const launchToken = ensureStartupLaunchToken(startup)

  // Why: poll until a terminal tab + PTY exists for the worktree before we
  // can interact with it. Activation creates the tab synchronously but the
  // PTY spawn is async, so a brief wait is normal.
  let tabId: string | null = null
  let ptyId: string | null = null
  for (let attempt = 0; attempt < 30; attempt += 1) {
    if (attempt > 0) {
      await new Promise((resolve) => globalThis.setTimeout(resolve, 150))
    }
    const state = useAppStore.getState()
    tabId = resolveAgentStartupTabId(state, worktreeId, primaryTabId)
    if (!tabId) {
      continue
    }
    ptyId = getAgentStartupTabPtyId(state, tabId, launchToken)
    if (ptyId) {
      break
    }
  }
  if (!tabId || !ptyId) {
    if (tabId) {
      // Why: background-created workspaces can remain unmounted longer than a
      // bounded readiness wait. Keep the draft/follow-up tied to the seeded
      // tab until opening the workspace creates its PTY.
      queuePendingAgentStartupDelivery({
        worktreeId,
        tabId,
        launchToken,
        startup,
        deliver: deliverAgentStartupToTerminal
      })
    }
    return
  }

  if (beginAgentStartupDeliveryAttempt({ worktreeId, tabId, launchToken })) {
    await deliverAgentStartupToTerminal(tabId, ptyId, startup)
  }
}

async function deliverAgentStartupToTerminal(
  tabId: string,
  ptyId: string,
  startup: AgentStartupPlan
): Promise<void> {
  const draftPrompt = startup.draftPrompt ?? null
  const runtimeSettings = getSettingsForAgentTabRuntimeOwner(tabId)
  // Why: followupPrompt is the legacy path for stdin-after-start agents
  // (aider, goose, etc.) that need their initial prompt typed into the live
  // session and submitted. Wait until the agent owns the PTY before writing.
  if (startup.followupPrompt) {
    const delivered = await sendFollowupPromptWhenAgentReady({
      ptyId,
      expectedProcess: startup.expectedProcess,
      prompt: startup.followupPrompt,
      settings: runtimeSettings
    })
    // Why: a dropped follow-up is otherwise silent — surface the same toast the
    // draft path uses so the user knows to open the workspace and paste it.
    if (!delivered) {
      showAgentPromptNotSentToast(startup.agent)
    }
  }

  // Why: draftPrompt uses bracketed-paste so the URL lands atomically in the
  // agent's input buffer (no per-char echo, no auto-submit). Shared with the
  // launch-work-item-direct flow so both behave identically.
  if (draftPrompt) {
    await pasteDraftToAgentPtyWhenReady({
      tabId,
      ptyId,
      content: draftPrompt,
      agent: startup.agent,
      // Why: startup.draftPrompt is only attached after native draft launch
      // planning is unavailable, so this paste is the first delivery attempt.
      forcePaste: true,
      // Why: surface a dropped draft instead of silently losing it.
      onTimeout: () => showAgentPromptNotSentToast(startup.agent)
    })
  }
}

function ensureStartupLaunchToken(startup: AgentStartupPlan): string {
  if (!startup.launchToken) {
    // Why: delayed delivery retries must reuse the startup plan's launch token
    // so they match the pane launch registration for this agent.
    startup.launchToken = createBrowserUuid()
  }
  return startup.launchToken
}
