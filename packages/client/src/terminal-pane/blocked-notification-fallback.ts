import { toast } from 'sonner'
import { translate } from '~renderer/i18n/i18n'
import { shellClient } from '~renderer/runtime/shell-client'

// Why: agent completions can dispatch in bursts; one in-app pointer at the
// broken OS setting per session teaches the fix without nagging.
let shownThisSession = false

/**
 * In-app stand-in for a native notification that macOS silently swallowed
 * (dispatch returned 'blocked-by-system'): tells the user notifications are
 * off at the OS level and deep-links to the app's System Settings pane.
 */
export function showBlockedNotificationFallbackToast(): void {
  if (shownThisSession) {
    return
  }
  shownThisSession = true
  toast.warning(
    translate(
      'auto.lib.blocked.notification.fallback.de50bef680',
      'macOS is blocking AgentStart notifications'
    ),
    {
      description: translate(
        'auto.components.onboarding.mac.notification.permission.card.721d2bedb6',
        'Turn on Allow notifications for AgentStart in System Settings.'
      ),
      action: {
        label: translate(
          'auto.components.onboarding.NotificationStep.4f6a1da718',
          'Open System Settings'
        ),
        onClick: () => {
          void shellClient.notifications.openSystemSettings()
        }
      }
    }
  )
}
