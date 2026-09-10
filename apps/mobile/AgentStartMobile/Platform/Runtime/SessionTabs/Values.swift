import Foundation

nonisolated enum MobileSessionTabTypeWire: String, Decodable, Sendable {
    case terminal = "terminal"
    case markdown = "markdown"
    case file = "file"
    case browser = "browser"
}

nonisolated enum MobileSessionTerminalStatusWire: String, Decodable, Sendable {
    case pendingHandle = "pending-handle"
    case ready = "ready"
    case sleeping = "sleeping"
}

nonisolated struct MobileSessionCreateTerminalRequestWire: Encodable, Sendable {
    let worktree: String
    let afterTabId: String?
    let activate: Bool?
    let clientMutationId: String?
    let agent: String?
    let command: String?
    let env: [String: String]?
    let envToDelete: [String]?
    let launchConfig: MobileSleepingAgentLaunchConfigWire?
    let launchAgent: String?
    let startupCommandDelivery: String?
    let agentPrompt: String?
}

nonisolated struct MobileSleepingAgentLaunchConfigWire: Encodable, Sendable {
    let agentCommand: String?
    let agentArgs: String
    let agentEnv: [String: String]
    let ompResumeFilePath: String?
}

nonisolated struct MobileSessionProviderSessionWire: Decodable, Sendable {
    let key: String
    let id: String
    let transcriptPath: String?
}

nonisolated struct MobileSessionAgentStatusWire: Decodable, Sendable {
    let state: String
    let paneKey: String?
    let prompt: String?
    let updatedAt: Double?
    let stateStartedAt: Double?
    let agentType: String?
    let interactivePrompt: String?
    let lastAssistantMessage: String?
    let toolName: String?
    let toolInput: String?
    let interrupted: Bool?
    let providerSession: MobileSessionProviderSessionWire?
}

nonisolated struct MobileSessionTabWire: Decodable, Sendable {
    let id: String
    let title: String
    let isActive: Bool
    let color: String?
    let isPinned: Bool?
    let type: MobileSessionTabTypeWire
    let parentTabId: String?
    let leafId: String?
    let ptyId: String?
    let launchAgent: String?
    let resolvedAgentType: String?
    let agentStatus: MobileSessionAgentStatusWire?
    let status: MobileSessionTerminalStatusWire?
    let terminal: String?
    let worktreeInstanceId: String?
    let filePath: String?
    let relativePath: String?
    let language: String?
    let mode: String?
    let diffSource: String?
    let isDirty: Bool?
    let sourceFileId: String?
    let sourceFilePath: String?
    let sourceRelativePath: String?
    let documentVersion: String?
    let browserWorkspaceId: String?
    let browserPageId: String?
    let url: String?
    let loading: Bool?
    let canGoBack: Bool?
    let canGoForward: Bool?
}

nonisolated struct MobileSessionTabsWire: Decodable, Sendable {
    let worktree: String
    let publicationEpoch: String
    let snapshotVersion: Int64
    let activeTabId: String?
    let activeTabType: MobileSessionTabTypeWire?
    let tabs: [MobileSessionTabWire]
}

nonisolated struct MobileSessionCreateTerminalResultWire: Decodable, Sendable {
    let tab: MobileSessionTabWire
    let publicationEpoch: String
    let snapshotVersion: Int64
}

nonisolated enum MobileSessionTabsEventWire: Decodable, Sendable {
    case snapshot(MobileSessionTabsWire)
    case updated(MobileSessionTabsWire)
    case end

    private enum EventType: String, Decodable {
        case snapshot
        case updated
        case end
    }

    private enum CodingKeys: String, CodingKey {
        case type
    }

    init(from decoder: Decoder) throws {
        let container = try decoder.container(keyedBy: CodingKeys.self)
        switch try container.decode(EventType.self, forKey: .type) {
        case .snapshot:
            self = .snapshot(try MobileSessionTabsWire(from: decoder))
        case .updated:
            self = .updated(try MobileSessionTabsWire(from: decoder))
        case .end:
            self = .end
        }
    }
}

nonisolated enum MobileSessionTabsAllEventWire: Decodable, Sendable {
    case snapshots([MobileSessionTabsWire])
    case updated(MobileSessionTabsWire)
    case end

    private enum EventType: String, Decodable {
        case snapshots
        case updated
        case end
    }

    private enum CodingKeys: String, CodingKey {
        case type
        case snapshots
    }

    init(from decoder: any Decoder) throws {
        let container = try decoder.container(keyedBy: CodingKeys.self)
        switch try container.decode(EventType.self, forKey: .type) {
        case .snapshots:
            self = .snapshots(
                try container.decode([MobileSessionTabsWire].self, forKey: .snapshots)
            )
        case .updated:
            self = .updated(try MobileSessionTabsWire(from: decoder))
        case .end:
            self = .end
        }
    }
}
