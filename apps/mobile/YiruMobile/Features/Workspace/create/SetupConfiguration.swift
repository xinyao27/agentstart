import Foundation
import YiruProtocol

nonisolated enum WorkspaceSetupRunPolicy: String, Sendable {
    case ask
    case runByDefault
    case skipByDefault

    init(protocolValue: Yiru_Runtime_V1_RepoSetupRunPolicy) throws {
        switch protocolValue {
        case .ask: self = .ask
        case .runByDefault: self = .runByDefault
        case .skipByDefault: self = .skipByDefault
        case .unspecified:
            throw RuntimeResponseValidationError("repo_hooks.setup_run_policy")
        case .UNRECOGNIZED:
            self = .ask
        }
    }
}

nonisolated enum WorkspaceSetupDecision: String, Sendable {
    case inherit
    case run
    case skip

    var wire: MobileWorkspaceSetupDecisionWire {
        switch self {
        case .inherit: .inherit
        case .run: .run
        case .skip: .skip
        }
    }
}

nonisolated struct WorkspaceSetupTrust: Hashable, Sendable {
    let contentHash: String
    let scriptContent: String
}

nonisolated struct WorkspaceSetupDetails: Hashable, Sendable {
    let command: String?
    let source: String?
    let runPolicy: WorkspaceSetupRunPolicy
    let trust: WorkspaceSetupTrust?

    static let empty = WorkspaceSetupDetails(
        command: nil,
        source: nil,
        runPolicy: .runByDefault,
        trust: nil
    )

    var decisionContent: String? {
        command ?? trust?.scriptContent
    }

    init(protocolValue: Yiru_Runtime_V1_RepoServiceGetHooksResponse) throws {
        let command =
            protocolValue.hasSetupCommand
            ? protocolValue.setupCommand.trimmingCharacters(in: .whitespacesAndNewlines) : nil
        self.command = command?.isEmpty == false ? command : nil
        switch protocolValue.source {
        case .unspecified: source = nil
        case .yiruYaml: source = "yiru.yaml"
        case .legacy: source = "legacy"
        case .UNRECOGNIZED: source = nil
        }
        runPolicy = try WorkspaceSetupRunPolicy(protocolValue: protocolValue.setupRunPolicy)
        if protocolValue.hasSetupTrust {
            let contentHash = protocolValue.setupTrust.contentHash.trimmingCharacters(
                in: .whitespacesAndNewlines
            )
            let scriptContent = protocolValue.setupTrust.scriptContent
            guard
                !contentHash.isEmpty,
                !scriptContent.trimmingCharacters(in: .whitespacesAndNewlines).isEmpty
            else {
                throw RuntimeResponseValidationError("repo_hooks.setup_trust")
            }
            trust = WorkspaceSetupTrust(contentHash: contentHash, scriptContent: scriptContent)
        } else {
            trust = nil
        }
    }

    init(
        command: String?,
        source: String?,
        runPolicy: WorkspaceSetupRunPolicy,
        trust: WorkspaceSetupTrust?
    ) {
        self.command = command
        self.source = source
        self.runPolicy = runPolicy
        self.trust = trust
    }
}

nonisolated struct WorkspaceTrustedHookEntry: Hashable, Sendable {
    let contentHash: String
    let approvedAt: Double

    init(contentHash: String, approvedAt: Double) {
        self.contentHash = contentHash
        self.approvedAt = approvedAt
    }

    init(uiValue value: RuntimeUiValue?) {
        let object = value?.objectValue
        contentHash = object?["contentHash"]?.stringValue ?? ""
        approvedAt = object?["approvedAt"]?.numberValue ?? 0
    }

    var uiValue: RuntimeUiValue {
        .object([
            "contentHash": .string(contentHash),
            "approvedAt": .number(approvedAt),
        ])
    }
}

nonisolated struct WorkspaceTrustedHookRepo: Hashable, Sendable {
    let allApprovedAt: Double?
    let setup: WorkspaceTrustedHookEntry?
    let archive: WorkspaceTrustedHookEntry?

    init(uiValue value: RuntimeUiValue?) {
        let object = value?.objectValue
        allApprovedAt = object?["all"]?.objectValue?["approvedAt"]?.numberValue
        setup = WorkspaceTrustedHookEntry(uiValue: object?["setup"])
        archive = WorkspaceTrustedHookEntry(uiValue: object?["archive"])
    }

    init(
        allApprovedAt: Double?,
        setup: WorkspaceTrustedHookEntry?,
        archive: WorkspaceTrustedHookEntry?
    ) {
        self.allApprovedAt = allApprovedAt
        self.setup = setup
        self.archive = archive
    }

    var uiValue: RuntimeUiValue {
        var object: [String: RuntimeUiValue] = [:]
        if let allApprovedAt {
            object["all"] = .object(["approvedAt": .number(allApprovedAt)])
        }
        if let setup {
            object["setup"] = setup.uiValue
        }
        if let archive {
            object["archive"] = archive.uiValue
        }
        return .object(object)
    }
}

typealias WorkspaceTrustedHooks = [String: WorkspaceTrustedHookRepo]

// Why: the UI document keeps trustedYiruHooks as an open JSON object, so the
// native projection decodes the keys it knows and re-encodes them on write.
nonisolated func workspaceTrustedHooks(
    _ fields: [String: RuntimeUiValue]?
) -> WorkspaceTrustedHooks {
    guard let repos = fields?["trustedYiruHooks"]?.objectValue else { return [:] }
    return repos.mapValues(WorkspaceTrustedHookRepo.init(uiValue:))
}

nonisolated struct WorkspaceSetupTrustPrompt: Identifiable, Hashable, Sendable {
    let repoID: String
    let repoName: String
    let scriptContent: String
    let contentHash: String
    let wasPreviouslyApproved: Bool

    var id: String { "\(repoID):\(contentHash)" }
}

nonisolated extension Dictionary where Key == String, Value == WorkspaceTrustedHookRepo {
    func trustsSetup(repoID: String, contentHash: String) -> Bool {
        guard let repo = self[repoID] else { return false }
        return repo.allApprovedAt != nil || repo.setup?.contentHash == contentHash
    }

    func approvingSetup(
        repoID: String,
        contentHash: String,
        alwaysTrust: Bool,
        approvedAt: Double = Date.now.timeIntervalSince1970 * 1_000
    ) -> Self {
        let existing = self[repoID]
        var copy = self
        copy[repoID] = WorkspaceTrustedHookRepo(
            allApprovedAt: alwaysTrust ? approvedAt : existing?.allApprovedAt,
            setup: alwaysTrust
                ? existing?.setup
                : WorkspaceTrustedHookEntry(contentHash: contentHash, approvedAt: approvedAt),
            archive: existing?.archive
        )
        return copy
    }
}
