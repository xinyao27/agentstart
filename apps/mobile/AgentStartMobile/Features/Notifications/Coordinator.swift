import CryptoKit
import Foundation
import UserNotifications

@MainActor
final class NotificationCoordinator: NSObject, UNUserNotificationCenterDelegate {
    private let hosts: any HostRepository
    private let runtime: any NotificationRuntimeRepository
    private let defaults: UserDefaults
    private let center: UNUserNotificationCenter

    private var hostTasks: [String: Task<Void, Never>] = [:]
    private var routeHandler: (@MainActor @Sendable (NotificationRoute) async -> Void)?
    private var pendingRoute: NotificationRoute?
    private var handledResponses = BoundedStringSet(capacity: 256)
    private var scheduled: [String: ScheduledNotificationState] = [:]

    init(
        hosts: any HostRepository,
        runtime: any NotificationRuntimeRepository,
        defaults: UserDefaults = .standard,
        center: UNUserNotificationCenter = .current()
    ) {
        self.hosts = hosts
        self.runtime = runtime
        self.defaults = defaults
        self.center = center
    }

    func install() {
        center.delegate = self
    }

    func start(
        route: @escaping @MainActor @Sendable (NotificationRoute) async -> Void
    ) async {
        routeHandler = route
        if let pendingRoute {
            self.pendingRoute = nil
            await route(pendingRoute)
        }

        guard let profiles = try? await hosts.hosts() else { return }
        let hostIDs = Set(profiles.map(\.id))
        let removedHostIDs = hostTasks.keys.filter { !hostIDs.contains($0) }
        for hostID in removedHostIDs {
            hostTasks[hostID]?.cancel()
            hostTasks.removeValue(forKey: hostID)
        }
        for hostID in hostIDs where hostTasks[hostID] == nil {
            hostTasks[hostID] = Task { [weak self] in
                await self?.observe(hostID: hostID)
            }
        }
    }

    func userNotificationCenter(
        _: UNUserNotificationCenter,
        willPresent _: UNNotification
    ) async -> UNNotificationPresentationOptions {
        [.banner, .list, .sound]
    }

    func userNotificationCenter(
        _: UNUserNotificationCenter,
        didReceive response: UNNotificationResponse
    ) async {
        await handle(response)
    }

    private func handle(_ response: UNNotificationResponse) async {
        guard response.actionIdentifier == UNNotificationDefaultActionIdentifier else { return }
        let responseID = response.notification.request.identifier
        guard !handledResponses.contains(responseID) else { return }
        handledResponses.insert(responseID)

        let data = response.notification.request.content.userInfo
        guard let hostID = nonEmptyString(data[NotificationUserInfo.hostID]) else { return }
        let route = NotificationRoute(
            hostID: hostID,
            worktreeID: nonEmptyString(data[NotificationUserInfo.worktreeID])
        )
        if let routeHandler {
            await routeHandler(route)
        } else {
            pendingRoute = route
        }
    }

    private func observe(hostID: String) async {
        var seenReplay = BoundedStringSet(capacity: 512)
        var readyCount = 0

        while !Task.isCancelled {
            do {
                let stream = try await runtime.notificationUpdates(for: hostID)
                notificationStream: for try await event in stream {
                    guard !Task.isCancelled else { break }
                    switch event {
                    case .ready:
                        readyCount += 1
                        let watermark = lastSequence(hostID: hostID)
                        if readyCount > 1 || watermark > 0 {
                            let missed = try await runtime.missedNotifications(
                                for: hostID,
                                after: watermark
                            )
                            for replayed in missed {
                                let seenKey = replayed.seenKey
                                if let seenKey, seenReplay.contains(seenKey) { continue }
                                if let seenKey { seenReplay.insert(seenKey) }
                                await deliver(replayed, hostID: hostID)
                            }
                        }
                    case .end:
                        // Why: tear down an ended subscription so the host loop can establish
                        // a fresh stream. Consuming past end strands notifications on a stream
                        // that will never publish another event.
                        break notificationStream
                    default:
                        if let seenKey = event.seenKey {
                            if seenReplay.contains(seenKey) { continue }
                            seenReplay.insert(seenKey)
                        }
                        await deliver(event, hostID: hostID)
                    }
                }
            } catch is CancellationError {
                break
            } catch {
                // RuntimeHostSession owns connection diagnostics and reconnection state.
            }

            guard !Task.isCancelled else { break }
            try? await Task.sleep(for: .seconds(2))
        }
    }

    private func deliver(_ event: RuntimeNotificationEvent, hostID: String) async {
        if let sequence = event.sequence { save(sequence: sequence, hostID: hostID) }
        switch event {
        case .notification(
            let source,
            let title,
            let body,
            let worktreeID,
            let notificationID,
            _
        ):
            await schedule(
                source: source,
                title: title,
                body: body,
                hostID: hostID,
                worktreeID: worktreeID,
                notificationID: notificationID
            )
        case .dismiss(let notificationID, _):
            await dismiss(hostID: hostID, notificationID: notificationID)
        case .ready, .end:
            break
        }
    }

