import {
  OrchestrationLifecycleAction,
  OrchestrationRelayDestination,
  type OrchestrationDispatch as ProtocolDispatch,
  type OrchestrationGate as ProtocolGate,
  type OrchestrationLifecycleResult as ProtocolLifecycleResult,
  type OrchestrationMessage as ProtocolMessage,
  type OrchestrationMutation as ProtocolMutation,
  type OrchestrationQuestion as ProtocolQuestion,
  type OrchestrationRelayAcceptance as ProtocolRelayAcceptance,
  type OrchestrationRun as ProtocolRun,
  type OrchestrationRunBinding as ProtocolRunBinding,
  type OrchestrationTask as ProtocolTask
} from '../../generated/agent_start/runtime/v1/orchestration_pb.js'
import {
  dispatchStatusName,
  gateStatusName,
  invalidResponse,
  messagePriorityName,
  messageTypeName,
  questionStatusName,
  taskStatusName
} from './enum-values.js'
import type {
  OrchestrationDispatch,
  OrchestrationGate,
  OrchestrationLifecycleResult,
  OrchestrationMessage,
  OrchestrationMutation,
  OrchestrationQuestion,
  OrchestrationRelayAcceptance,
  OrchestrationRunBinding,
  OrchestrationRun,
  OrchestrationTask
} from './values.js'

export function orchestrationRun(value: ProtocolRun | undefined): OrchestrationRun {
  if (!value) {
    throw invalidResponse('Orchestration run is missing')
  }
  return {
    id: value.id,
    objective: value.objective,
    homeDatabase: value.homeDatabase,
    coordinatorHandle: value.coordinatorHandle ?? null,
    coordinatorPaneKey: value.coordinatorPaneKey ?? null,
    consumerGeneration: Number(value.consumerGeneration),
    legacy: value.legacy,
    createdAt: value.createdAt,
    updatedAt: value.updatedAt
  }
}

export function orchestrationRunBinding(
  value: ProtocolRunBinding | undefined
): OrchestrationRunBinding {
  if (!value) {
    throw invalidResponse('Orchestration run binding is missing')
  }
  return { consumerGeneration: Number(value.consumerGeneration) }
}

export function orchestrationTask(value: ProtocolTask | undefined): OrchestrationTask {
  if (!value) {
    throw invalidResponse('Orchestration task is missing')
  }
  return {
    id: value.id,
    runId: value.runId,
    parentId: value.parentId ?? null,
    createdByTerminalHandle: value.createdByTerminalHandle ?? null,
    taskTitle: value.taskTitle ?? null,
    displayName: value.displayName ?? null,
    spec: value.spec,
    status: taskStatusName(value.status),
    deps: value.deps,
    result: value.result ?? null,
    createdAt: value.createdAt,
    completedAt: value.completedAt ?? null,
    assigneeHandle: value.assigneeHandle ?? null,
    dispatchId: value.dispatchId ?? null,
    specTruncated: value.specTruncated
  }
}

export function orchestrationDispatch(
  value: ProtocolDispatch | undefined | null
): OrchestrationDispatch {
  if (!value) {
    throw invalidResponse('Orchestration dispatch is missing')
  }
  return {
    id: value.id,
    runId: value.runId,
    taskId: value.taskId,
    assigneeHandle: value.assigneeHandle ?? null,
    assigneePaneKey: value.assigneePaneKey ?? null,
    capabilityHash: value.capabilityHash ?? null,
    processIncarnation: value.processIncarnation ?? null,
    capabilityRevokedAt: value.capabilityRevokedAt ?? null,
    status: dispatchStatusName(value.status),
    failureCount: Number(value.failureCount),
    lastFailure: value.lastFailure ?? null,
    dispatchedAt: value.dispatchedAt ?? null,
    completedAt: value.completedAt ?? null,
    createdAt: value.createdAt,
    lastHeartbeatAt: value.lastHeartbeatAt ?? null
  }
}

