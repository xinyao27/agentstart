import Foundation
import Observation

nonisolated enum AccountsPhase: Sendable {
    case loading
    case loaded(AccountsSnapshot)
    case failed(String)
}

nonisolated struct AccountActionFailure: Identifiable, Sendable {
    let id = UUID()
    let message: String
}

@Observable
@MainActor
final class AccountModel {
    private(set) var phase: AccountsPhase = .loading
    private(set) var isConnected = false
    private(set) var isRefreshing = false
    private(set) var busyAccountID: String?
    private(set) var actionFailure: AccountActionFailure?
    private(set) var now = Date()

    var hasTerminalFailure: Bool {
        if case .failed = phase { return true }
        return false
    }

    @ObservationIgnored private let hostID: String
    @ObservationIgnored private let hostRepository: (any HostRepository)?
    @ObservationIgnored private let repository: any AccountsRepository
    @ObservationIgnored private let connectionRuntime: any HostConnectionRuntime
    @ObservationIgnored private var snapshot: AccountsSnapshot?

    init(
        hostID: String,
        hostRepository: (any HostRepository)? = nil,
        repository: any AccountsRepository,
        connectionRuntime: any HostConnectionRuntime
    ) {
        self.hostID = hostID
        self.hostRepository = hostRepository
        self.repository = repository
        self.connectionRuntime = connectionRuntime
    }

    func observe() async {
        guard await hostIsPresent() else { return }
        await withTaskGroup(of: Void.self) { group in
            group.addTask { await self.consumeConnectionSnapshots() }
            group.addTask { await self.consumeAccountUpdates() }
            group.addTask { await self.updateClock() }
            await group.waitForAll()
        }
    }

    func refresh() async {
        await refresh(replacingFailure: snapshot == nil)
    }

    func selectAccount(provider: AccountProvider, accountID: String?) async {
        guard isConnected, busyAccountID == nil else { return }
        let busyID = accountID ?? "\(provider.rawValue):default"
        busyAccountID = busyID
        defer { busyAccountID = nil }
        do {
            try await repository.selectAccount(
                hostID: hostID,
                provider: provider,
                accountID: accountID
            )
            await refresh(replacingFailure: false)
        } catch is CancellationError {
            return
        } catch {
            actionFailure = AccountActionFailure(message: failureMessage(for: error))
        }
    }

    func clearActionFailure() {
        actionFailure = nil
    }

    private func consumeConnectionSnapshots() async {
        let updates = await connectionRuntime.connectionSnapshots(forHostIDs: [hostID])
        for await update in updates {
            guard !Task.isCancelled else { return }
            let connected = update[hostID]?.phase == .connected
            let becameConnected = connected && !isConnected
            isConnected = connected
            guard becameConnected else { continue }
            // Why: list and the stream's ready snapshot share one authoritative payload, but
            // re-fetching on each reconnect also restores the page before resubscription retries.
            await refresh(replacingFailure: snapshot == nil)
        }
    }

    private func hostIsPresent() async -> Bool {
        guard let hostRepository else { return true }
        do {
            guard try await hostRepository.hosts().contains(where: { $0.id == hostID }) else {
                phase = .failed(String(localized: "Host not found"))
                return false
            }
            return true
        } catch is CancellationError {
            return false
        } catch {
            phase = .failed(failureMessage(for: error))
            return false
        }
    }

    private func consumeAccountUpdates() async {
        while !Task.isCancelled {
            guard isConnected else {
                do {
                    try await Task.sleep(for: .milliseconds(200))
                } catch {
                    return
                }
                continue
            }
            do {
                let updates = try await repository.accountUpdates(for: hostID)
                for try await update in updates {
                    guard !Task.isCancelled else { return }
                    publish(update)
                }
            } catch is CancellationError {
                return
            } catch {
                await refresh(replacingFailure: snapshot == nil && isConnected)
            }
            do {
                try await Task.sleep(for: .seconds(2))
            } catch {
                return
            }
        }
    }

    private func updateClock() async {
        while !Task.isCancelled {
            do {
                try await Task.sleep(for: .seconds(60))
            } catch {
                return
            }
            now = Date()
        }
    }

    private func refresh(replacingFailure: Bool) async {
        guard isConnected else { return }
        guard !isRefreshing else { return }
        isRefreshing = true
        defer { isRefreshing = false }
        do {
            publish(try await repository.accounts(for: hostID))
        } catch is CancellationError {
            return
        } catch {
            if replacingFailure {
                phase = .failed(failureMessage(for: error))
            }
        }
    }

    private func publish(_ snapshot: AccountsSnapshot) {
        self.snapshot = snapshot
        phase = .loaded(snapshot)
    }

    private func failureMessage(for error: Error) -> String {
        if let message = (error as? RuntimeServiceError)?.serverMessage, !message.isEmpty {
            return message
        }
        return String(localized: "AgentStart could not load accounts from this host.")
    }
}
