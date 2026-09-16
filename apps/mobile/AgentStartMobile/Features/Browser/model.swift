import Foundation
import Observation

nonisolated enum BrowserTabsPhase: Sendable {
    case loading
    case loaded([BrowserTabSummary])
    case failed(String)
}

nonisolated struct BrowserTabActionFailure: Identifiable, Sendable {
    let id = UUID()
    let message: String
}

@Observable
@MainActor
final class BrowserTabsModel {
    private(set) var phase: BrowserTabsPhase = .loading
    private(set) var isConnected = false
    private(set) var isRefreshing = false
    private(set) var actionFailure: BrowserTabActionFailure?

    var tabs: [BrowserTabSummary] {
        if case .loaded(let tabs) = phase { return tabs }
        return []
    }

    var hasTerminalFailure: Bool {
        if case .failed = phase { return true }
        return false
    }

    @ObservationIgnored private let hostID: String
    @ObservationIgnored private let hostRepository: (any HostRepository)?
    @ObservationIgnored private let repository: any BrowserTabsRepository
    @ObservationIgnored private let connectionRuntime: any HostConnectionRuntime
    @ObservationIgnored private var hasLoadedTabs = false

    init(
        hostID: String,
        hostRepository: (any HostRepository)? = nil,
        repository: any BrowserTabsRepository,
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
            group.addTask { await self.pollTabs() }
            await group.waitForAll()
        }
    }

    func refresh() async {
        await refresh(replacingFailure: !hasLoadedTabs)
    }

    func switchTab(_ tab: BrowserTabSummary) async {
        guard isConnected, !tab.isActive else { return }
        do {
            try await repository.switchBrowserTab(hostID: hostID, pageID: tab.pageID)
            await refresh(replacingFailure: false)
        } catch is CancellationError {
            return
        } catch {
            actionFailure = BrowserTabActionFailure(message: failureMessage(for: error))
        }
    }

    func close(_ tab: BrowserTabSummary) async {
        guard isConnected else { return }
        // Why: closing is answered by the browser, not by the daemon's tab list, so drop the row
        // immediately and let the next refresh reconcile instead of showing a stalled lid.
        remove(tab)
        do {
            try await repository.closeBrowserTab(hostID: hostID, pageID: tab.pageID)
            await refresh(replacingFailure: false)
        } catch is CancellationError {
            return
        } catch {
            actionFailure = BrowserTabActionFailure(message: failureMessage(for: error))
            await refresh(replacingFailure: false)
        }
    }

    func createTab(url: String? = nil) async -> BrowserTabSummary? {
        guard isConnected else { return nil }
        do {
            let pageID = try await repository.createBrowserTab(hostID: hostID, url: url)
            // Why: the host registers the new page a beat after `tab_create` returns, and the poll
            // loop's refresh guard would swallow an immediate one — read the list directly so the
            // caller can land on the tab it just opened.
            for delay in [0, 150, 400, 900] {
                if delay > 0 {
                    do {
                        try await Task.sleep(for: .milliseconds(delay))
                    } catch {
                        return nil
                    }
                }
                guard let listed = try? await repository.browserTabs(for: hostID) else { continue }
                phase = .loaded(listed)
                hasLoadedTabs = true
                if let created = listed.first(where: { $0.pageID == pageID }) {
                    return created
                }
            }
            // Why: the tab exists even when the host has not listed it yet, so open it with the
            // requested URL and let the stream's ready event supply the title.
            return BrowserTabSummary(
                pageID: pageID,
                title: "",
                url: url ?? "",
                isActive: false,
                worktreeID: nil
            )
        } catch is CancellationError {
            return nil
        } catch {
            actionFailure = BrowserTabActionFailure(message: failureMessage(for: error))
            return nil
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
            await refresh(replacingFailure: !hasLoadedTabs)
        }
    }

    // Why: the daemon exposes no tab-list stream to a mobile client, so a page that stayed open
    // would otherwise show tabs that Chrome closed minutes ago. Poll only while connected.
    private func pollTabs() async {
        while !Task.isCancelled {
            if isConnected {
                await refresh(replacingFailure: !hasLoadedTabs)
            }
            do {
                try await Task.sleep(for: .seconds(2))
            } catch {
                return
            }
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

    private func refresh(replacingFailure: Bool) async {
        guard isConnected, !isRefreshing else { return }
        isRefreshing = true
        defer { isRefreshing = false }
        do {
            let tabs = try await repository.browserTabs(for: hostID)
            hasLoadedTabs = true
            phase = .loaded(tabs)
        } catch is CancellationError {
            return
        } catch {
            if replacingFailure {
                phase = .failed(failureMessage(for: error))
            }
        }
    }

    private func remove(_ tab: BrowserTabSummary) {
        guard case .loaded(let tabs) = phase else { return }
        phase = .loaded(tabs.filter { $0.pageID != tab.pageID })
    }

    private func failureMessage(for error: Error) -> String {
        // Why: the daemon tags some failures with machine tokens. Map the ones we know and
        // never render an unknown token or raw transport string.
        workspaceBrowserDisplayMessage(
            runtimeErrorDetail(error),
            fallback: String(localized: "AgentStart could not reach the desktop browser.")
        )
    }
}
