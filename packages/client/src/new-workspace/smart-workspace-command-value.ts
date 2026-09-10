type SmartWorkspaceCommandRowKind = 'use-name' | 'create-branch' | 'github' | 'branch'

export type SmartWorkspaceCommandRow = {
  kind: SmartWorkspaceCommandRowKind
  value: string
}

export type SmartWorkspaceSourceIntent = 'github' | null

export function resolveSmartWorkspaceCommandValue({
  currentValue,
  rows,
  isQueryStale,
  sourceIntent
}: {
  currentValue: string
  rows: readonly SmartWorkspaceCommandRow[]
  isQueryStale: boolean
  sourceIntent: SmartWorkspaceSourceIntent
}): string {
  if (rows.length === 0) {
    return currentValue
  }

  if (isQueryStale) {
    const typedTextRow = rows.find((row) => row.kind === 'use-name' || row.kind === 'create-branch')
    return typedTextRow?.value ?? ''
  }

  if (sourceIntent === 'github') {
    const githubRow = rows.find((row) => row.kind === 'github')
    if (githubRow) {
      return githubRow.value
    }
  }

  return rows.some((row) => row.value === currentValue) ? currentValue : rows[0].value
}
