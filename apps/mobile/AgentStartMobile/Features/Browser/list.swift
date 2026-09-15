import SwiftUI

struct BrowserTabsView: View {
    let host: HostProfile
    @State private var model: BrowserTabsModel
    @State private var didCreateInitialTab = false

    private let createsTabOnAppear: Bool
    private let initialTabURL: String?
    private let showTab: (BrowserTabSummary) -> Void

    init(
        host: HostProfile,
        hostRepository: (any HostRepository)? = nil,
        repository: any BrowserTabsRepository,
        connectionRuntime: any HostConnectionRuntime,
        createsTabOnAppear: Bool = false,
        initialTabURL: String? = nil,
        showTab: @escaping (BrowserTabSummary) -> Void
    ) {
        self.host = host
        self.createsTabOnAppear = createsTabOnAppear
        self.initialTabURL = initialTabURL
        self.showTab = showTab
        _model = State(
            initialValue: BrowserTabsModel(
                hostID: host.id,
                hostRepository: hostRepository,
                repository: repository,
                connectionRuntime: connectionRuntime
            )
        )
    }

    var body: some View {
        // Why: every phase sits inside one refreshable scroll view, so a first load that failed
        // while the host was still connecting is never a dead end.
        ScrollView {
            if !model.isConnected, !hasLoadedTabs, !model.hasTerminalFailure {
                placeholder {
                    AgentStartLoader(size: Theme.Control.largeIcon)
                    Text("Connecting to \(host.name)…")
                        .font(.system(size: Theme.Typography.supporting))
                        .foregroundStyle(Theme.Colors.mutedForeground)
                }
            } else {
                switch model.phase {
                case .loading:
                    placeholder {
                        AgentStartLoader(size: Theme.Control.largeIcon)
                        Text("Loading browser tabs…")
                            .font(.system(size: Theme.Typography.supporting))
                            .foregroundStyle(Theme.Colors.mutedForeground)
                    }
                case .failed(let message):
                    placeholder {
                        AppUnavailableState(
                            "Browser unavailable",
                            iconID: .warning,
                            description: Text(verbatim: message)
                        ) {
                            Button("Try again") { Task { await model.refresh() } }
                                .buttonStyle(.glass)
                                .appButtonContext(.regular)
                        }
                    }
                case .loaded(let tabs):
                    if tabs.isEmpty {
                        placeholder {
                            AppUnavailableState(
                                "No browser tabs",
                                iconID: .globe,
                                description: Text(
                                    "Open a tab in the desktop browser that runs the AgentStart extension."
                                )
                            )
                        }
                    } else {
                        tabList(tabs)
                    }
                }
            }
        }
        .refreshable { await model.refresh() }
        .background { AppBackground() }
        .navigationTitle("Browser · \(host.name)")
        .navigationBarTitleDisplayMode(.inline)
        .toolbar {
            ToolbarItem(placement: .topBarTrailing) {
                Button {
                    Task { await model.refresh() }
                } label: {
                    AgentStartToolbarIcon(.refresh)
                }
                .disabled(!model.isConnected || model.isRefreshing)
                .accessibilityLabel("Refresh browser tabs")
            }
            ToolbarSpacer(.fixed, placement: .topBarTrailing)
            ToolbarItem(placement: .topBarTrailing) {
                Button {
                    Task {
                        if let created = await model.createTab() {
                            showTab(created)
                        }
                    }
                } label: {
                    AgentStartToolbarIcon(.add)
                }
                .disabled(!model.isConnected)
                .accessibilityLabel("New browser tab")
            }
        }
        .alert(item: Binding(get: { model.actionFailure }, set: { _ in })) { failure in
            Alert(
                title: Text("Browser action failed"),
                message: Text(verbatim: failure.message),
                dismissButton: .default(Text("OK"), action: model.clearActionFailure)
            )
        }
        .task { await model.observe() }
        .task(id: model.isConnected) { await createInitialTabIfNeeded() }
    }

    // Why: `agentstart://h/<host>/browser?action=newTab` promises a new desktop tab, so the page
    // opens that tab once the host is reachable and lands on it instead of an empty list.
    private func createInitialTabIfNeeded() async {
        guard createsTabOnAppear, !didCreateInitialTab, model.isConnected else { return }
        didCreateInitialTab = true
        if let created = await model.createTab(url: initialTabURL) {
            showTab(created)
        }
    }

    private var hasLoadedTabs: Bool {
        if case .loaded = model.phase { return true }
        return false
    }

    private func tabList(_ tabs: [BrowserTabSummary]) -> some View {
        LazyVStack(spacing: 0) {
            ForEach(tabs) { tab in
                BrowserTabRow(
                    tab: tab,
                    open: { showTab(tab) },
                    showOnDesktop: { Task { await model.switchTab(tab) } },
                    close: { Task { await model.close(tab) } }
                )
            }
        }
        .padding(.horizontal, Theme.Spacing.page)
        .padding(.top, Theme.Spacing.small)
        .padding(.bottom, Theme.Spacing.extraLarge)
    }

    private func placeholder<Content: View>(
        @ViewBuilder content: () -> Content
    ) -> some View {
        VStack(spacing: Theme.Spacing.small, content: content)
            .padding(.vertical, Theme.Spacing.extraLarge * 2)
            .padding(.horizontal, Theme.Spacing.extraLarge)
            .frame(maxWidth: .infinity, alignment: .top)
    }
}

private struct BrowserTabRow: View {
    let tab: BrowserTabSummary
    let open: () -> Void
    let showOnDesktop: () -> Void
    let close: () -> Void

    var body: some View {
        Button(action: open) {
            HStack(spacing: Theme.Spacing.small) {
                AgentStartIcon(.globe, size: Theme.Control.inlineIcon)
                    .foregroundStyle(Theme.Colors.mutedForeground)
                    .frame(width: Theme.Control.regularIcon)

                VStack(alignment: .leading, spacing: Theme.Spacing.extraSmall) {
                    Text(verbatim: tab.displayTitle)
                        .font(.system(size: Theme.Typography.supporting))
                        .foregroundStyle(Theme.Colors.foreground)
                        .lineLimit(1)
                    Text(verbatim: tab.displayURL)
                        .font(.system(size: Theme.Typography.metadata))
                        .foregroundStyle(Theme.Colors.mutedForeground)
                        .lineLimit(1)
                }
                .frame(maxWidth: .infinity, alignment: .leading)

                if tab.isActive {
                    Text("Active")
                        .font(.system(size: Theme.Typography.metadata))
                        .foregroundStyle(Theme.Colors.foreground)
                        .padding(.horizontal, Theme.Spacing.small)
                        .padding(.vertical, Theme.Spacing.extraSmall)
                        .background(Theme.Colors.selection, in: .capsule)
                }
            }
            .padding(.vertical, Theme.Spacing.medium)
            .frame(minHeight: Theme.Size.minimumHitTarget)
            .contentShape(Rectangle())
        }
        .buttonStyle(.appPlain)
        .contextMenu {
            Button {
                showOnDesktop()
            } label: {
                Label("Show on desktop", iconID: .monitor)
            }
            Button(role: .destructive) {
                close()
            } label: {
                Label("Close Tab", iconID: .trash)
            }
        }
        .overlay(alignment: .bottom) {
            Rectangle()
                .fill(Theme.Colors.divider)
                .frame(height: Theme.Size.hairline)
        }
    }
}
