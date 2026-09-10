import { StatusCode } from '../../generated/agent_start/protocol/v1/errors_pb.js'
import {
  SkillDiscoverySkippedReason,
  SkillInstallationTopology as ProtocolTopology,
  SkillProvider as ProtocolProvider,
  SkillSourceKind as ProtocolSourceKind,
  type DiscoveredSkill as ProtocolDiscoveredSkill,
  type SkillDiscoverySource as ProtocolDiscoverySource,
  type SkillPlacement as ProtocolPlacement,
  type SkillsServiceDiscoverResponse
} from '../../generated/agent_start/runtime/v1/skills_pb.js'
import { RuntimeProtocolError } from '../error.js'

export type SkillProvider = 'codex' | 'claude' | 'agent-skills'

export type SkillSourceKind = 'home' | 'repo' | 'bundled' | 'plugin'

export type SkillInstallationTopology =
  | 'canonical-copy'
  | 'provider-alias'
  | 'independent-copy'
  | 'external-link'
  | 'broken-link'
  | 'read-only'
  | 'repo-scope'
  | 'plugin-cache'
  | 'unknown'

export type SkillPlacement = {
  id: string
  rootId: string
  rootPath: string
  rootLabel: string
  owner: string | null
  providers: SkillProvider[]
  sourceKind: SkillSourceKind
  sourceLabel: string
  directoryPath: string
  skillFilePath: string
  linkTargetPath: string | null
  topology: SkillInstallationTopology
  fileCount: number
  updatedAt: number | null
}

export type DiscoveredSkill = {
  id: string
  name: string
  folderName: string
  description: string | null
  providers: SkillProvider[]
  sourceKind: SkillSourceKind
  sourceLabel: string
  rootPath: string
  placements: SkillPlacement[]
  directoryPath: string
  skillFilePath: string
  installed: boolean
  fileCount: number
  updatedAt: number | null
  installSource: string | null
}

export type SkillDiscoverySource = {
  id: string
  label: string
  path: string
  sourceKind: SkillSourceKind
  providers: SkillProvider[]
  owner: string | null
  exists: boolean
  skippedReason?: 'missing'
}

export type SkillDiscoveryResult = {
  skills: DiscoveredSkill[]
  sources: SkillDiscoverySource[]
  scannedAt: number
}

export function decodeDiscovery(response: SkillsServiceDiscoverResponse): SkillDiscoveryResult {
  return {
    skills: response.skills.map(discoveredSkill),
    sources: response.sources.map(discoverySource),
    scannedAt: Number(response.scannedAt)
  }
}

function discoveredSkill(skill: ProtocolDiscoveredSkill): DiscoveredSkill {
  return {
    id: skill.id,
    name: skill.name,
    folderName: skill.folderName,
    description: skill.description ?? null,
    providers: skill.providers.map(provider),
    sourceKind: sourceKind(skill.sourceKind),
    sourceLabel: skill.sourceLabel,
    rootPath: skill.rootPath,
    placements: skill.placements.map(skillPlacement),
    directoryPath: skill.directoryPath,
    skillFilePath: skill.skillFilePath,
    installed: skill.installed,
    fileCount: skill.fileCount,
    updatedAt: optionalTimestamp(skill.updatedAt),
    installSource: skill.installSource ?? null
  }
}

function skillPlacement(placement: ProtocolPlacement): SkillPlacement {
  return {
    id: placement.id,
    rootId: placement.rootId,
    rootPath: placement.rootPath,
    rootLabel: placement.rootLabel,
    owner: placement.owner ?? null,
    providers: placement.providers.map(provider),
    sourceKind: sourceKind(placement.sourceKind),
    sourceLabel: placement.sourceLabel,
    directoryPath: placement.directoryPath,
    skillFilePath: placement.skillFilePath,
    linkTargetPath: placement.linkTargetPath ?? null,
    topology: topology(placement.topology),
    fileCount: placement.fileCount,
    updatedAt: optionalTimestamp(placement.updatedAt)
  }
}

function discoverySource(source: ProtocolDiscoverySource): SkillDiscoverySource {
  return {
    id: source.id,
    label: source.label,
    path: source.path,
    sourceKind: sourceKind(source.sourceKind),
    providers: source.providers.map(provider),
    owner: source.owner ?? null,
    exists: source.exists,
    ...(source.skippedReason === SkillDiscoverySkippedReason.MISSING
      ? { skippedReason: 'missing' as const }
      : {})
  }
}

export function provider(value: number): SkillProvider {
  switch (value) {
    case ProtocolProvider.CODEX:
      return 'codex'
    case ProtocolProvider.CLAUDE:
      return 'claude'
    case ProtocolProvider.AGENT_SKILLS:
      return 'agent-skills'
    case ProtocolProvider.UNSPECIFIED:
      throw invalidResponse('Skill provider is unspecified')
  }
  throw invalidResponse('Skill provider is unknown')
}

export function sourceKind(value: number): SkillSourceKind {
  switch (value) {
    case ProtocolSourceKind.HOME:
      return 'home'
    case ProtocolSourceKind.REPO:
      return 'repo'
    case ProtocolSourceKind.BUNDLED:
      return 'bundled'
    case ProtocolSourceKind.PLUGIN:
      return 'plugin'
    case ProtocolSourceKind.UNSPECIFIED:
      throw invalidResponse('Skill source kind is unspecified')
  }
  throw invalidResponse('Skill source kind is unknown')
}

export function topology(value: number): SkillInstallationTopology {
  switch (value) {
    case ProtocolTopology.CANONICAL_COPY:
      return 'canonical-copy'
    case ProtocolTopology.PROVIDER_ALIAS:
      return 'provider-alias'
    case ProtocolTopology.INDEPENDENT_COPY:
      return 'independent-copy'
    case ProtocolTopology.EXTERNAL_LINK:
      return 'external-link'
    case ProtocolTopology.BROKEN_LINK:
      return 'broken-link'
    case ProtocolTopology.READ_ONLY:
      return 'read-only'
    case ProtocolTopology.REPO_SCOPE:
      return 'repo-scope'
    case ProtocolTopology.PLUGIN_CACHE:
      return 'plugin-cache'
    case ProtocolTopology.UNKNOWN:
      return 'unknown'
    case ProtocolTopology.UNSPECIFIED:
      throw invalidResponse('Skill installation topology is unspecified')
  }
  throw invalidResponse('Skill installation topology is unknown')
}

export function optionalTimestamp(value: bigint | undefined): number | null {
  return value === undefined ? null : Number(value)
}

export function invalidResponse(message: string): RuntimeProtocolError {
  return new RuntimeProtocolError(StatusCode.DATA_LOSS, message)
}
