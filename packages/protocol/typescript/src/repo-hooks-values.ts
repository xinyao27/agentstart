import { StatusCode } from '../generated/agent_start/protocol/v1/errors_pb.js'
import {
  RepoHooksCheckStatus,
  RepoHooksSource,
  type RepoServiceHooksCheckResponse,
  type RepoServiceHooksResponse,
  type RepoServiceSetupScriptImportsResponse,
  RepoSetupRunPolicy,
  type RepoAgentStartHooks
} from '../generated/agent_start/runtime/v1/repo_pb.js'
import { RuntimeProtocolError } from './error.js'
import type {
  RepoHooksCheckResult,
  RepoHooksValue,
  RepoSetupImportCandidateValue,
  RepoAgentStartHooksValue
} from './repo-types.js'

export function repoHooks(value: RepoServiceHooksResponse): RepoHooksValue {
  return {
    hasHooksFile: value.hasHooksFile,
    hooks: value.hooks ? agentstartHooks(value.hooks) : null,
    setupRunPolicy: runPolicy(value.setupRunPolicy),
    source: hooksSource(value.source),
    ...(value.setupTrust
      ? {
          setupTrust: {
            contentHash: value.setupTrust.contentHash,
            scriptContent: value.setupTrust.scriptContent
          }
        }
      : {})
  }
}

export function repoHooksCheck(value: RepoServiceHooksCheckResponse): RepoHooksCheckResult {
  return {
    status: value.status === RepoHooksCheckStatus.OK ? 'ok' : 'error',
    hasHooks: value.hasHooks,
    hooks: value.hooks ? agentstartHooks(value.hooks) : null,
    mayNeedUpdate: value.mayNeedUpdate
  }
}

export function setupScriptImports(
  value: RepoServiceSetupScriptImportsResponse
): RepoSetupImportCandidateValue[] {
  return value.candidates.map((candidate) => ({
    provider: candidate.provider,
    label: candidate.label,
    files: [...candidate.files],
    setup: candidate.setup,
    ...(candidate.archive === undefined ? {} : { archive: candidate.archive }),
    ...(candidate.unsupportedFields.length === 0
      ? {}
      : { unsupportedFields: [...candidate.unsupportedFields] })
  }))
}

function agentstartHooks(value: RepoAgentStartHooks): RepoAgentStartHooksValue {
  return {
    scripts: {
      ...(value.scripts?.setup === undefined ? {} : { setup: value.scripts.setup }),
      ...(value.scripts?.archive === undefined ? {} : { archive: value.scripts.archive })
    },
    ...(value.defaultTabs.length === 0
      ? {}
      : {
          defaultTabs: value.defaultTabs.map((tab) => ({
            ...(tab.title === undefined ? {} : { title: tab.title }),
            ...(tab.color === undefined ? {} : { color: tab.color }),
            ...(tab.command === undefined ? {} : { command: tab.command })
          }))
        }),
    ...(value.worktree
      ? { worktree: { sharedDirectories: [...value.worktree.sharedDirectories] } }
      : {})
  }
}

function runPolicy(value: RepoSetupRunPolicy): RepoHooksValue['setupRunPolicy'] {
  switch (value) {
    case RepoSetupRunPolicy.ASK:
      return 'ask'
    case RepoSetupRunPolicy.RUN_BY_DEFAULT:
      return 'run-by-default'
    case RepoSetupRunPolicy.SKIP_BY_DEFAULT:
      return 'skip-by-default'
    case RepoSetupRunPolicy.UNSPECIFIED:
      throw invalidResponse('Repository setup run policy is missing')
  }
  throw invalidResponse('Repository setup run policy is unknown')
}

function hooksSource(value: RepoHooksSource): RepoHooksValue['source'] {
  switch (value) {
    case RepoHooksSource.AGENT_START_YAML:
      return 'agentstart.yaml'
    case RepoHooksSource.LEGACY:
      return 'legacy'
    case RepoHooksSource.UNSPECIFIED:
      return null
  }
  throw invalidResponse('Repository hooks source is unknown')
}

function invalidResponse(message: string): RuntimeProtocolError {
  return new RuntimeProtocolError(StatusCode.DATA_LOSS, message)
}
