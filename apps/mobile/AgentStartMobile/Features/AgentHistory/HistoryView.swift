import SwiftUI

struct AgentHistoryView: View {
    let workspace: WorkspaceSummary
    let showWorkspaceSession: (WorkspaceSummary) -> Void
    @State private var model: AgentHistoryModel
    private let hostID: String
    private let connectionRuntime: any HostConnectionRuntime

    init(
        host: HostProfile,
        workspace: WorkspaceSummary,
        repository: any AgentHistoryRepository,
        workspaceRepository: any WorkspaceRepository,
        connectionRuntime: any HostConnectionRuntime,
        showWorkspaceSession: @escaping (WorkspaceSummary) -> Void
    ) {
        self.hostID = host.id
        self.connectionRuntime = connectionRuntime
        self.workspace = workspace
        self.showWorkspaceSession = showWorkspaceSession
        _model = State(
            initialValue: AgentHistoryModel(
                hostID: host.id,
                workspace: workspace,
                repository: repository,
                workspaceRepository: workspaceRepository,
                connectionRuntime: connectionRuntime
            )
        )
    }

    var body: some View {
        Group {
            switch model.phase {
            case .loading:
                AgentStartLoader(size: Theme.Control.largeIcon)
            case .waiting:
                AppUnavailableState(
                    "History waiting",
                    iconID: .wifiSlash,
                    description: Text("Waiting for daemon…")
                ) {
                    Button("Try again", iconID: .refresh) {
                        Task { await connectionRuntime.reconnect(hostID: hostID) }
                    }
                    .buttonStyle(.glass)
                    .appButtonContext(.regular)
                }
            case .unsupported:
                stateView(
                    title: "Agent Session History Unavailable",
                    description: "Update AgentStart on this host to browse agent session history."
                )
            case .failed:
                stateView(
                    title: "Unable to Load",
                    description: model.failureMessage
                        ?? "AgentStart could not load agent sessions.",
                    retry: true
                )
            case .ready:
                historyContent
            }
        }
        .frame(maxWidth: .infinity, maxHeight: .infinity)
        .background(Theme.Colors.background)
        .navigationTitle("History · \(workspaceLabel)")
        .navigationBarTitleDisplayMode(.inline)
        .toolbar {
            ToolbarItem(placement: .topBarTrailing) {
                Button {
                    Task { await model.load(force: true) }
                } label: {
                    AgentStartToolbarIcon(.refresh)
                }
                .disabled(model.isRefreshing || !model.isConnected)
                .accessibilityLabel("Refresh agent sessions")
            }
        }
        .task { await model.observe() }
    }

    private var historyContent: some View {
        VStack(spacing: 0) {
            scopeStrip
                .padding(.horizontal, Theme.Spacing.medium)
                .padding(.top, Theme.Spacing.small)

            HStack(spacing: Theme.Spacing.small) {
                AgentStartIcon(.search, size: Theme.Control.inlineIcon)
                    .foregroundStyle(Theme.Colors.mutedForeground)
                TextField("Search sessions, repo:, path:", text: $model.query)
                    .font(.system(size: Theme.Typography.supporting))
                    .textInputAutocapitalization(.never)
                    .autocorrectionDisabled()
                if !model.query.isEmpty {
                    Button {
                        model.query = ""
                    } label: {
                        AgentStartIcon(.xCircle)
                            .foregroundStyle(Theme.Colors.mutedForeground)
                    }
                    .buttonStyle(.appPlain)
                    .frame(
                        width: Theme.Size.minimumHitTarget,
                        height: Theme.Size.minimumHitTarget
                    )
                    .contentShape(.interaction, .rect)
                    .accessibilityLabel("Clear search")
                }
            }
            .padding(.horizontal, Theme.Spacing.medium)
            .frame(minHeight: Theme.Size.minimumHitTarget)
            .glassEffect(.regular.interactive(), in: .capsule)
            .padding(.horizontal, Theme.Spacing.medium)
            .padding(.top, Theme.Spacing.small)

            if !model.snapshot.issues.isEmpty {
                statusBanner(
                    model.snapshot.issues.count == 1
                        ? "1 transcript skipped"
                        : "\(model.snapshot.issues.count) transcripts skipped",
                    color: Theme.Colors.unread
                )
            }
            if let resumeMessage = model.resumeMessage {
                statusBanner(String(localized: resumeMessage), color: Theme.Colors.mutedForeground)
            }

            if model.groups.isEmpty {
                stateView(
                    title: "No agent sessions",
                    description: model.query.isEmpty
                        ? "No past agent sessions in this scope."
                        : "No sessions match your search."
                )
            } else {
                ScrollView {
                    LazyVStack(spacing: 0) {
                        ForEach(model.groups) { group in
                            section(group)
                        }
                    }
                    .padding(.horizontal, Theme.Spacing.medium)
                    .padding(.top, Theme.Spacing.small)
                    .padding(.bottom, Theme.Spacing.extraLarge)
                }
                .refreshable { await model.load(force: true) }
            }
        }
    }

