import { translate } from '~renderer/i18n/i18n'

import type { RemoteRuntimeMultiplexedTerminalCallbacks } from '../types'
import { REMOTE_TERMINAL_SNAPSHOT_TOO_LARGE } from '../types'

type DeliveryFailure =
  | 'end-record'
  | 'restore-record'
  | 'utf8'
  | 'snapshot-too-large'
  | 'snapshot-unavailable'

export function reportTerminalDeliveryFailure(
  callbacks: RemoteRuntimeMultiplexedTerminalCallbacks,
  failure: DeliveryFailure
): void {
  callbacks.onError?.(failureMessage(failure))
}

function failureMessage(failure: DeliveryFailure): string {
  switch (failure) {
    case 'end-record':
      return translate('terminal.multiplex.invalidEnd', 'Invalid remote terminal end record.')
    case 'restore-record':
      return translate(
        'terminal.multiplex.invalidRestore',
        'Invalid remote terminal restore record.'
      )
    case 'utf8':
      return translate(
        'terminal.multiplex.invalidUtf8',
        'Remote terminal output is not valid UTF-8.'
      )
    case 'snapshot-too-large':
      return translate('terminal.multiplex.snapshotTooLarge', REMOTE_TERMINAL_SNAPSHOT_TOO_LARGE)
    case 'snapshot-unavailable':
      return translate(
        'terminal.multiplex.snapshotUnavailable',
        'Remote terminal snapshot is unavailable.'
      )
  }
}
