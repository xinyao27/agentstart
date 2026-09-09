import type { GitGenerationOverridesInput } from '@yiru/protocol'
import type { HostedReviewProvider } from '@yiru/protocol/hosted-review/types'
import type { GlobalSettings } from '@yiru/protocol/settings/global/model'
import { getCommitMessageModelDiscoveryHostKeyForScope } from '@yiru/protocol/source-control/discovery-host'
import type { ResolvedSourceControlAiGenerationParams } from '@yiru/protocol/source-control/resolution'

import { openRuntimeGitClient } from './client'
import {
  getRuntimeGitScope,
  getRuntimeGitWorktree,
  type RuntimeGitContext,
  type RuntimeGitSettings
} from './context'

export type RuntimeGenerateCommitMessageResult =
  | { success: true; message: string; agentLabel?: string }
  | { success: false; error: string; canceled?: boolean }

export type RuntimeGeneratePullRequestFieldsResult =
  | {
      success: true
      fields: { base: string; title: string; body: string; draft: boolean }
      agentLabel?: string
      branchChangedByPreparation?: boolean
    }
  | { success: false; error: string; canceled?: boolean; branchChangedByPreparation?: boolean }

export type RuntimePullRequestGenerationInput = {
  base: string
  title: string
  body: string
  draft: boolean
  provider?: HostedReviewProvider
  useTemplate?: boolean
}

export type RuntimeGenerateCommitMessageOverrides = {
  sourceControlAiResolvedParams?: ResolvedSourceControlAiGenerationParams
  sourceControlAi?: GlobalSettings['sourceControlAi']
  agentCmdOverrides?: GlobalSettings['agentCmdOverrides']
}

export type RuntimeGeneratePullRequestFieldsOverrides = RuntimeGenerateCommitMessageOverrides

// Why: repoId and enableGitHubAttribution were validated by the legacy input
// contract but GitAuthority::resolve_generation_params never reads them (see
// input/generation.rs's parse_overrides) — they stay dropped from the wire.
function generationOverrides(
  settings: RuntimeGitSettings | null | undefined,
  connectionId: string | undefined,
  overrides: RuntimeGenerateCommitMessageOverrides | undefined
): GitGenerationOverridesInput {
  if (!settings) {
    return {
      ...(overrides?.sourceControlAiResolvedParams
        ? { resolvedParams: overrides.sourceControlAiResolvedParams }
        : {}),
      ...(overrides?.sourceControlAi ? { sourceControlAi: overrides.sourceControlAi } : {}),
      ...(overrides?.agentCmdOverrides ? { agentCommands: overrides.agentCmdOverrides } : {})
    }
  }
  const scope = getRuntimeGitScope(settings, connectionId)
  return {
    ...(overrides?.agentCmdOverrides
      ? { agentCommands: overrides.agentCmdOverrides }
      : settings.agentCmdOverrides
        ? { agentCommands: settings.agentCmdOverrides }
        : {}),
    discoveryHostKey: getCommitMessageModelDiscoveryHostKeyForScope(scope),
    ...(overrides?.sourceControlAi
      ? { sourceControlAi: overrides.sourceControlAi }
      : settings.sourceControlAi
        ? { sourceControlAi: settings.sourceControlAi }
        : {}),
    ...(overrides?.sourceControlAiResolvedParams
      ? { resolvedParams: overrides.sourceControlAiResolvedParams }
      : {}),
    ...(settings.commitMessageAi ? { commitMessageAi: settings.commitMessageAi } : {})
  }
}

export async function generateRuntimeCommitMessage(
  context: RuntimeGitContext,
  overrides?: RuntimeGenerateCommitMessageOverrides
): Promise<RuntimeGenerateCommitMessageResult> {
  const client = await openRuntimeGitClient(context)
  return client.generateCommitMessage(
    {
      worktree: getRuntimeGitWorktree(context),
      overrides: generationOverrides(context.settings, context.connectionId, overrides)
    },
    { timeoutMs: 75_000 }
  )
}

export async function cancelRuntimeGenerateCommitMessage(
  context: RuntimeGitContext
): Promise<void> {
  const client = await openRuntimeGitClient(context)
  await client.cancelGenerateCommitMessage(
    { worktree: getRuntimeGitWorktree(context) },
    { timeoutMs: 5_000 }
  )
}

export async function generateRuntimePullRequestFields(
  context: RuntimeGitContext,
  input: RuntimePullRequestGenerationInput,
  overrides?: RuntimeGeneratePullRequestFieldsOverrides
): Promise<RuntimeGeneratePullRequestFieldsResult> {
  const client = await openRuntimeGitClient(context)
  return client.generatePullRequestFields(
    {
      worktree: getRuntimeGitWorktree(context),
      base: input.base,
      title: input.title,
      body: input.body,
      draft: input.draft,
      ...(input.useTemplate === undefined ? {} : { useTemplate: input.useTemplate }),
      overrides: generationOverrides(context.settings, context.connectionId, overrides)
    },
    { timeoutMs: 75_000 }
  )
}

export async function cancelRuntimeGeneratePullRequestFields(
  context: RuntimeGitContext
): Promise<void> {
  const client = await openRuntimeGitClient(context)
  await client.cancelGeneratePullRequestFields(
    { worktree: getRuntimeGitWorktree(context) },
    { timeoutMs: 5_000 }
  )
}
