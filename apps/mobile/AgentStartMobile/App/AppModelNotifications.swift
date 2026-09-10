import UserNotifications

@MainActor
extension AppModel {
    func prepareNotificationOptIn() async {
        guard !NotificationPreference.hasDecision(),
            let hosts = try? await dependencies.hostRepository.hosts(),
            !hosts.isEmpty
        else { return }

        let settings = await UNUserNotificationCenter.current().notificationSettings()
        switch settings.authorizationStatus {
        case .authorized, .provisional, .ephemeral:
            NotificationPreference.save(true)
        case .denied:
            NotificationPreference.save(false)
        case .notDetermined:
            isNotificationOptInPresented = true
        @unknown default:
            break
        }
    }

    func finishNotificationOptIn() {
        isNotificationOptInPresented = false
    }

    func handleNotificationRoute(_ route: NotificationRoute) async {
        guard
            let hosts = try? await dependencies.hostRepository.hosts(),
            let host = hosts.first(where: { $0.id == route.hostID })
        else { return }

        guard let worktreeID = route.worktreeID else {
            routes = [.workspaces(host, .standard)]
            return
        }
        guard
            let snapshot = try? await dependencies.workspaceRepository.workspaces(for: host.id),
            let workspace = snapshot.workspaces.first(where: { $0.id == worktreeID })
        else {
            routes = [.workspaces(host, .standard)]
            return
        }
        routes = [.workspaces(host, .standard), .workspaceSession(host, workspace, nil)]
    }
}
