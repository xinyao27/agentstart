import { useSyncExternalStore } from 'react'
import { translate } from '~renderer/i18n/i18n'

import { getExtensionConnectionSnapshot, subscribeExtensionConnection } from './session'

export function ConnectionStatus(): React.JSX.Element | null {
  const state = useSyncExternalStore(
    subscribeExtensionConnection,
    getExtensionConnectionSnapshot,
    getExtensionConnectionSnapshot
  )
  if (state === 'connected') {
    return null
  }
  return (
    <div
      className="bg-background fixed inset-x-0 top-0 z-50 h-5 border-b border-amber-500/40 px-2 text-center text-xs leading-5 text-amber-700 dark:text-amber-300"
      role="status"
    >
      {state === 'connecting'
        ? translate('extension.runtime.connecting', 'Connecting to AgentStart…')
        : translate('extension.runtime.reconnecting', 'Reconnecting to the AgentStart daemon…')}
    </div>
  )
}