    private var scopeStrip: some View {
        HStack(spacing: Theme.Spacing.extraSmall) {
            scopeButton("Workspace", scope: .workspace)
            scopeButton("Project", scope: .project)
            scopeButton("All", scope: .all)
        }
        .padding(Theme.Spacing.extraSmall)
        .background(Theme.Colors.secondary, in: .rect(cornerRadius: Theme.Radius.control))
        .accessibilityElement(children: .contain)
        .accessibilityLabel("Agent session scope")
    }

    private func scopeButton(
        _ title: LocalizedStringKey,
        scope: AgentHistoryScope
    ) -> some View {
        let isSelected = model.scope == scope
        return Button {
            Task { await model.selectScope(scope) }
        } label: {
            Text(title)
                .font(.system(size: Theme.Typography.metadata, weight: .regular))
                .foregroundStyle(
                    isSelected ? Theme.Colors.foreground : Theme.Colors.mutedForeground
                )
                .frame(maxWidth: .infinity)
                .frame(height: Theme.Control.inlineHeight)
                .background(
                    isSelected ? Theme.Colors.selection : Color.clear,
                    in: .rect(cornerRadius: Theme.Radius.control)
                )
        }
        .buttonStyle(.appPlain)
        .frame(minHeight: Theme.Size.minimumHitTarget)
        .contentShape(.interaction, .rect)
        .accessibilityAddTraits(isSelected ? .isSelected : [])
    }

    private func section(_ group: AgentHistoryGroup) -> some View {
        VStack(spacing: 0) {
            HStack(spacing: Theme.Spacing.small) {
                Text(verbatim: group.label.uppercased())
                    .lineLimit(1)
                Text(verbatim: "\(group.sessions.count)")
                Spacer()
            }
            .font(.system(size: Theme.Typography.metadata, weight: .regular))
            .foregroundStyle(Theme.Colors.mutedForeground)
            .padding(.vertical, Theme.Spacing.small)

            ForEach(group.sessions) { session in
                AgentHistorySessionRow(
                    session: session,
                    isExpanded: model.expandedSessionID == session.id,
                    showsCurrentWorkspace: model.scope != .workspace,
                    isCurrentWorkspace: isCurrentWorkspace(session),
                    isResuming: model.resumingSessionID == session.id,
                    isResumeDisabled: model.resumingSessionID != nil,
                    toggle: { model.toggle(session) },
                    resume: {
                        Task {
                            if let target = await model.resume(session) {
                                showWorkspaceSession(target)
                            }
                        }
                    }
                )
            }
        }
    }

    private func statusBanner(_ text: String, color: Color) -> some View {
        ContentSurface {
            Text(verbatim: text)
                .font(.system(size: Theme.Typography.metadata, weight: .regular))
                .foregroundStyle(color)
        }
        .padding(.horizontal, Theme.Spacing.medium)
        .padding(.top, Theme.Spacing.small)
    }

    private func stateView(
        title: LocalizedStringResource,
        description: LocalizedStringResource,
        retry: Bool = false
    ) -> some View {
        AppUnavailableState(
            title: Text(title),
            iconID: retry ? .warning : .clock,
            description: Text(description)
        ) {
            if retry {
                Button("Retry", iconID: .refresh) {
                    Task { await model.retry() }
                }
                .buttonStyle(.glass)
                .appButtonContext(.regular)
            }
        }
        .frame(maxWidth: .infinity, maxHeight: .infinity)
    }

    private func isCurrentWorkspace(_ session: AgentHistorySession) -> Bool {
        guard let cwd = session.cwd else { return false }
        return AgentHistorySessionFilter.scopePaths(
            scope: .workspace,
            workspace: workspace,
            workspaces: [workspace]
        ).contains { path in
            let base = path.replacingOccurrences(of: "\\", with: "/").lowercased()
            let candidate = cwd.replacingOccurrences(of: "\\", with: "/").lowercased()
            return candidate == base || candidate.hasPrefix("\(base)/")
        }
    }

    private var workspaceLabel: String {
        let current = model.currentWorkspace
        return current.name.isEmpty ? current.repoName : current.name
    }
}
