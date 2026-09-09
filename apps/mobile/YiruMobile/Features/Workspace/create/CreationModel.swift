import Foundation
import Observation

nonisolated enum WorkspaceCreationPhase: Sendable {
    case loading
    case ready
    case failed(LocalizedStringResource)
}

@Observable
@MainActor
final class WorkspaceCreationModel {
    private(set) var phase: WorkspaceCreationPhase = .loading
    private(set) var repos: [WorkspaceRepo] = []
    private(set) var agents: [WorkspaceCreationAgent] = []
    private(set) var isCreating = false
    private(set) var isLoadingSetup = false
    private(set) var setupInspectionFailed = false
    private(set) var errorMessage: String?
    private(set) var setupDetails = WorkspaceSetupDetails.empty
    private(set) var trustPrompt: WorkspaceSetupTrustPrompt?
    private(set) var trustedHooks: WorkspaceTrustedHooks = [:]
    var sourceSelection: WorkspaceSourceSelection?
    var sourceRefs: [WorkspaceSourceRef] = []
    var isSearchingSources = false
    var sourceError: String?
    var hostedSources: [WorkspaceHostedSource] = []
    var isResolvingSource = false
    var reuseEligibleBranch: String?
    var crossRepoPrompt: WorkspaceCrossRepoPrompt?

    var selectedRepoID = ""
    var selectedAgentID = WorkspaceCreationAgent.blankID
    var name = ""
    var baseBranch = ""
    var branchName = ""
    var note = ""
    var isAdvancedExpanded = false
    var setupDecisionChoice: WorkspaceSetupDecision?
    var shouldRunSetup = true

    @ObservationIgnored let hostID: String
    @ObservationIgnored private let existingPaths: [String]
    @ObservationIgnored let existingBranchesByRepo: [String: [String]]
    @ObservationIgnored let repository: any WorkspaceCreationRepository
    @ObservationIgnored private let preferredRepoID: String?
    @ObservationIgnored var lastAutoName = ""
    @ObservationIgnored var dismissedPasteQuery = ""

    init(
        hostID: String,
        existingPaths: [String],
        existingBranchesByRepo: [String: [String]],
        preferredRepoID: String?,
        repository: any WorkspaceCreationRepository
    ) {
        self.hostID = hostID
        self.existingPaths = existingPaths
        self.existingBranchesByRepo = existingBranchesByRepo
        self.preferredRepoID = preferredRepoID
        self.repository = repository
    }

    var selectedRepo: WorkspaceRepo? {
        repos.first(where: { $0.id == selectedRepoID })
    }

    var selectedAgent: WorkspaceCreationAgent? {
        agents.first(where: { $0.id == selectedAgentID })
    }

    var canCreate: Bool {
        !selectedRepoID.isEmpty && !isCreating && !isLoadingSetup
            && !setupInspectionFailed
            && (setupDetails.decisionContent == nil || setupDetails.runPolicy != .ask
                || setupDecisionChoice != nil)
    }

    func load() async {
        phase = .loading
        errorMessage = nil
        do {
            let options = try await repository.workspaceCreationOptions(for: hostID)
            guard !Task.isCancelled else { return }
            repos = options.repos
            agents = options.agents
            if selectedRepoID.isEmpty {
                selectedRepoID =
                    repos.contains(where: { $0.id == preferredRepoID })
                    ? (preferredRepoID ?? "") : (repos.first?.id ?? "")
            }
            selectedAgentID =
                agents.contains(where: { $0.id == options.preferredAgentID })
                ? options.preferredAgentID : WorkspaceCreationAgent.blankID
            trustedHooks = options.trustedHooks
            phase = .ready
        } catch is CancellationError {
            return
        } catch {
            phase = .failed("Yiru could not load workspace creation options from this host.")
        }
    }

    func loadSelectedRepoConfiguration() async {
        let repoID = selectedRepoID
        guard !repoID.isEmpty else {
            setupDetails = .empty
            setupInspectionFailed = false
            return
        }
        isLoadingSetup = true
        setupInspectionFailed = false
        setupDecisionChoice = nil
        defer { isLoadingSetup = false }
        do {
            let details = try await repository.workspaceSetupDetails(for: hostID, repoID: repoID)
            guard selectedRepoID == repoID, !Task.isCancelled else { return }
            setupDetails = details
            shouldRunSetup = details.runPolicy != .skipByDefault
            if details.decisionContent != nil, details.runPolicy == .ask {
                isAdvancedExpanded = true
            }
        } catch is CancellationError {
            return
        } catch {
            guard selectedRepoID == repoID else { return }
            setupDetails = .empty
            setupInspectionFailed = true
            errorMessage = String(
                localized: "Yiru could not safely inspect this repository's setup commands."
            )
        }
    }

    func selectRepository(_ repoID: String) {
        guard repoID != selectedRepoID else { return }
        clearCreationError()
        clearSourceSelection()
        selectedRepoID = repoID
    }

    func clearCreationError() {
        errorMessage = nil
    }

