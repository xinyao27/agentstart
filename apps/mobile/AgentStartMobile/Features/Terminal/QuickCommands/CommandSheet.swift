import SwiftUI

struct TerminalQuickCommandSheet: View {
    @Environment(\.dismiss) private var dismiss
    @State private var model: TerminalQuickCommandModel
    @State private var editorTarget: TerminalQuickCommandEditorTarget?
    @State private var deleteTarget: TerminalQuickCommand?
    @State private var launchingID: String?
    @FocusState private var isSearchFocused: Bool
    private let repoID: String?
    private let repoName: String?
    private let launch: (TerminalQuickCommand) async -> Bool

    init(
        hostID: String,
        repoID: String?,
        repoName: String?,
        repository: any TerminalQuickCommandRepository,
        launch: @escaping (TerminalQuickCommand) async -> Bool
    ) {
        self.repoID = repoID
        self.repoName = repoName
        self.launch = launch
        _model = State(
            initialValue: TerminalQuickCommandModel(
                hostID: hostID,
                repoID: repoID,
                repository: repository
            )
        )
    }

    var body: some View {
        NavigationStack {
            Group {
                switch model.phase {
                case .idle, .loading:
                    AgentStartLoader(size: Theme.Control.largeIcon)
                case .unsupported:
                    AppUnavailableState(
                        "Quick Commands Unavailable",
                        iconID: .remove,
                        description: Text("Update the paired daemon to use Quick Commands.")
                    )
                case .failed:
                    AppUnavailableState("Quick Commands Unavailable", iconID: .wifiSlash) {
                        Button("Try again") { Task { await model.load() } }
                            .buttonStyle(.glass)
                            .appButtonContext(.regular)
                    }
                case .ready:
                    commandList
                }
            }
            .background(Theme.Colors.background)
            .navigationTitle(Text("Quick Commands"))
            .navigationBarTitleDisplayMode(.inline)
            .toolbar {
                SheetDismissToolbarItem(
                    accessibilityLabel: "Close quick commands",
                    action: dismiss.callAsFunction
                )
            }
        }
        .appSheetPresentation(.page)
        .task { await model.load() }
        .sheet(item: $editorTarget) { target in
            TerminalQuickCommandEditor(
                command: target.command,
                repoID: repoID,
                repoName: repoName,
                save: model.save
            )
        }
        .confirmationDialog(
            deleteTarget.map {
                String(localized: "Delete \($0.label.isEmpty ? "Untitled" : $0.label)?")
            }
                ?? "",
            isPresented: Binding(
                get: { deleteTarget != nil },
                set: { if !$0 { deleteTarget = nil } }
            ),
            titleVisibility: .visible
        ) {
            Button("Delete", role: .destructive) {
                guard let target = deleteTarget else { return }
                deleteTarget = nil
                Task { await model.delete(target) }
            }
            Button("Cancel", role: .cancel) { deleteTarget = nil }
        } message: {
            Text("This quick command will be removed from your saved list.")
        }
    }

    private var commandList: some View {
        ScrollView {
            LazyVStack(alignment: .leading, spacing: Theme.Spacing.medium) {
                if shouldShowSearch {
                    searchField
                }
                if let error = model.errorMessage {
                    Text(error)
                        .font(.system(size: Theme.Typography.metadata))
                        .foregroundStyle(Theme.Colors.attention)
                }
                if model.availableCommands.isEmpty {
                    Text("No quick commands yet.")
                        .font(.system(size: Theme.Typography.supporting))
                        .foregroundStyle(Theme.Colors.mutedForeground)
                } else if model.visibleCommands.isEmpty {
                    Text("No matching quick commands.")
                        .font(.system(size: Theme.Typography.supporting))
                        .foregroundStyle(Theme.Colors.mutedForeground)
                }
                if !model.repositoryCommands.isEmpty {
                    commandGroup(title: "THIS PROJECT", commands: model.repositoryCommands)
                }
                if !model.globalCommands.isEmpty {
                    commandGroup(title: "GLOBAL", commands: model.globalCommands)
                }
                addButton
            }
            .padding(.horizontal, Theme.Spacing.page)
            .padding(.top, Theme.Spacing.small)
            .padding(.bottom, Theme.Spacing.extraLarge)
        }
        .scrollIndicators(.hidden)
        .disabled(model.isMutating || launchingID != nil)
    }

    private var shouldShowSearch: Bool {
        model.availableCommands.count > 1 || !model.query.isEmpty
    }

    private var searchField: some View {
        HStack(spacing: Theme.Spacing.small) {
            AgentStartIcon(.search, size: Theme.Control.inlineIcon)
                .foregroundStyle(
                    isSearchFocused ? Theme.Colors.foreground : Theme.Colors.mutedForeground
                )
                .frame(width: Theme.Control.inlineIcon)
            TextField("Search quick commands...", text: Bindable(model).query)
                .font(.system(size: Theme.Typography.supporting))
                .foregroundStyle(Theme.Colors.foreground)
                .textInputAutocapitalization(.never)
                .autocorrectionDisabled()
                .submitLabel(.search)
                .focused($isSearchFocused)
                .accessibilityLabel("Search quick commands...")
            if !model.query.isEmpty {
                Button {
                    model.query = ""
                    isSearchFocused = true
                } label: {
                    AgentStartIcon(.x, size: Theme.Control.inlineIcon)
                        .foregroundStyle(Theme.Colors.background)
                        .frame(
                            width: Theme.Control.inlineHeight,
                            height: Theme.Control.inlineHeight
                        )
                        .background(Theme.Colors.mutedForeground, in: Circle())
                }
                .buttonStyle(.appPlain)
                .frame(width: Theme.Size.minimumHitTarget, height: Theme.Size.minimumHitTarget)
                .contentShape(.interaction, .rect)
                .accessibilityLabel("Clear search")
            }
        }
        .padding(.leading, Theme.Spacing.medium)
        .padding(.trailing, Theme.Spacing.extraSmall)
        .frame(height: Theme.Size.minimumHitTarget)
        .glassEffect(.regular.interactive(), in: .capsule)
    }

