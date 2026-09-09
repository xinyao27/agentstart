import { StatusCode } from '../../generated/yiru/protocol/v1/errors_pb.js'
import {
  OrchestrationDispatchStatus,
  OrchestrationGateStatus,
  OrchestrationMessagePriority,
  OrchestrationMessageType,
  OrchestrationQuestionStatus,
  OrchestrationResetScope,
  OrchestrationTaskStatus
} from '../../generated/yiru/runtime/v1/orchestration_pb.js'
import { RuntimeProtocolError } from '../error.js'
import type {
  OrchestrationDispatchStatusName,
  OrchestrationGateStatusName,
  OrchestrationMessagePriorityName,
  OrchestrationMessageTypeName,
  OrchestrationQuestionStatusName,
  OrchestrationResetScopeName,
  OrchestrationTaskStatusName
} from './values.js'

export function taskStatusName(value: OrchestrationTaskStatus): OrchestrationTaskStatusName {
  switch (value) {
    case OrchestrationTaskStatus.PENDING:
      return 'pending'
    case OrchestrationTaskStatus.READY:
      return 'ready'
    case OrchestrationTaskStatus.DISPATCHED:
      return 'dispatched'
    case OrchestrationTaskStatus.COMPLETED:
      return 'completed'
    case OrchestrationTaskStatus.FAILED:
      return 'failed'
    case OrchestrationTaskStatus.BLOCKED:
      return 'blocked'
    case OrchestrationTaskStatus.UNSPECIFIED:
      throw invalidResponse('Task status is unspecified')
  }
  throw invalidResponse('Task status is unknown')
}

export function taskStatusValue(value: OrchestrationTaskStatusName): OrchestrationTaskStatus {
  switch (value) {
    case 'pending':
      return OrchestrationTaskStatus.PENDING
    case 'ready':
      return OrchestrationTaskStatus.READY
    case 'dispatched':
      return OrchestrationTaskStatus.DISPATCHED
    case 'completed':
      return OrchestrationTaskStatus.COMPLETED
    case 'failed':
      return OrchestrationTaskStatus.FAILED
    case 'blocked':
      return OrchestrationTaskStatus.BLOCKED
  }
}

export function dispatchStatusName(
  value: OrchestrationDispatchStatus
): OrchestrationDispatchStatusName {
  switch (value) {
    case OrchestrationDispatchStatus.PENDING:
      return 'pending'
    case OrchestrationDispatchStatus.DISPATCHED:
      return 'dispatched'
    case OrchestrationDispatchStatus.COMPLETED:
      return 'completed'
    case OrchestrationDispatchStatus.FAILED:
      return 'failed'
    case OrchestrationDispatchStatus.CIRCUIT_BROKEN:
      return 'circuit_broken'
    case OrchestrationDispatchStatus.UNSPECIFIED:
      throw invalidResponse('Dispatch status is unspecified')
  }
  throw invalidResponse('Dispatch status is unknown')
}

export function gateStatusName(value: OrchestrationGateStatus): OrchestrationGateStatusName {
  switch (value) {
    case OrchestrationGateStatus.PENDING:
      return 'pending'
    case OrchestrationGateStatus.RESOLVED:
      return 'resolved'
    case OrchestrationGateStatus.TIMEOUT:
      return 'timeout'
    case OrchestrationGateStatus.UNSPECIFIED:
      throw invalidResponse('Gate status is unspecified')
  }
  throw invalidResponse('Gate status is unknown')
}

export function gateStatusValue(
  value: OrchestrationGateStatusName | undefined
): OrchestrationGateStatus | undefined {
  switch (value) {
    case 'pending':
      return OrchestrationGateStatus.PENDING
    case 'resolved':
      return OrchestrationGateStatus.RESOLVED
    case 'timeout':
      return OrchestrationGateStatus.TIMEOUT
    case undefined:
      return undefined
  }
}

export function questionStatusName(
  value: OrchestrationQuestionStatus
): OrchestrationQuestionStatusName {
  switch (value) {
    case OrchestrationQuestionStatus.PENDING:
      return 'pending'
    case OrchestrationQuestionStatus.ANSWERED:
      return 'answered'
    case OrchestrationQuestionStatus.CLOSED:
      return 'closed'
    case OrchestrationQuestionStatus.UNSPECIFIED:
      throw invalidResponse('Question status is unspecified')
  }
  throw invalidResponse('Question status is unknown')
}