    func create() async -> WorkspaceSummary? {
        guard canCreate else { return nil }
        guard await refreshAgentSelection() else { return nil }
        guard let setupDecision = requestedSetupDecision else {
            errorMessage = String(localized: "Choose whether to run the setup script.")
            return nil
        }
        if setupDecision == .run, let trust = setupDetails.trust,
            !trustedHooks.trustsSetup(repoID: selectedRepoID, contentHash: trust.contentHash)
        {
            trustPrompt = WorkspaceSetupTrustPrompt(
                repoID: selectedRepoID,
                repoName: selectedRepo?.name ?? "",
                scriptContent: trust.scriptContent,
                contentHash: trust.contentHash,
                wasPreviouslyApproved: trustedHooks[selectedRepoID]?.setup != nil
            )
            return nil
        }
        return await create(setupDecision: setupDecision)
    }

    func approveSetup(alwaysTrust: Bool) async -> WorkspaceSummary? {
        guard let prompt = trustPrompt, !isCreating else { return nil }
        guard await refreshAgentSelection() else {
            trustPrompt = nil
            return nil
        }
        isCreating = true
        errorMessage = nil
        defer { isCreating = false }
        do {
            let next = trustedHooks.approvingSetup(
                repoID: prompt.repoID,
                contentHash: prompt.contentHash,
                alwaysTrust: alwaysTrust
            )
            trustedHooks = try await repository.persistWorkspaceSetupTrust(
                for: hostID,
                trustedHooks: next
            )
            trustPrompt = nil
            return try await performCreate(setupDecision: .run)
        } catch is CancellationError {
            return nil
        } catch {
            errorMessage = String(localized: "Failed to trust setup script.")
            return nil
        }
    }

    func skipUntrustedSetup() async -> WorkspaceSummary? {
        trustPrompt = nil
        return await create(setupDecision: .skip)
    }

    func dismissTrustPrompt() {
        guard !isCreating else { return }
        trustPrompt = nil
    }

    private var requestedSetupDecision: WorkspaceSetupDecision? {
        guard setupDetails.decisionContent != nil else { return .inherit }
        switch setupDetails.runPolicy {
        case .ask:
            return setupDecisionChoice
        case .runByDefault, .skipByDefault:
            return shouldRunSetup ? .run : .skip
        }
    }

    private func create(setupDecision: WorkspaceSetupDecision) async -> WorkspaceSummary? {
        guard !isCreating else { return nil }
        isCreating = true
        errorMessage = nil
        defer { isCreating = false }
        do {
            return try await performCreate(setupDecision: setupDecision)
        } catch is CancellationError {
            return nil
        } catch WorkspaceCreationError.createdWorkspaceUnavailable {
            errorMessage = String(
                localized:
                    "The workspace was created, but Yiru could not open it yet. Refresh the workspace list."
            )
        } catch WorkspaceCreationError.rejected(let message) {
            errorMessage = message ?? String(localized: "Yiru could not create this workspace.")
        } catch {
            errorMessage = String(localized: "Yiru could not create this workspace.")
        }
        return nil
    }

    private func performCreate(setupDecision: WorkspaceSetupDecision) async throws
        -> WorkspaceSummary
    {
        try await repository.createWorkspace(
            for: hostID,
            draft: WorkspaceCreationDraft(
                repoID: selectedRepoID,
                name: name,
                baseBranch: baseBranch,
                branchName: effectiveBranchName,
                usesWorkspaceNameAsBranch: usesWorkspaceNameAsBranch,
                failsOnBranchConflict: failsOnBranchConflict,
                note: note,
                displayName: isNameAutoManaged ? hostedSource?.title : nil,
                compareBaseRef: hostedBase?.compareBaseRef,
                pushTarget: hostedBase?.pushTarget,
                linkedPullRequest: hostedSource?.number,
                setupDecision: setupDecision,
                agentID: selectedAgent?.runtimeID
            ),
            existingPaths: existingPaths
        )
    }

    private func refreshAgentSelection() async -> Bool {
        guard let options = try? await repository.workspaceCreationOptions(for: hostID) else {
            return true
        }
        agents = options.agents
        guard
            selectedAgentID == WorkspaceCreationAgent.blankID
                || agents.contains(where: { $0.id == selectedAgentID })
        else {
            selectedAgentID = preferredWorkspaceCreationAgentID(
                available: agents,
                preferredID: options.preferredAgentID
            )
            errorMessage = String(
                localized: "Selected agent is disabled. Choose an enabled agent before creating."
            )
            return false
        }
        return true
    }

    private var usesWorkspaceNameAsBranch: Bool {
        // A manually selected branch is a base ref; an optional branchName is an
        // explicit override. Only the "Create branch" intent pins the git branch
        // to the workspace name (including slash-containing names).
        if case .newBranch = sourceSelection { return true }
        return false
    }

    private var effectiveBranchName: String {
        sourceSelection == nil ? "" : branchName
    }

    private var isNameAutoManaged: Bool {
        name.trimmingCharacters(in: .whitespacesAndNewlines).isEmpty || name == lastAutoName
    }

    private var failsOnBranchConflict: Bool {
        if case .branch(_, _, let isReused) = sourceSelection { return isReused }
        return false
    }

    private var hostedSource: WorkspaceHostedSource? {
        if case .hosted(let item, _) = sourceSelection { return item }
        return nil
    }

    private var hostedBase: WorkspaceHostedBase? {
        if case .hosted(_, let base) = sourceSelection { return base }
        return nil
    }
}

nonisolated extension WorkspaceHostedSourceError {
    var message: String {
        switch self {
        case .rejected(let message): message
        case .githubRemoteRequired:
            String(localized: "GitHub pull requests require a GitHub remote for this repository.")
        }
    }
}
