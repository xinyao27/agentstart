import UserNotifications

nonisolated enum NotificationCategory {
    static let agentTaskComplete = "agentstart.agent-task-complete"
    static let terminalBell = "agentstart.terminal-bell"
    static let fallback = "agentstart.notification"

    // Why: a notification is a snapshot of daemon state, so dismissing it on the phone has to
    // be reportable. `.customDismissAction` delivers the dismissal to the coordinator, which
    // retires the same notification on the daemon instead of replaying it after reconnecting.
    static var all: Set<UNNotificationCategory> {
        Set(
            [agentTaskComplete, terminalBell, fallback].map {
                UNNotificationCategory(
                    identifier: $0,
                    actions: [],
                    intentIdentifiers: [],
                    options: [.customDismissAction]
                )
            }
        )
    }

    static func identifier(forSource source: String) -> String {
        switch source {
        case "agent-task-complete": agentTaskComplete
        case "terminal-bell": terminalBell
        default: fallback
        }
    }
}
