import type {
  SkillFreshnessInventory as ProtocolSkillFreshnessInventory,
  SkillUpdateRun as ProtocolSkillUpdateRun
} from '@agentstart/protocol'

export type SkillFreshnessInventory = ProtocolSkillFreshnessInventory & { schemaVersion: 1 }
type FlattenRun<Run> = Run extends { subject: infer Subject; failure: infer Failure }
  ? Omit<Run, 'subject' | 'failure'> & Subject & Failure
  : Run extends { subject: infer Subject }
    ? Omit<Run, 'subject'> & Subject
    : Run
export type SkillUpdateRun = FlattenRun<ProtocolSkillUpdateRun>

// Why: the wire nests the operation subject inside each run state, while the
// renderer's freshness model flattens the same fields alongside the state.
export function flattenSkillUpdateRun(run: ProtocolSkillUpdateRun): SkillUpdateRun {
  switch (run.state) {
    case 'idle':
      return { state: 'idle' }
    case 'running':
      return {
        state: 'running',
        ...run.subject,
        startedAt: run.startedAt,
        output: run.output,
        ...(run.stopping === undefined ? {} : { stopping: run.stopping })
      }
    case 'success':
      return {
        state: 'success',
        ...run.subject,
        finishedAt: run.finishedAt,
        output: run.output
      }
    case 'error':
      return {
        state: 'error',
        ...run.subject,
        finishedAt: run.finishedAt,
        output: run.output,
        failedNames: run.failedNames,
        ...run.failure
      }
  }
}
