import type { SleepingAgentLaunchConfig } from '@yiru/protocol/agent/session-resume'
import { AI_VAULT_AGENTS, type AiVaultAgent } from '@yiru/protocol/ai-vault/providers'
import { normalizeExecutionHostId, type ExecutionHostId } from '@yiru/protocol/host/identity'
import { measureUtf8ByteLength } from '@yiru/protocol/text/utf8-length'

export const AI_VAULT_SESSION_DRAG_TYPE = 'application/x-yiru-ai-vault-session'
export const AI_VAULT_SESSION_DRAG_START_EVENT = 'yiru-ai-vault-session-drag-start'
export const AI_VAULT_SESSION_DRAG_END_EVENT = 'yiru-ai-vault-session-drag-end'
export const AI_VAULT_SESSION_DRAG_PAYLOAD_MAX_BYTES = 16 * 1024

export type AiVaultSessionDragPayload = {
  agent: AiVaultAgent
  sessionId: string
  title: string
  command: string
  // Why: drop targets must know where the session file lives (host vs local
  // WSL) to reject SSH panes that cannot reach it.
  sessionFilePath?: string
  sessionExecutionHostId?: ExecutionHostId
  // Why: drag/drop resume must preserve planned env mutations/default args, not just the command.
  env?: Record<string, string>
  envToDelete?: string[]
  launchConfig?: SleepingAgentLaunchConfig
}

let activeAiVaultSessionDragPayload: AiVaultSessionDragPayload | null = null

type SerializedAiVaultSessionDragPayload = AiVaultSessionDragPayload & {
  kind: 'ai-vault-session'
  version: 1
}

function isAiVaultAgent(value: unknown): value is AiVaultAgent {
  return typeof value === 'string' && (AI_VAULT_AGENTS as readonly string[]).includes(value)
}

function isNonEmptyString(value: unknown): value is string {
  return typeof value === 'string' && value.trim().length > 0
}

function isStringRecord(value: unknown): value is Record<string, string> {
  if (!value || typeof value !== 'object' || Array.isArray(value)) {
    return false
  }
  return Object.values(value).every((entry) => typeof entry === 'string')
}

function isEnvDeletionList(value: unknown): value is string[] {
  return (
    Array.isArray(value) &&
    value.length <= 32 &&
    value.every((entry) => typeof entry === 'string' && entry.length > 0 && entry.length <= 256)
  )
}

function isLaunchConfig(value: unknown): value is SleepingAgentLaunchConfig {
  if (!value || typeof value !== 'object') {
    return false
  }
  const config = value as Partial<SleepingAgentLaunchConfig>
  return (
    (config.agentCommand === undefined || typeof config.agentCommand === 'string') &&
    (config.ompResumeFilePath === undefined || isNonEmptyString(config.ompResumeFilePath)) &&
    typeof config.agentArgs === 'string' &&
    isStringRecord(config.agentEnv)
  )
}

function isSerializedPayload(value: unknown): value is SerializedAiVaultSessionDragPayload {
  if (!value || typeof value !== 'object') {
    return false
  }
  const payload = value as Partial<SerializedAiVaultSessionDragPayload>
  return (
    payload.kind === 'ai-vault-session' &&
    payload.version === 1 &&
    isAiVaultAgent(payload.agent) &&
    isNonEmptyString(payload.sessionId) &&
    isNonEmptyString(payload.title) &&
    isNonEmptyString(payload.command) &&
    (payload.sessionFilePath === undefined || isNonEmptyString(payload.sessionFilePath)) &&
    (payload.sessionExecutionHostId === undefined ||
      Boolean(normalizeExecutionHostId(payload.sessionExecutionHostId))) &&
    (payload.env === undefined || isStringRecord(payload.env)) &&
    (payload.envToDelete === undefined || isEnvDeletionList(payload.envToDelete)) &&
    (payload.launchConfig === undefined || isLaunchConfig(payload.launchConfig))
  )
}

export function writeAiVaultSessionDragData(
  dataTransfer: DataTransfer,
  payload: AiVaultSessionDragPayload
): void {
  const serialized = JSON.stringify({ kind: 'ai-vault-session', version: 1, ...payload })
  if (isAiVaultSessionDragPayloadTooLarge(serialized)) {
    activeAiVaultSessionDragPayload = null
    dataTransfer.effectAllowed = 'copy'
    dataTransfer.setData(AI_VAULT_SESSION_DRAG_TYPE, '')
    return
  }
  activeAiVaultSessionDragPayload = { ...payload }
  dataTransfer.effectAllowed = 'copy'
  // Why: avoid text/plain so terminal/native drop targets cannot paste the
  // resume command instead of letting Yiru's pane drop layer handle it.
  dataTransfer.setData(AI_VAULT_SESSION_DRAG_TYPE, serialized)
}

export function hasAiVaultSessionDragData(dataTransfer: DataTransfer): boolean {
  return Array.from(dataTransfer.types).includes(AI_VAULT_SESSION_DRAG_TYPE)
}

export function clearAiVaultSessionDragData(): void {
  activeAiVaultSessionDragPayload = null
}

export function readAiVaultSessionDragData(
  dataTransfer: DataTransfer
): AiVaultSessionDragPayload | null {
  const raw = dataTransfer.getData(AI_VAULT_SESSION_DRAG_TYPE)
  if (!raw) {
    return hasAiVaultSessionDragData(dataTransfer) ? activeAiVaultSessionDragPayload : null
  }
  if (isAiVaultSessionDragPayloadTooLarge(raw)) {
    return null
  }

  try {
    const parsed: unknown = JSON.parse(raw)
    if (!isSerializedPayload(parsed)) {
      return null
    }
    const {
      agent,
      sessionId,
      title,
      command,
      sessionFilePath,
      sessionExecutionHostId,
      env,
      envToDelete,
      launchConfig
    } = parsed
    return {
      agent,
      sessionId,
      title,
      command,
      ...(sessionFilePath ? { sessionFilePath } : {}),
      ...(sessionExecutionHostId ? { sessionExecutionHostId } : {}),
      ...(env ? { env } : {}),
      ...(envToDelete ? { envToDelete } : {}),
      ...(launchConfig ? { launchConfig } : {})
    }
  } catch {
    return null
  }
}

function isAiVaultSessionDragPayloadTooLarge(raw: string): boolean {
  return (
    raw.length > AI_VAULT_SESSION_DRAG_PAYLOAD_MAX_BYTES ||
    measureUtf8ByteLength(raw, {
      stopAfterBytes: AI_VAULT_SESSION_DRAG_PAYLOAD_MAX_BYTES
    }).exceededLimit
  )
}
