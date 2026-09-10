import Foundation

nonisolated enum NotificationPreference {
    static let enabledKey = "agentstart:pushNotificationsEnabled"

    static func isEnabled(defaults: UserDefaults = .standard) -> Bool {
        defaults.bool(forKey: enabledKey)
    }

    static func hasDecision(defaults: UserDefaults = .standard) -> Bool {
        defaults.object(forKey: enabledKey) != nil
    }

    static func save(_ value: Bool, defaults: UserDefaults = .standard) {
        defaults.set(value, forKey: enabledKey)
    }
}
