export type OnboardingOutcome = 'completed' | 'dismissed'

export type OnboardingChecklistState = {
  addedRepo: boolean
  choseAgent: boolean
  ranFirstAgent: boolean
  ranSecondAgentOnSameTask: boolean
  triedCmdJ: boolean
  shapedSidebar: boolean
  reviewedDiff: boolean
  openedPr: boolean
  addedFolder: boolean
  openedFile: boolean
  ranAgentOnFile: boolean
  // Why: UI state flag (panel visibility), not an activation event. The
  // telemetry checklist enum in protocol/telemetry/events/catalog.ts intentionally omits this.
  dismissed: boolean
}

export type OnboardingState = {
  // Why: numeric step meanings can change when pages are removed; persisted
  // state needs a version marker so migration does not re-run on new progress.
  flowVersion: number
  closedAt: number | null
  outcome: OnboardingOutcome | null
  // Sentinel `-1` = not started; `1..5` = highest wizard step the user
  // finished. Kept as `number` (not a literal union) because callers clamp
  // via `Math.max`/`Math.min` against arbitrary numerics.
  lastCompletedStep: number
  checklist: OnboardingChecklistState
}

export const ONBOARDING_FINAL_STEP = 5

export const ONBOARDING_FLOW_VERSION = 4

export function getDefaultOnboardingState(): OnboardingState {
  return {
    flowVersion: ONBOARDING_FLOW_VERSION,
    closedAt: null,
    outcome: null,
    lastCompletedStep: -1,
    checklist: {
      addedRepo: false,
      choseAgent: false,
      ranFirstAgent: false,
      ranSecondAgentOnSameTask: false,
      triedCmdJ: false,
      shapedSidebar: false,
      reviewedDiff: false,
      openedPr: false,
      addedFolder: false,
      openedFile: false,
      ranAgentOnFile: false,
      dismissed: false
    } satisfies OnboardingChecklistState
  }
}
