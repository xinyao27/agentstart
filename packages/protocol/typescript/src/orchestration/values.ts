export type OrchestrationTaskStatusName =
  | 'pending'
  | 'ready'
  | 'dispatched'
  | 'completed'
  | 'failed'
  | 'blocked'

export type OrchestrationDispatchStatusName =
  | 'pending'
  | 'dispatched'
  | 'completed'
  | 'failed'
  | 'circuit_broken'

export type OrchestrationGateStatusName = 'pending' | 'resolved' | 'timeout'
export type OrchestrationQuestionStatusName = 'pending' | 'answered' | 'closed'

export type OrchestrationMessageTypeName =
  | 'status'
  | 'dispatch'
  | 'worker_done'
  | 'merge_ready'
  | 'escalation'
  | 'handoff'
  | 'decision_gate'
  | 'question'
  | 'heartbeat'

export type OrchestrationMessagePriorityName = 'normal' | 'high' | 'urgent'
export type OrchestrationResetScopeName = 'all' | 'tasks' | 'messages'

export type OrchestrationMutation = {
  requestId: string
  replayed: boolean
}

export type OrchestrationRun = {
  id: string
  objective: string
  homeDatabase: string
  coordinatorHandle: string | null
  coordinatorPaneKey: string | null
  consumerGeneration: number
  legacy: boolean
  createdAt: string
  updatedAt: string
}

export type OrchestrationRunBinding = {
  consumerGeneration: number
}

export type OrchestrationTask = {
  id: string
  runId: string
  parentId: string | null
  createdByTerminalHandle: string | null
  taskTitle: string | null
  displayName: string | null
  spec: string
  status: OrchestrationTaskStatusName
  deps: string[]
  result: string | null
  createdAt: string
  completedAt: string | null
  assigneeHandle: string | null
  dispatchId: string | null
  specTruncated: boolean
}

export type OrchestrationDispatch = {
  id: string
  runId: string
  taskId: string
  assigneeHandle: string | null
  assigneePaneKey: string | null
  capabilityHash: string | null
  processIncarnation: string | null
  capabilityRevokedAt: string | null
  status: OrchestrationDispatchStatusName
  failureCount: number
  lastFailure: string | null
  dispatchedAt: string | null
  completedAt: string | null
  createdAt: string
  lastHeartbeatAt: string | null
}

export type OrchestrationMessage = {
  id: string
  runId: string
  fromHandle: string
  toHandle: string
  subject: string
  body: string
  type: OrchestrationMessageTypeName
  priority: OrchestrationMessagePriorityName
  threadId: string | null
  // Why: an opaque caller/daemon-defined blob (heartbeat phase, worker_done outcome, ask
  // question/options, or a free-form --payload); never schema-validated by the daemon.
  payload: string | null
  read: boolean
  sequence: number
  createdAt: string
  deliveredAt: string | null
  senderPaneKey: string | null
}

export type OrchestrationQuestion = {
  messageId: string
  runId: string
  dispatchId: string
  askerHandle: string
  status: OrchestrationQuestionStatusName
  answerMessageId: string | null
  answerBody: string | null
  answeredByGeneration: number | null
  createdAt: string
  answeredAt: string | null
  closedAt: string | null
}

export type OrchestrationGate = {
  id: string
  runId: string
  taskId: string
  question: string
  options: string[]
  status: OrchestrationGateStatusName
  resolution: string | null
  createdAt: string
  resolvedAt: string | null
}

export type OrchestrationLifecycleResult =
  | { action: 'ignored' | 'suppressed' }
  | { action: 'rejected'; code: string; reason: string }
  | { action: 'completed' | 'failed'; taskId: string; dispatchId: string }
  | { action: 'heartbeat_recorded'; dispatchId: string }

export type OrchestrationRelayAcceptance = {
  messageId: string
  sequence: number
  dispatchId: string
  destination: 'run_home' | 'worker'
}
