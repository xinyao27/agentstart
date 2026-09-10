import AgentStartProtocol

extension RuntimeClient: NotificationRuntimeRepository {
    func notificationUpdates(for hostID: String) async throws
        -> RuntimeNotificationStream
    {
        try await protocolNotificationUpdates(hostID: hostID)
    }

    func missedNotifications(for hostID: String, after sequence: Int64) async throws
        -> [RuntimeNotificationEvent]
    {
        try await protocolMissedNotifications(
            hostID: hostID,
            after: max(sequence, 0)
        )
    }
}

nonisolated func mapProtocolSubscribeEvent(
    _ wire: AgentStart_Runtime_V1_SubscribeResponse
) throws -> RuntimeNotificationEvent? {
    guard let event = wire.event else { return nil }
    switch event {
    case .ready:
        return nil
    case .notification(let notification):
        return try mapProtocolNotificationEvent(notification)
    }
}

nonisolated func mapProtocolNotificationEvent(
    _ wire: AgentStart_Runtime_V1_ReplayNotificationEvent
) throws -> RuntimeNotificationEvent? {
    guard wire.sequence > 0 else { throw RuntimeResponseValidationError("notification.sequence") }
    guard let event = wire.event else { return nil }
    switch event {
    case .notification(let notification):
        guard let source = try protocolNotificationSource(notification.source) else { return nil }
        return .notification(
            source: source,
            title: notification.title,
            body: notification.body,
            worktreeID: notification.hasWorktreeID ? notification.worktreeID : nil,
            notificationID: notification.hasNotificationID ? notification.notificationID : nil,
            sequence: wire.sequence
        )
    case .dismiss(let dismiss):
        return .dismiss(notificationID: dismiss.notificationID, sequence: wire.sequence)
    }
}

nonisolated private func protocolNotificationSource(
    _ source: AgentStart_Runtime_V1_NotificationSource
) throws -> String? {
    switch source {
    case .agentTaskComplete: "agent-task-complete"
    case .terminalBell: "terminal-bell"
    case .test: "test"
    case .UNRECOGNIZED: nil
    case .unspecified: throw RuntimeResponseValidationError("notification.source")
    }
}
