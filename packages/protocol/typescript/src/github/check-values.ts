import {
  GitHubCheckConclusion,
  GitHubCheckRunStatus,
  type GitHubCheckAnnotation,
  type GitHubCheckDetails as ProtocolCheckDetails,
  type GitHubCheckEntry,
  type GitHubCheckJob,
  type GitHubCheckJobStep
} from '../../generated/agent_start/runtime/v1/github_pb.js'

export type PRCheckDetail = {
  name: string
  status: 'queued' | 'in_progress' | 'completed'
  conclusion:
    | 'success'
    | 'failure'
    | 'cancelled'
    | 'timed_out'
    | 'neutral'
    | 'skipped'
    | 'pending'
    | 'action_required'
    | null
  url: string | null
  checkRunId?: number
  workflowRunId?: number
}

type PRCheckAnnotation = {
  path: string | null
  startLine: number | null
  endLine: number | null
  annotationLevel: string | null
  title: string | null
  message: string
  rawDetails: string | null
}

type PRCheckStep = {
  name: string
  status: string | null
  conclusion: string | null
  startedAt: string | null
  completedAt: string | null
}

type PRCheckJob = {
  id: number | null
  name: string
  status: string | null
  conclusion: string | null
  startedAt: string | null
  completedAt: string | null
  url: string | null
  logTail: string | null
  steps: PRCheckStep[]
}

export type PRCheckRunDetails = {
  name: string
  status: string | null
  conclusion: string | null
  url: string | null
  detailsUrl: string | null
  startedAt: string | null
  completedAt: string | null
  title: string | null
  summary: string | null
  text: string | null
  annotations: PRCheckAnnotation[]
  jobs: PRCheckJob[]
}

export type GitHubRerunPRChecksResult = { ok: true; count: number } | { ok: false; error: string }

function checkRunStatus(value: GitHubCheckRunStatus): PRCheckDetail['status'] {
  switch (value) {
    case GitHubCheckRunStatus.QUEUED:
      return 'queued'
    case GitHubCheckRunStatus.COMPLETED:
      return 'completed'
    default:
      return 'in_progress'
  }
}

function checkConclusion(value: GitHubCheckConclusion): PRCheckDetail['conclusion'] {
  switch (value) {
    case GitHubCheckConclusion.SUCCESS:
      return 'success'
    case GitHubCheckConclusion.FAILURE:
      return 'failure'
    case GitHubCheckConclusion.CANCELLED:
      return 'cancelled'
    case GitHubCheckConclusion.SKIPPED:
      return 'skipped'
    case GitHubCheckConclusion.NEUTRAL:
      return 'neutral'
    case GitHubCheckConclusion.TIMED_OUT:
      return 'timed_out'
    case GitHubCheckConclusion.ACTION_REQUIRED:
      return 'action_required'
    default:
      return 'pending'
  }
}

export function githubCheckEntry(entry: GitHubCheckEntry): PRCheckDetail {
  return {
    name: entry.name,
    status: checkRunStatus(entry.status),
    conclusion: checkConclusion(entry.conclusion),
    url: entry.url ?? null,
    ...(entry.checkRunId !== undefined ? { checkRunId: Number(entry.checkRunId) } : {}),
    ...(entry.workflowRunId !== undefined ? { workflowRunId: Number(entry.workflowRunId) } : {})
  }
}

function annotation(value: GitHubCheckAnnotation): PRCheckAnnotation {
  return {
    path: value.path ?? null,
    startLine: value.startLine !== undefined ? Number(value.startLine) : null,
    endLine: value.endLine !== undefined ? Number(value.endLine) : null,
    annotationLevel: value.annotationLevel ?? null,
    title: value.title ?? null,
    message: value.message,
    rawDetails: value.rawDetails ?? null
  }
}

function checkJobStep(value: GitHubCheckJobStep): PRCheckStep {
  return {
    name: value.name,
    status: value.status ?? null,
    conclusion: value.conclusion ?? null,
    startedAt: value.startedAt ?? null,
    completedAt: value.completedAt ?? null
  }
}

function checkJob(value: GitHubCheckJob): PRCheckJob {
  return {
    id: value.id !== undefined ? Number(value.id) : null,
    name: value.name,
    status: value.status ?? null,
    conclusion: value.conclusion ?? null,
    startedAt: value.startedAt ?? null,
    completedAt: value.completedAt ?? null,
    url: value.url ?? null,
    logTail: value.logTail ?? null,
    steps: value.steps.map(checkJobStep)
  }
}

export function githubCheckDetails(
  details: ProtocolCheckDetails | undefined
): PRCheckRunDetails | null {
  if (!details) {
    return null
  }
  return {
    name: details.name,
    status: details.status ?? null,
    conclusion: details.conclusion ?? null,
    url: details.url ?? null,
    detailsUrl: details.detailsUrl ?? null,
    startedAt: details.startedAt ?? null,
    completedAt: details.completedAt ?? null,
    title: details.title ?? null,
    summary: details.summary ?? null,
    text: details.text ?? null,
    annotations: details.annotations.map(annotation),
    jobs: details.jobs.map(checkJob)
  }
}