export function messageTypeName(value: OrchestrationMessageType): OrchestrationMessageTypeName {
  switch (value) {
    case OrchestrationMessageType.STATUS:
      return 'status'
    case OrchestrationMessageType.DISPATCH:
      return 'dispatch'
    case OrchestrationMessageType.WORKER_DONE:
      return 'worker_done'
    case OrchestrationMessageType.MERGE_READY:
      return 'merge_ready'
    case OrchestrationMessageType.ESCALATION:
      return 'escalation'
    case OrchestrationMessageType.HANDOFF:
      return 'handoff'
    case OrchestrationMessageType.DECISION_GATE:
      return 'decision_gate'
    case OrchestrationMessageType.QUESTION:
      return 'question'
    case OrchestrationMessageType.HEARTBEAT:
      return 'heartbeat'
    case OrchestrationMessageType.UNSPECIFIED:
      throw invalidResponse('Message type is unspecified')
  }
  throw invalidResponse('Message type is unknown')
}

export function messageTypeValue(
  value: OrchestrationMessageTypeName | undefined
): OrchestrationMessageType | undefined {
  if (value === undefined) {
    return undefined
  }
  const found = Object.entries(MESSAGE_TYPE_BY_NAME).find(([name]) => name === value)
  return found?.[1]
}

const MESSAGE_TYPE_BY_NAME: Record<OrchestrationMessageTypeName, OrchestrationMessageType> = {
  status: OrchestrationMessageType.STATUS,
  dispatch: OrchestrationMessageType.DISPATCH,
  worker_done: OrchestrationMessageType.WORKER_DONE,
  merge_ready: OrchestrationMessageType.MERGE_READY,
  escalation: OrchestrationMessageType.ESCALATION,
  handoff: OrchestrationMessageType.HANDOFF,
  decision_gate: OrchestrationMessageType.DECISION_GATE,
  question: OrchestrationMessageType.QUESTION,
  heartbeat: OrchestrationMessageType.HEARTBEAT
}

export function messagePriorityName(
  value: OrchestrationMessagePriority
): OrchestrationMessagePriorityName {
  switch (value) {
    case OrchestrationMessagePriority.NORMAL:
      return 'normal'
    case OrchestrationMessagePriority.HIGH:
      return 'high'
    case OrchestrationMessagePriority.URGENT:
      return 'urgent'
    case OrchestrationMessagePriority.UNSPECIFIED:
      throw invalidResponse('Message priority is unspecified')
  }
  throw invalidResponse('Message priority is unknown')
}

export function messagePriorityValue(
  value: OrchestrationMessagePriorityName | undefined
): OrchestrationMessagePriority | undefined {
  switch (value) {
    case 'normal':
      return OrchestrationMessagePriority.NORMAL
    case 'high':
      return OrchestrationMessagePriority.HIGH
    case 'urgent':
      return OrchestrationMessagePriority.URGENT
    case undefined:
      return undefined
  }
}

export function resetScopeValue(value: OrchestrationResetScopeName): OrchestrationResetScope {
  switch (value) {
    case 'all':
      return OrchestrationResetScope.ALL
    case 'tasks':
      return OrchestrationResetScope.TASKS
    case 'messages':
      return OrchestrationResetScope.MESSAGES
  }
}

export function resetScopeName(value: OrchestrationResetScope): OrchestrationResetScopeName {
  switch (value) {
    case OrchestrationResetScope.ALL:
      return 'all'
    case OrchestrationResetScope.TASKS:
      return 'tasks'
    case OrchestrationResetScope.MESSAGES:
      return 'messages'
    case OrchestrationResetScope.UNSPECIFIED:
      throw invalidResponse('Reset scope is unspecified')
  }
  throw invalidResponse('Reset scope is unknown')
}

export function invalidResponse(message: string): RuntimeProtocolError {
  return new RuntimeProtocolError(StatusCode.DATA_LOSS, message)
}
