import Foundation
import Observation
import UserNotifications

nonisolated enum NotificationPermission: Sendable {
    case undetermined
    case granted
    case denied
}

@Observable
@MainActor
final class NotificationSettingsModel {
    private(set) var isEnabled = false
    private(set) var permission = NotificationPermission.undetermined
    private(set) var isUpdating = false

    @ObservationIgnored
    private let defaults: UserDefaults
    init(defaults: UserDefaults = .standard) {
        self.defaults = defaults
    }

    func refresh() async {
        guard !isUpdating else { return }
        let settings = await UNUserNotificationCenter.current().notificationSettings()
        permission = permissionState(settings.authorizationStatus)
        isEnabled = NotificationPreference.isEnabled(defaults: defaults) && permission == .granted
    }

    func setEnabled(_ shouldEnable: Bool) async {
        guard !isUpdating else { return }
        isUpdating = true
        defer { isUpdating = false }

        if shouldEnable {
            do {
                let granted = try await UNUserNotificationCenter.current().requestAuthorization(
                    options: [.alert, .badge, .sound]
                )
                NotificationPreference.save(granted, defaults: defaults)
            } catch {
                NotificationPreference.save(false, defaults: defaults)
            }
        } else {
            NotificationPreference.save(false, defaults: defaults)
        }
        let settings = await UNUserNotificationCenter.current().notificationSettings()
        permission = permissionState(settings.authorizationStatus)
        isEnabled = NotificationPreference.isEnabled(defaults: defaults) && permission == .granted
    }

    private func permissionState(_ status: UNAuthorizationStatus) -> NotificationPermission {
        switch status {
        case .authorized, .provisional, .ephemeral:
            .granted
        case .denied:
            .denied
        case .notDetermined:
            .undetermined
        @unknown default:
            .undetermined
        }
    }
}
