import { toast } from 'sonner'
import { translate } from '~renderer/i18n/i18n'
import type { RendererCommandResult } from '~renderer/runtime/renderer-command-result-channel'

type AgentStartProfileResult = Extract<RendererCommandResult, { type: 'agentstart-profile' }>

const FAILURE_TITLES = {
  'create-local': ['Failed to create profile', 'auto.store.slices.agentstart.profiles.612f7f6861'],
  switch: ['Failed to switch profile', 'auto.store.slices.agentstart.profiles.7d4bc516ee'],
  transfer: ['Failed to transfer project', 'auto.store.slices.agentstart.profiles.f03ae7f27b']
} as const

export function presentAgentStartProfileResult(result: AgentStartProfileResult): void {
  if (result.outcome === 'succeeded') {
    // Local profile operations either relaunch or update their owning UI directly.
    return
  }
  if (result.outcome === 'duplicate-target') {
    toast.error(
      translate(
        'auto.store.slices.agentstart.profiles.f518e89aa5',
        'Project already exists in that profile'
      )
    )
    return
  }
  const [fallback, key] = FAILURE_TITLES[result.operation]
  toast.error(translate(key, fallback), result.error ? { description: result.error } : undefined)
}
