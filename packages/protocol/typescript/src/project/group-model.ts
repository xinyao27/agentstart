import type {
  NestedRepoCandidateValue,
  NestedRepoScanResultValue
} from '../project-group-scan-values.js'
import type {
  ProjectGroupValue,
  ProjectGroupCreatedFromValue,
  ProjectGroupImportModeValue,
  ProjectGroupImportProjectResultValue,
  ProjectGroupImportResultValue
} from '../project-group-values.js'

export type ProjectGroup = ProjectGroupValue & { executionHostId?: string | null }
export type ProjectGroupCreatedFrom = ProjectGroupCreatedFromValue
export type ProjectGroupImportMode = ProjectGroupImportModeValue
export type ProjectGroupImportProjectResult = ProjectGroupImportProjectResultValue
export type ProjectGroupImportResult = Omit<ProjectGroupImportResultValue, 'group'> & {
  group?: ProjectGroup
}
export type NestedRepoCandidate = NestedRepoCandidateValue
export type NestedRepoScanResult = NestedRepoScanResultValue
export type NestedRepoScanOptions = {
  maxDepth?: number
  maxRepos?: number
  timeoutMs?: number | null
}
