import SwiftUI

struct AccountView: View {
    let host: HostProfile
    @State private var model: AccountModel

    init(
        host: HostProfile,
        hostRepository: (any HostRepository)? = nil,
        repository: any AccountsRepository,
        connectionRuntime: any HostConnectionRuntime
    ) {
        self.host = host
        _model = State(
            initialValue: AccountModel(
                hostID: host.id,
                hostRepository: hostRepository,
                repository: repository,
                connectionRuntime: connectionRuntime
            )
        )
    }

    var body: some View {
        // Why: every phase — connecting, loading, failed, loaded — sits inside the same
        // refreshable scroll view, so pull-to-refresh is available even before any snapshot
        // has loaded. A failed first load must not become a dead end.
        ScrollView {
            if !model.isConnected, !hasLoadedSnapshot, !model.hasTerminalFailure {
                accountPlaceholder {
                    AgentStartLoader(size: Theme.Control.largeIcon)
                    Text("Connecting to \(host.name)…")
                        .font(.system(size: Theme.Typography.supporting))
                        .foregroundStyle(Theme.Colors.mutedForeground)
                }
            } else {
                switch model.phase {
                case .loading:
                    accountPlaceholder {
                        AgentStartLoader(size: Theme.Control.largeIcon)
                        Text("Loading accounts…")
                            .font(.system(size: Theme.Typography.supporting))
                            .foregroundStyle(Theme.Colors.mutedForeground)
                    }
                case .failed(let message):
                    accountPlaceholder {
                        AppUnavailableState(
                            "Accounts unavailable",
                            iconID: .warning,
                            description: Text(verbatim: message)
                        ) {
                            Button("Try again") { Task { await model.refresh() } }
                                .buttonStyle(.glass)
                                .appButtonContext(.regular)
                        }
                    }
                case .loaded(let snapshot):
                    accountSections(snapshot)
                }
            }
        }
        .refreshable { await model.refresh() }
        .background { AppBackground() }
        .navigationTitle("Accounts · \(host.name)")
        .navigationBarTitleDisplayMode(.inline)
        .toolbar {
            ToolbarItem(placement: .topBarTrailing) {
                Button {
                    Task { await model.refresh() }
                } label: {
                    AgentStartToolbarIcon(.refresh)
                }
                .disabled(!model.isConnected || model.isRefreshing)
                .accessibilityLabel("Refresh accounts")
            }
        }
        .alert(item: Binding(get: { model.actionFailure }, set: { _ in })) { failure in
            Alert(
                title: Text("Could not switch account"),
                message: Text(verbatim: failure.message),
                dismissButton: .default(Text("OK"), action: model.clearActionFailure)
            )
        }
        .task { await model.observe() }
    }

    private var hasLoadedSnapshot: Bool {
        if case .loaded = model.phase { return true }
        return false
    }

    private func accountSections(_ snapshot: AccountsSnapshot) -> some View {
        LazyVStack(spacing: Theme.Spacing.large) {
            ForEach(snapshot.sections) { section in
                AccountUsageSection(
                    section: section,
                    now: model.now,
                    busyAccountID: model.busyAccountID,
                    isConnected: model.isConnected,
                    selectAccount: { accountID in
                        Task {
                            await model.selectAccount(
                                provider: section.provider,
                                accountID: accountID
                            )
                        }
                    }
                )
            }
            Text("Add or re-authenticate agent accounts on the daemon host.")
                .font(.system(size: Theme.Typography.metadata))
                .foregroundStyle(Theme.Colors.mutedForeground)
                .lineSpacing(Theme.Spacing.extraSmall)
                .frame(maxWidth: .infinity, alignment: .leading)
                .padding(.horizontal, Theme.Spacing.small)
                .padding(.top, Theme.Spacing.small)
        }
        .padding(.horizontal, Theme.Spacing.page)
        .padding(.top, Theme.Spacing.small)
        .padding(.bottom, Theme.Spacing.extraLarge)
    }

    private func accountPlaceholder<Content: View>(
        @ViewBuilder content: () -> Content
    ) -> some View {
        VStack(spacing: Theme.Spacing.small, content: content)
            .padding(.vertical, Theme.Spacing.extraLarge * 2)
            .padding(.horizontal, Theme.Spacing.extraLarge)
            .frame(maxWidth: .infinity, alignment: .top)
    }
}
