import { resolveAgentPermissionModeSummary } from '@yiru/protocol/agent/launch/permissions'
import type { TuiAgent } from '@yiru/protocol/agent/types'
import type { GlobalSettings } from '@yiru/protocol/settings/global/model'
import { useEffect, useRef, useState } from 'react'
import { getAgentCatalog } from '~renderer/agent/catalog'
import { applyDocumentTheme } from '~renderer/editor/document-theme'
import { useAppStore } from '~renderer/store/state'
import { track } from '~renderer/telemetry/client'

import { buildAgentPickedPayload } from './agent-picked-payload'
import { resolveOnboardingSettingsHydration } from './settings-hydration'
import type { StepId } from './use-onboarding-flow-types'

export function useOnboardingPreferences(currentStepId: StepId) {
  const settings = useAppStore((state) => state.settings)
  const updateSettings = useAppStore((state) => state.updateSettings)
  const refreshDetectedAgents = useAppStore((state) => state.refreshDetectedAgents)
  const detectedAgentIds = useAppStore((state) => state.detectedAgentIds)
  const isDetectingAgents = useAppStore(
    (state) => state.isDetectingAgents || state.isRefreshingAgents
  )
  const pathSource = useAppStore((state) => state.pathSource)
  const pathFailureReason = useAppStore((state) => state.pathFailureReason)
  const [selectedAgent, setSelectedAgent] = useState<TuiAgent | null>(
    settings?.defaultTuiAgent && settings.defaultTuiAgent !== 'blank'
      ? settings.defaultTuiAgent
      : null
  )
  const [yoloPermissions, setYoloPermissions] = useState(
    resolveAgentPermissionModeSummary({
      agentDefaultArgs: settings?.agentDefaultArgs,
      agentDefaultEnv: settings?.agentDefaultEnv
    }) !== 'manual'
  )
  const [theme, setTheme] = useState<GlobalSettings['theme']>(settings?.theme ?? 'dark')
  const [themeInteracted, setThemeInteracted] = useState(false)
  const [agentInteracted, setAgentInteracted] = useState(false)
  const [yoloPermissionsInteracted, setYoloPermissionsInteracted] = useState(false)
  const [settingsHydrated, setSettingsHydrated] = useState(settings != null)
  const settingsHydration = resolveOnboardingSettingsHydration({
    settings,
    settingsHydrated,
    themeInteracted,
    agentInteracted,
    currentTheme: theme,
    currentAgent: selectedAgent
  })

  if (settingsHydration) {
    setSettingsHydrated(settingsHydration.settingsHydrated)
    if (settingsHydration.theme !== undefined) {
      setTheme(settingsHydration.theme)
    }
    if (settingsHydration.selectedAgent !== undefined) {
      setSelectedAgent(settingsHydration.selectedAgent)
    }
  }
  if (settings && !yoloPermissionsInteracted) {
    const nextYoloPermissions =
      resolveAgentPermissionModeSummary({
        agentDefaultArgs: settings.agentDefaultArgs,
        agentDefaultEnv: settings.agentDefaultEnv
      }) !== 'manual'
    if (nextYoloPermissions !== yoloPermissions) {
      setYoloPermissions(nextYoloPermissions)
    }
  }

  const setSelectedAgentInteractive = (value: TuiAgent | null, fromCollapsedSection = false) => {
    setAgentInteracted(true)
    const previousAgent = selectedAgent
    setSelectedAgent(value)
    if (value === null || value === previousAgent) {
      return
    }
    track(
      'onboarding_agent_picked',
      buildAgentPickedPayload({
        agent: value,
        detectedAgentIds: detectedAgentIds ?? [],
        isDetecting: isDetectingAgents,
        fromCollapsedSection,
        pathSource,
        pathFailureReason
      })
    )
  }
  const setThemeInteractive = (value: GlobalSettings['theme']) => {
    setThemeInteracted(true)
    setTheme(value)
  }
  const setYoloPermissionsInteractive = (enabled: boolean) => {
    setYoloPermissionsInteracted(true)
    setYoloPermissions(enabled)
  }

  const themeStepEntryThemeRef = useRef<GlobalSettings['theme'] | null>(null)
  const themeStepEntryCapturedRef = useRef(false)
  useEffect(() => {
    if (currentStepId !== 'theme') {
      themeStepEntryCapturedRef.current = false
      return
    }
    if (!settings || themeStepEntryCapturedRef.current) {
      return
    }
    // Why: skipping project setup restores the preference present on entry,
    // while normal theme selection remains an immediately persisted preview.
    themeStepEntryCapturedRef.current = true
    themeStepEntryThemeRef.current = settings.theme
  }, [currentStepId, settings])

  useEffect(() => {
    applyDocumentTheme(theme)
  }, [theme])

  const didAutoSelectRef = useRef(false)
  useEffect(() => {
    if (didAutoSelectRef.current) {
      return
    }
    didAutoSelectRef.current = true
    // Why: the session cache may predate shell PATH hydration, so onboarding
    // re-runs detection before choosing a default agent.
    void refreshDetectedAgents().then((ids) => {
      if (selectedAgent !== null) {
        return
      }
      const preferred = getAgentCatalog().find((agent) => ids.includes(agent.id))?.id ?? null
      setSelectedAgent(preferred)
    })
  }, [refreshDetectedAgents, selectedAgent])

  return {
    settings,
    updateSettings,
    selectedAgent,
    setSelectedAgent: setSelectedAgentInteractive,
    yoloPermissions,
    setYoloPermissions: setYoloPermissionsInteractive,
    theme,
    setTheme: setThemeInteractive,
    detectedSet: new Set(detectedAgentIds ?? []),
    isDetectingAgents,
    getThemeBeforePreview: () => themeStepEntryThemeRef.current
  }
}
