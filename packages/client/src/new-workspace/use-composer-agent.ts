import { filterEnabledTuiAgents, isTuiAgentEnabled } from '@agentstart/protocol/agent/selection'
import type { TuiAgent } from '@agentstart/protocol/agent/types'
import type { GlobalSettings } from '@agentstart/protocol/settings/global/model'
import { useEffect, useState } from 'react'
import { getAgentCatalog } from '~renderer/agent/catalog'
import { useAppStore } from '~renderer/store/state'

const EMPTY_DISABLED_AGENTS: TuiAgent[] = []

type UseComposerAgentOptions = {
  initialAgent: TuiAgent | null
  runtimeEnvironmentId: string | null
  settings: GlobalSettings | null
}

export function useComposerAgent(options: UseComposerAgentOptions) {
  const disabledAgents = options.settings?.disabledTuiAgents ?? EMPTY_DISABLED_AGENTS
  const enabledCatalogAgents = filterEnabledTuiAgents(
    getAgentCatalog().map((agent) => agent.id),
    disabledAgents
  )
  const fallbackAgent: TuiAgent =
    options.settings?.defaultTuiAgent &&
    options.settings.defaultTuiAgent !== 'blank' &&
    isTuiAgentEnabled(options.settings.defaultTuiAgent, disabledAgents)
      ? options.settings.defaultTuiAgent
      : (enabledCatalogAgents[0] ?? 'claude')
  const [agent, setAgent] = useState<TuiAgent>(options.initialAgent ?? fallbackAgent)
  const detectedAgentList = useAppStore((state) => {
    if (options.runtimeEnvironmentId) {
      return state.runtimeDetectedAgentIds[options.runtimeEnvironmentId] ?? null
    }
    return state.detectedAgentIds
  })
  const ensureDetectedAgents = useAppStore((state) => state.ensureDetectedAgents)
  const ensureRuntimeDetectedAgents = useAppStore((state) => state.ensureRuntimeDetectedAgents)

  useEffect(() => {
    let isCancelled = false
    const detection = options.runtimeEnvironmentId
      ? ensureRuntimeDetectedAgents(options.runtimeEnvironmentId)
      : ensureDetectedAgents()
    void detection.then((ids) => {
      if (isCancelled) {
        return
      }
      const enabledIds = filterEnabledTuiAgents(ids, disabledAgents)
      if (!options.initialAgent && !options.settings?.defaultTuiAgent && enabledIds.length > 0) {
        const firstInCatalogOrder = getAgentCatalog().find((item) => enabledIds.includes(item.id))
        if (firstInCatalogOrder) {
          setAgent(firstInCatalogOrder.id)
        }
      } else if (!isTuiAgentEnabled(agent, disabledAgents)) {
        const firstEnabledDetected = getAgentCatalog().find((item) => enabledIds.includes(item.id))
        setAgent(firstEnabledDetected?.id ?? fallbackAgent)
      }
    })
    return () => {
      isCancelled = true
    }
  }, [
    agent,
    disabledAgents,
    ensureDetectedAgents,
    ensureRuntimeDetectedAgents,
    fallbackAgent,
    options.initialAgent,
    options.runtimeEnvironmentId,
    options.settings?.defaultTuiAgent
  ])

  return {
    agent,
    detectedAgentIds: detectedAgentList ? new Set(detectedAgentList) : null,
    disabledAgents,
    fallbackAgent,
    setAgent
  }
}
