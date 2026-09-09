import type { TuiAgent } from '@yiru/protocol/agent/types'
import type { GlobalSettings } from '@yiru/protocol/settings/global/model'
import { toast } from 'sonner'
import { translate } from '~renderer/i18n/i18n'

import type { StepId } from './use-onboarding-flow-types'

type SkippedOnboardingPreferenceOptions = {
  currentStepId: StepId
  themeBeforePreview: GlobalSettings['theme'] | null
  settingsTheme: GlobalSettings['theme'] | undefined
  selectedAgent: TuiAgent | null
  setTheme: (theme: GlobalSettings['theme']) => void
  applyTheme: (theme: GlobalSettings['theme']) => void
  updateSettings: (updates: Partial<GlobalSettings>) => Promise<void> | void
  setError: (message: string | null) => void
}

export async function prepareSkippedOnboardingPreferences({
  currentStepId,
  themeBeforePreview,
  settingsTheme,
  selectedAgent,
  setTheme,
  applyTheme,
  updateSettings,
  setError
}: SkippedOnboardingPreferenceOptions): Promise<boolean> {
  try {
    // Why: theme tiles save immediately for a stable preview, but skip still
    // means "do not keep this step's choice."
    if (currentStepId === 'theme') {
      const themeToRestore = themeBeforePreview ?? settingsTheme
      if (themeToRestore) {
        setTheme(themeToRestore)
        applyTheme(themeToRestore)
        await updateSettings({ theme: themeToRestore })
      }
    }
    // Why: the repo step seeds folder terminals from saved settings. Preserve
    // the visible agent choice when optional preferences are skipped.
    if (currentStepId === 'agent' && selectedAgent) {
      await updateSettings({ defaultTuiAgent: selectedAgent })
    }
    return true
  } catch (error) {
    const message = error instanceof Error ? error.message : String(error)
    setError(message)
    toast.error(
      translate(
        'auto.components.onboarding.use.onboarding.flow.52acfbef51',
        'Could not save progress'
      ),
      { description: message }
    )
    return false
  }
}
