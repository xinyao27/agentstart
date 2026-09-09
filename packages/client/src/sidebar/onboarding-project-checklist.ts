import type { OnboardingState } from '@yiru/protocol/settings/onboarding'
import { shellClient } from '~renderer/runtime/shell-client'
import { track } from '~renderer/telemetry/client'

export type OnboardingProjectChecklistItem = 'addedRepo' | 'addedFolder'

export async function markOnboardingProjectAdded(
  item: OnboardingProjectChecklistItem
): Promise<void> {
  if (typeof window === 'undefined') {
    return
  }
  const onboarding = await shellClient.onboarding.get().catch(() => null)
  if (!onboarding || onboarding.checklist[item]) {
    return
  }

  const checklist: Partial<OnboardingState['checklist']> = {}
  checklist[item] = true
  try {
    await shellClient.onboarding.update({ checklist })
  } catch (err) {
    console.warn('[onboarding] Failed to update project checklist item:', err)
    return
  }

  track('activation_checklist_item_completed', {
    item,
    time_since_completed_ms: 0
  })
}
