import Foundation
import Observation
import UIKit

nonisolated enum AgentHistoryPhase: Sendable {
    case loading
    case waiting
    case unsupported
    case ready
    case failed
}

@Observable
@MainActor
final class AgentHistoryModel {
    private(set) var phase = AgentHistoryPhase.loading
    var isConnected = false
    private(set) var snapshot = AgentHistorySnapshot(sessions: [], issues: [], scannedAt: "")
    private(set) var workspaces: [WorkspaceSummary] = []
    private(set) var isRefreshing = false
    private(set) var resumingSessionID: String?
    private(set) var resumeMessage: LocalizedStringResource?
    private(set) var failureMessage: LocalizedStringResource?
    var scope = AgentHistoryScope.workspace
    var query = ""
    var expandedSessionID: String?

    @ObservationIgnored private let hostID: String
    @ObservationIgnored private let workspace: WorkspaceSummary
    @ObservationIgnored private let repository: any AgentHistoryRepository
    @ObservationIgnored private let workspaceRepository: any WorkspaceRepository
    @ObservationIgnored private let connectionRuntime: any HostConnectionRuntime
    @ObservationIgnored private var resumeMutationIDs: [String: String] = [:]

    init(
        hostID: String,
        workspace: WorkspaceSummary,
        repository: any AgentHistoryRepository,
        workspaceRepository: any WorkspaceRepository,
        connectionRuntime: any HostConnectionRuntime
    ) {
        self.hostID = hostID
        self.workspace = workspace
        self.repository = repository
        self.workspaceRepository = workspaceRepository
        self.connectionRuntime = connectionRuntime
    }

    var groups: [AgentHistoryGroup] {
        AgentHistorySessionFilter.groups(
            sessions: snapshot.sessions,
            scope: scope,
            scopePaths: activeScopePaths,
            query: query
        )
    }

    // Why: resolve the title against the freshest known worktree.show/worktree.ps record
    // rather than the value handed to the screen at navigation time. `workspaces` is
    // refreshed on every reconnect (see observe()), so preferring that entry keeps the
    // title from going stale if the display name changed while this screen is open.
    var currentWorkspace: WorkspaceSummary {
        workspaces.first { $0.id == workspace.id } ?? workspace
    }

    var activeScopePaths: [String] {
        AgentHistorySessionFilter.scopePaths(
            scope: scope,
            workspace: workspace,
            workspaces: workspaces
        )
    }

    func load(force: Bool = false) async {
        guard isConnected else {
            if snapshot.sessions.isEmpty { phase = .waiting }
            return
        }
        if force { isRefreshing = true }
        defer { isRefreshing = false }
        failureMessage = nil
        if case .ready = phase {} else { phase = .loading }
        do {
            guard try await repository.supportsAgentHistory(for: hostID) else {
                phase = .unsupported
                isRefreshing = false
                return
            }
            if workspaces.isEmpty {
                if let snapshot = try? await workspaceRepository.workspaces(for: hostID) {
                    workspaces = snapshot.workspaces
                } else {
                    workspaces = [workspace]
                }
            }
            snapshot = try await repository.agentHistory(
                for: hostID,
                scopePaths: activeScopePaths,
                force: force
            )
            guard !Task.isCancelled else { return }
            phase = .ready
        } catch is CancellationError {
            return
        } catch {
            failureMessage = LocalizedStringResource(stringLiteral: error.localizedDescription)
            phase = .failed
        }
    }

    func observe() async {
        let updates = await connectionRuntime.connectionSnapshots(forHostIDs: [hostID])
        for await update in updates {
            guard !Task.isCancelled else { return }
            let connected = update[hostID]?.phase == .connected
            let becameConnected = connected && !isConnected
            isConnected = connected
            if !connected {
                if snapshot.sessions.isEmpty { phase = .waiting }
                continue
            }
            guard becameConnected || phase == .waiting else { continue }
            if becameConnected {
                // Why: rerun on every reconnect rather than once — a worktree
                // added/removed/renamed while disconnected must still reach scope narrowing
                // and the header title.
                workspaces = []
            }
            // Why: key the request to the host connection state so a reconnect refreshes a
            // populated list as well as an empty one. Keeping the old sessions without a
            // refresh hides new or removed transcripts after Desktop recovers.
            await load(force: becameConnected)
        }
    }

    // Why: force-reconnect only while actually disconnected, and otherwise just re-attempt
    // the session load — a plain RPC failure while still connected must not tear down the
    // host link.
    func retry() async {
        if isConnected {
            await load()
        } else {
            await connectionRuntime.reconnect(hostID: hostID)
        }
    }

    func selectScope(_ next: AgentHistoryScope) async {
        guard scope != next else { return }
        scope = next
        expandedSessionID = nil
        await load()
    }

    func toggle(_ session: AgentHistorySession) {
        expandedSessionID = expandedSessionID == session.id ? nil : session.id
    }

    func resume(_ session: AgentHistorySession) async -> WorkspaceSummary? {
        guard isConnected else {
            resumeMessage = "Waiting for daemon…"
            return nil
        }
        guard resumingSessionID == nil else { return nil }
        guard !session.sessionID.trimmingCharacters(in: .whitespacesAndNewlines).isEmpty else {
            resumeMessage = "This session is missing a resume id."
            UINotificationFeedbackGenerator().notificationOccurred(.error)
            return nil
        }
        resumingSessionID = session.id
        resumeMessage = nil
        do {
            if let freshSnapshot = try? await workspaceRepository.workspaces(for: hostID) {
                workspaces = freshSnapshot.workspaces
            }
            let activeWorkspace = workspaces.first { $0.id == workspace.id } ?? workspace
            let target = try AgentHistoryResumeTargetResolver.resolve(
                session: session,
                activeWorkspace: activeWorkspace,
                workspaces: workspaces
            )
            let mutationID =
                resumeMutationIDs[session.id]
                ?? resumeMutationID(sessionID: session.id)
            resumeMutationIDs[session.id] = mutationID
            try await repository.resumeAgentHistorySession(
                for: hostID,
                workspace: target,
                session: session,
                mutationID: mutationID
            )
            resumeMutationIDs.removeValue(forKey: session.id)
            resumingSessionID = nil
            resumeMessage = "Agent session queued."
            UINotificationFeedbackGenerator().notificationOccurred(.success)
            return target
        } catch is CancellationError {
            resumingSessionID = nil
            return nil
        } catch AgentHistoryResumeTargetError.runtimeHostedWorkspace {
            resumingSessionID = nil
            resumeMessage = "Resume from history is not available in runtime-hosted workspaces."
            UINotificationFeedbackGenerator().notificationOccurred(.error)
            return nil
        } catch AgentHistoryResumeTargetError.noLocalWorkspace {
            resumingSessionID = nil
            resumeMessage = "Open a local workspace before resuming a session."
            UINotificationFeedbackGenerator().notificationOccurred(.error)
            return nil
        } catch let error {
            resumingSessionID = nil
            resumeMessage = LocalizedStringResource(stringLiteral: error.localizedDescription)
            UINotificationFeedbackGenerator().notificationOccurred(.error)
            return nil
        }
    }

    private func resumeMutationID(sessionID: String) -> String {
        let allowed = CharacterSet.alphanumerics.union(CharacterSet(charactersIn: "_.:-"))
        let normalized = sessionID.unicodeScalars.map { allowed.contains($0) ? Character($0) : "_" }
        let prefix = String(normalized.prefix(64))
        let sessionPart = prefix.isEmpty ? "session" : prefix
        return "ai-vault-resume:\(sessionPart):\(UUID().uuidString.lowercased())"
    }
}
