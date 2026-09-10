const ORCHESTRATION_SETUP_STATE_EVENT = 'agentstart:orchestration-setup-state'
export const ORCHESTRATION_ENABLED_STORAGE_KEY = 'agentstart.orchestration.enabled'
export const ORCHESTRATION_SETUP_DISMISSED_STORAGE_KEY = 'agentstart.orchestration.setupDismissed'

export function markOrchestrationSetupComplete(): void {
  localStorage.setItem(ORCHESTRATION_ENABLED_STORAGE_KEY, '1')
  notifyOrchestrationSetupStateChanged()
}

export function notifyOrchestrationSetupStateChanged(): void {
  window.dispatchEvent(new CustomEvent(ORCHESTRATION_SETUP_STATE_EVENT))
}
