import type { GitPullRequestFields as ProtocolPullRequestFields } from '../../generated/yiru/runtime/v1/git_generation_pb.js'

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

export function generateCommitMessageResultFromProto(response: {
  success: boolean
  message?: string
  agentLabel?: string
  error?: string
  canceled?: boolean
}): RuntimeGenerateCommitMessageResult {
  if (response.success) {
    return {
      success: true,
      message: response.message ?? '',
      ...(response.agentLabel ? { agentLabel: response.agentLabel } : {})
    }
  }
  return {
    success: false,
    error: response.error ?? 'Commit message generation failed.',
    ...(response.canceled !== undefined ? { canceled: response.canceled } : {})
  }
}

export function generatePullRequestFieldsResultFromProto(response: {
  success: boolean
  fields?: ProtocolPullRequestFields
  agentLabel?: string
  branchChangedByPreparation: boolean
  error?: string
  canceled?: boolean
}): RuntimeGeneratePullRequestFieldsResult {
  if (response.success && response.fields) {
    return {
      success: true,
      fields: {
        base: response.fields.base,
        title: response.fields.title,
        body: response.fields.body,
        draft: response.fields.draft
      },
      ...(response.agentLabel ? { agentLabel: response.agentLabel } : {}),
      branchChangedByPreparation: response.branchChangedByPreparation
    }
  }
  return {
    success: false,
    error: response.error ?? 'Pull request field generation failed.',
    ...(response.canceled !== undefined ? { canceled: response.canceled } : {}),
    branchChangedByPreparation: response.branchChangedByPreparation
  }
}
