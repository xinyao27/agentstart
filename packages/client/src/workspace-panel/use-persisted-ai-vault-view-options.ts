import type { AiVaultAgent } from '@agentstart/protocol/ai-vault/providers'
import { useRef, useState } from 'react'
import type {
  AiVaultGroup,
  AiVaultSort
} from '~renderer/workspace-panel/ai-vault/session/providers'

import {
  createDefaultAiVaultViewOptions,
  enabledAiVaultAgents,
  readAiVaultViewOptions,
  writeAiVaultViewOptions,
  type AiVaultViewOptions
} from './ai-vault/view-options-persistence'

type AiVaultViewOptionsUpdate = (current: AiVaultViewOptions) => AiVaultViewOptions

export function usePersistedAiVaultViewOptions(): {
  agents: AiVaultAgent[]
  sort: AiVaultSort
  group: AiVaultGroup
  hideEmptySessions: boolean
  setSort: (sort: AiVaultSort) => void
  setGroup: (group: AiVaultGroup) => void
  setHideEmptySessions: (hide: boolean) => void
  setAgentEnabled: (agent: AiVaultAgent, enabled: boolean) => void
  resetViewOptions: () => void
} {
  const [options, setOptions] = useState<AiVaultViewOptions>(() => readAiVaultViewOptions())
  // Why: menu actions may batch before a render, so every persistence write must build on
  // the immediately preceding action instead of the last rendered options.
  const optionsRef = useRef(options)

  const updateOptions = (update: AiVaultViewOptionsUpdate) => {
    const current = optionsRef.current
    const candidate = update(current)
    if (candidate === current) {
      return
    }
    // Why: setters map valid state to valid state, so persist the candidate directly.
    // Re-normalizing here would re-allocate disabledAgents on every sort/group change and
    // needlessly recompute the session filter; writeAiVaultViewOptions still normalizes what it stores.
    optionsRef.current = candidate
    setOptions(candidate)
    writeAiVaultViewOptions(candidate)
  }

  const setSort = (sort: AiVaultSort) =>
    updateOptions((current) => (current.sort === sort ? current : { ...current, sort }))
  const setGroup = (group: AiVaultGroup) =>
    updateOptions((current) => (current.group === group ? current : { ...current, group }))
  const setHideEmptySessions = (hideEmptySessions: boolean) =>
    updateOptions((current) =>
      current.hideEmptySessions === hideEmptySessions ? current : { ...current, hideEmptySessions }
    )
  const setAgentEnabled = (agent: AiVaultAgent, enabled: boolean) => {
    updateOptions((current) => {
      const isDisabled = current.disabledAgents.includes(agent)
      if (enabled === !isDisabled) {
        return current
      }
      const disabledAgents = enabled
        ? current.disabledAgents.filter((entry) => entry !== agent)
        : [...current.disabledAgents, agent]
      return enabledAiVaultAgents(disabledAgents).length > 0
        ? { ...current, disabledAgents }
        : current
    })
  }
  const resetViewOptions = () => updateOptions(() => createDefaultAiVaultViewOptions())

  const agents = (() => enabledAiVaultAgents(options.disabledAgents))()
  return {
    agents,
    sort: options.sort,
    group: options.group,
    hideEmptySessions: options.hideEmptySessions,
    setSort,
    setGroup,
    setHideEmptySessions,
    setAgentEnabled,
    resetViewOptions
  }
}
