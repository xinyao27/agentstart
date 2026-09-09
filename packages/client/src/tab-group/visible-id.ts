import type { Tab } from '@yiru/protocol/workspace/tabs'

export function resolveGroupTabFromVisibleId(
  groupTabs: readonly Tab[],
  visibleId: string
): Tab | null {
  return (
    groupTabs.find((candidate) => candidate.id === visibleId || candidate.entityId === visibleId) ??
    null
  )
}
