import type { ContributionDisplayMetric } from './metric'

const CONTRIBUTION_METRIC_STORAGE_KEY = 'agentstart:contribution-metric:v1'

export function loadContributionMetric(): ContributionDisplayMetric {
  try {
    const metric = window.localStorage.getItem(CONTRIBUTION_METRIC_STORAGE_KEY)
    return metric === 'value' ? metric : 'tokens'
  } catch {
    return 'tokens'
  }
}

export function saveContributionMetric(metric: ContributionDisplayMetric): void {
  try {
    window.localStorage.setItem(CONTRIBUTION_METRIC_STORAGE_KEY, metric)
  } catch {
    // Why: storage can be disabled while the in-memory selection remains usable.
  }
}