export function orchestrationMessage(value: ProtocolMessage | undefined): OrchestrationMessage {
  if (!value) {
    throw invalidResponse('Orchestration message is missing')
  }
  return {
    id: value.id,
    runId: value.runId,
    fromHandle: value.fromHandle,
    toHandle: value.toHandle,
    subject: value.subject,
    body: value.body,
    type: messageTypeName(value.type),
    priority: messagePriorityName(value.priority),
    threadId: value.threadId ?? null,
    payload: value.payload ?? null,
    read: value.read,
    sequence: Number(value.sequence),
    createdAt: value.createdAt,
    deliveredAt: value.deliveredAt ?? null,
    senderPaneKey: value.senderPaneKey ?? null
  }
}

export function orchestrationQuestion(value: ProtocolQuestion | undefined): OrchestrationQuestion {
  if (!value) {
    throw invalidResponse('Orchestration question is missing')
  }
  return {
    messageId: value.messageId,
    runId: value.runId,
    dispatchId: value.dispatchId,
    askerHandle: value.askerHandle,
    status: questionStatusName(value.status),
    answerMessageId: value.answerMessageId ?? null,
    answerBody: value.answerBody ?? null,
    answeredByGeneration:
      value.answeredByGeneration === undefined ? null : Number(value.answeredByGeneration),
    createdAt: value.createdAt,
    answeredAt: value.answeredAt ?? null,
    closedAt: value.closedAt ?? null
  }
}

export function orchestrationGate(value: ProtocolGate | undefined): OrchestrationGate {
  if (!value) {
    throw invalidResponse('Orchestration gate is missing')
  }
  return {
    id: value.id,
    runId: value.runId,
    taskId: value.taskId,
    question: value.question,
    options: value.options,
    status: gateStatusName(value.status),
    resolution: value.resolution ?? null,
    createdAt: value.createdAt,
    resolvedAt: value.resolvedAt ?? null
  }
}

export function orchestrationMutation(
  value: ProtocolMutation | undefined
): OrchestrationMutation | undefined {
  if (!value) {
    return undefined
  }
  return { requestId: value.requestId, replayed: value.replayed }
}

export function orchestrationLifecycleResult(
  value: ProtocolLifecycleResult | undefined
): OrchestrationLifecycleResult | undefined {
  if (!value) {
    return undefined
  }
  switch (value.action) {
    case OrchestrationLifecycleAction.IGNORED:
      return { action: 'ignored' }
    case OrchestrationLifecycleAction.SUPPRESSED:
      return { action: 'suppressed' }
    case OrchestrationLifecycleAction.REJECTED:
      return {
        action: 'rejected',
        code: value.code ?? '',
        reason: value.reason ?? ''
      }
    case OrchestrationLifecycleAction.COMPLETED:
      return { action: 'completed', taskId: value.taskId ?? '', dispatchId: value.dispatchId ?? '' }
    case OrchestrationLifecycleAction.FAILED:
      return { action: 'failed', taskId: value.taskId ?? '', dispatchId: value.dispatchId ?? '' }
    case OrchestrationLifecycleAction.HEARTBEAT_RECORDED:
      return { action: 'heartbeat_recorded', dispatchId: value.dispatchId ?? '' }
    case OrchestrationLifecycleAction.UNSPECIFIED:
      throw invalidResponse('Lifecycle action is unspecified')
  }
  throw invalidResponse('Lifecycle action is unknown')
}

export function orchestrationRelayAcceptance(
  value: ProtocolRelayAcceptance | undefined
): OrchestrationRelayAcceptance {
  if (!value) {
    throw invalidResponse('Orchestration relay acceptance is missing')
  }
  const destination =
    value.destination === OrchestrationRelayDestination.WORKER ? 'worker' : 'run_home'
  return {
    messageId: value.messageId,
    sequence: Number(value.sequence),
    dispatchId: value.dispatchId,
    destination
  }
}