    private func commandGroup(
        title: LocalizedStringResource,
        commands: [TerminalQuickCommand]
    ) -> some View {
        VStack(alignment: .leading, spacing: Theme.Spacing.extraSmall) {
            Text(title)
                .font(.system(size: Theme.Typography.metadata, weight: .semibold))
                .tracking(0.7)
                .foregroundStyle(Theme.Colors.mutedForeground)
            ContentSurface {
                VStack(spacing: 0) {
                    ForEach(Array(commands.enumerated()), id: \.element.id) { index, command in
                        if index > 0 {
                            commandDivider
                        }
                        commandRow(command)
                    }
                }
            }
        }
    }

    private var commandDivider: some View {
        Rectangle()
            .fill(Theme.Colors.divider)
            .frame(height: Theme.Size.hairline)
    }

    private var addButton: some View {
        Button {
            guard model.canAdd else { return }
            editorTarget = TerminalQuickCommandEditorTarget(command: nil)
        } label: {
            HStack(spacing: Theme.Spacing.small) {
                AgentStartIcon(.add, size: Theme.Control.regularIcon)
                    .foregroundStyle(Theme.Colors.mutedForeground)
                Text(model.hasReachedLimit ? "Quick command limit reached" : "New quick command")
                    .font(.system(size: Theme.Typography.supporting, weight: .regular))
                    .foregroundStyle(Theme.Colors.foreground)
                Spacer(minLength: 0)
            }
            .padding(.horizontal, Theme.Spacing.medium)
            .frame(minHeight: Theme.Size.minimumHitTarget, alignment: .leading)
            .contentShape(.rect)
        }
        .buttonStyle(.appPlain)
        .glassEffect(.regular.interactive(), in: .rect(cornerRadius: Theme.Radius.control))
        .disabled(!model.canAdd)
        .opacity(model.canAdd ? 1 : 0.45)
        .accessibilityLabel(
            model.hasReachedLimit ? "Quick command limit reached" : "New quick command"
        )
    }

    private func commandRow(_ command: TerminalQuickCommand) -> some View {
        HStack(spacing: Theme.Spacing.small) {
            Button {
                launchingID = command.id
                Task {
                    let didLaunch = await launch(command)
                    launchingID = nil
                    if didLaunch { dismiss() }
                }
            } label: {
                HStack(spacing: Theme.Spacing.small) {
                    commandIcon(command)
                    VStack(alignment: .leading, spacing: Theme.Spacing.extraSmall) {
                        Text(verbatim: command.label)
                            .font(
                                .system(
                                    size: Theme.Typography.supporting,
                                    weight: .semibold
                                )
                            )
                            .foregroundStyle(Theme.Colors.foreground)
                            .lineLimit(1)
                        Text(verbatim: command.displayPreview)
                            .font(
                                .system(
                                    size: Theme.Typography.metadata,
                                    design: command.agentID == nil ? .monospaced : .default
                                )
                            )
                            .foregroundStyle(Theme.Colors.mutedForeground)
                            .lineLimit(1)
                    }
                    Spacer(minLength: 0)
                    if launchingID == command.id {
                        AgentStartLoader(size: Theme.Control.inlineIcon)
                    }
                }
                .frame(maxWidth: .infinity, minHeight: 52, alignment: .leading)
                .contentShape(.rect)
            }
            .buttonStyle(.appPlain)
            .accessibilityLabel("Run \(command.label)")

            HStack(spacing: Theme.Glass.groupSpacing) {
                GlassIconButton(
                    iconName: .edit,
                    accessibilityLabel: "Edit \(command.label)",
                    context: .inline
                ) {
                    editorTarget = TerminalQuickCommandEditorTarget(command: command)
                }
                GlassIconButton(
                    iconName: .trash,
                    accessibilityLabel: "Delete \(command.label)",
                    context: .inline,
                    isDestructive: true
                ) {
                    deleteTarget = command
                }
            }
        }
    }

    @ViewBuilder
    private func commandIcon(_ command: TerminalQuickCommand) -> some View {
        if let agentID = command.agentID {
            AgentMark(agentID: agentID, size: 16)
                .frame(width: 28, height: 28)
        } else {
            AgentStartIcon(.play, size: 14)
                .foregroundStyle(Theme.Colors.foreground)
                .frame(width: 28, height: 28)
        }
    }
}

nonisolated private struct TerminalQuickCommandEditorTarget: Identifiable {
    let id = UUID()
    let command: TerminalQuickCommand?
}