    private func schedule(
        source: String,
        title: String,
        body: String,
        hostID: String,
        worktreeID: String?,
        notificationID: String?
    ) async {
        guard NotificationPreference.isEnabled(defaults: defaults) else { return }
        guard await canDeliverNotifications() else { return }

        let storedKey = notificationID.map { storedNotificationKey(hostID: hostID, id: $0) }
        let identifier: String
        let state: ScheduledNotificationState?
        if let storedKey {
            if let existing = scheduled[storedKey], existing.isPending { return }
            let existing =
                scheduled[storedKey]
                ?? ScheduledNotificationState(identifier: notificationRequestID(storedKey))
            existing.isPending = true
            scheduled[storedKey] = existing
            identifier = existing.identifier
            state = existing
            center.removePendingNotificationRequests(withIdentifiers: [identifier])
            center.removeDeliveredNotifications(withIdentifiers: [identifier])
        } else {
            identifier = UUID().uuidString
            state = nil
        }

        let content = UNMutableNotificationContent()
        content.title = title
        content.body = body
        content.sound = .default
        var userInfo: [String: String] = [
            NotificationUserInfo.source: source,
            NotificationUserInfo.hostID: hostID,
        ]
        if let worktreeID { userInfo[NotificationUserInfo.worktreeID] = worktreeID }
        if let notificationID { userInfo[NotificationUserInfo.notificationID] = notificationID }
        content.userInfo = userInfo

        do {
            try await center.add(
                UNNotificationRequest(identifier: identifier, content: content, trigger: nil)
            )
            if state?.dismissAfterSchedule == true {
                center.removePendingNotificationRequests(withIdentifiers: [identifier])
                center.removeDeliveredNotifications(withIdentifiers: [identifier])
                if let storedKey { scheduled.removeValue(forKey: storedKey) }
            } else {
                boundScheduledNotifications()
            }
        } catch {
            if let storedKey { scheduled.removeValue(forKey: storedKey) }
        }
        state?.isPending = false
        state?.dismissAfterSchedule = false
    }

    private func dismiss(hostID: String, notificationID: String) async {
        let storedKey = storedNotificationKey(hostID: hostID, id: notificationID)
        let identifier = scheduled[storedKey]?.identifier ?? notificationRequestID(storedKey)
        if let state = scheduled[storedKey], state.isPending {
            state.dismissAfterSchedule = true
            return
        }
        scheduled.removeValue(forKey: storedKey)
        center.removePendingNotificationRequests(withIdentifiers: [identifier])
        center.removeDeliveredNotifications(withIdentifiers: [identifier])
    }

    private func canDeliverNotifications() async -> Bool {
        let settings = await center.notificationSettings()
        switch settings.authorizationStatus {
        case .authorized, .provisional, .ephemeral:
            return true
        case .notDetermined:
            return (try? await center.requestAuthorization(options: [.alert, .badge, .sound]))
                ?? false
        case .denied:
            return false
        @unknown default:
            return false
        }
    }

    private func lastSequence(hostID: String) -> Int64 {
        let value = defaults.object(forKey: sequenceKey(hostID: hostID)) as? NSNumber
        return max(value?.int64Value ?? 0, 0)
    }

    private func save(sequence: Int64, hostID: String) {
        guard sequence > lastSequence(hostID: hostID) else { return }
        defaults.set(sequence, forKey: sequenceKey(hostID: hostID))
    }

    private func sequenceKey(hostID: String) -> String {
        "agentstart:mobileNotificationsLastSeq:\(encodeURIComponent(hostID))"
    }

    private func boundScheduledNotifications() {
        guard scheduled.count > 256 else { return }
        for key in scheduled.keys where scheduled.count > 256 {
            guard scheduled[key]?.isPending == false else { continue }
            scheduled.removeValue(forKey: key)
        }
    }
}

@MainActor
private final class ScheduledNotificationState {
    let identifier: String
    var isPending = false
    var dismissAfterSchedule = false

    init(identifier: String) {
        self.identifier = identifier
    }
}

private struct BoundedStringSet {
    private let capacity: Int
    private var values: Set<String> = []
    private var order: [String] = []

    init(capacity: Int) {
        self.capacity = capacity
    }

    func contains(_ value: String) -> Bool {
        values.contains(value)
    }

    mutating func insert(_ value: String) {
        guard values.insert(value).inserted else { return }
        order.append(value)
        if order.count > capacity {
            values.remove(order.removeFirst())
        }
    }
}

private enum NotificationUserInfo {
    static let source = "source"
    static let hostID = "hostId"
    static let worktreeID = "worktreeId"
    static let notificationID = "notificationId"
}

private func storedNotificationKey(hostID: String, id: String) -> String {
    "\(encodeURIComponent(hostID)):\(encodeURIComponent(id))"
}

private func notificationRequestID(_ key: String) -> String {
    let digest = SHA256.hash(data: Data(key.utf8))
    return "agentstart.desktop.\(digest.map { String(format: "%02x", $0) }.joined())"
}

private func encodeURIComponent(_ value: String) -> String {
    var allowed = CharacterSet.alphanumerics
    allowed.insert(charactersIn: "-_.!~*'()")
    return value.addingPercentEncoding(withAllowedCharacters: allowed) ?? value
}

private func nonEmptyString(_ value: Any?) -> String? {
    guard let value = value as? String else { return nil }
    let trimmed = value.trimmingCharacters(in: .whitespacesAndNewlines)
    return trimmed.isEmpty ? nil : trimmed
}

private extension RuntimeNotificationEvent {
    var seenKey: String? {
        switch self {
        case .notification(_, _, _, _, let notificationID, let sequence):
            return notificationSeenKey(id: notificationID, sequence: sequence)
        case .dismiss(let notificationID, let sequence):
            return notificationSeenKey(id: notificationID, sequence: sequence)
        case .ready, .end:
            return nil
        }
    }
}

private func notificationSeenKey(id: String?, sequence: Int64?) -> String? {
    if let id, let sequence { return "id:\(id)#\(sequence)" }
    if let id { return "id:\(id)" }
    if let sequence { return "seq:\(sequence)" }
    return nil
}
