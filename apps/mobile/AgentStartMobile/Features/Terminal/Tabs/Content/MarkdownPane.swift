import SwiftUI

struct WorkspaceMarkdownPane: View {
    let descriptor: WorkspaceMarkdownTab
    let refreshID: Int
    let draftChanged: (WorkspaceMarkdownDraft?) -> Void
    @State private var model: WorkspaceMarkdownModel
    @State private var showsDiscardConfirmation = false

    init(
        hostID: String,
        worktreeID: String,
        tab: TerminalWorkspaceTab,
        descriptor: WorkspaceMarkdownTab,
        repository: any WorkspaceContentRepository,
        refreshID: Int = 0,
        draftChanged: @escaping (WorkspaceMarkdownDraft?) -> Void
    ) {
        self.descriptor = descriptor
        self.refreshID = refreshID
        self.draftChanged = draftChanged
        _model = State(
            initialValue: WorkspaceMarkdownModel(
                hostID: hostID,
                worktreeID: worktreeID,
                tab: tab,
                repository: repository
            )
        )
    }

    var body: some View {
        Group {
            switch model.phase {
            case .loading:
                AgentStartLoader(size: Theme.Control.largeIcon)
                    .frame(maxWidth: .infinity, maxHeight: .infinity)
            case .failed:
                AppUnavailableState("Couldn't load markdown", iconID: .fileText) {
                    Button("Retry") { Task { await model.load(descriptor) } }
                        .buttonStyle(.glass)
                        .appButtonContext(.regular)
                }
            case .ready:
                editor
            }
        }
        .background(Theme.Colors.content)
        .task(id: descriptor.documentVersion) { await model.synchronize(descriptor) }
        .onChange(of: refreshID) { _, _ in
            if model.isDirty {
                showsDiscardConfirmation = true
            } else {
                Task { await model.load(descriptor) }
            }
        }
        .onChange(of: model.localContent) { _, _ in publishDraft() }
        .onChange(of: model.content) { _, _ in publishDraft() }
        .onDisappear { draftChanged(nil) }
        .confirmationDialog(
            "Discard local changes?",
            isPresented: $showsDiscardConfirmation,
            titleVisibility: .visible
        ) {
            Button("Discard", role: .destructive) {
                Task { await model.discard(descriptor) }
            }
            Button("Cancel", role: .cancel) {}
        } message: {
            Text("Your unsaved edits on this iPhone will be replaced by the latest document.")
        }
    }

    private func publishDraft() {
        guard model.isDirty else {
            draftChanged(nil)
            return
        }
        draftChanged(
            WorkspaceMarkdownDraft(
                tabID: model.tabID,
                title: model.title,
                content: model.localContent
            )
        )
    }

    private var editor: some View {
        ZStack(alignment: .bottomTrailing) {
            TextEditor(
                text: Binding(
                    get: { model.localContent },
                    set: { value in model.update(value) }
                )
            )
            .font(.system(size: Theme.Typography.code, design: .monospaced))
            .foregroundStyle(Theme.Colors.foreground)
            .scrollContentBackground(.hidden)
            .padding(.horizontal, Theme.Spacing.medium)
            .padding(.vertical, Theme.Spacing.small)
            .disabled(!model.isEditable || model.isSaving)

            if showsFloatingActions {
                VStack(alignment: .trailing, spacing: 4) {
                    if let statusMessage {
                        Text(verbatim: statusMessage)
                            .font(.system(size: Theme.Typography.metadata))
                            .foregroundStyle(
                                model.saveError == nil
                                    ? Theme.Colors.mutedForeground : Theme.Colors.attention
                            )
                            .lineLimit(2)
                            .padding(.horizontal, Theme.Spacing.small)
                            .padding(.vertical, Theme.Spacing.extraSmall)
                            .glassEffect(
                                .regular,
                                in: .rect(cornerRadius: Theme.Radius.control)
                            )
                    }
                    HStack(spacing: Theme.Spacing.small) {
                        if !model.isEditable || model.saveError != nil {
                            Button("Copy") { model.copy() }
                                .buttonStyle(.glass)
                                .appButtonContext(.regular)
                        }
                        if (!model.isDirty && model.isStale) || !model.isEditable {
                            Button("Refresh") { requestRefresh() }
                                .buttonStyle(.glass)
                                .appButtonContext(.regular)
                        }
                        if model.isDirty {
                            Button("Discard", role: .destructive) {
                                showsDiscardConfirmation = true
                            }
                            .buttonStyle(.glass)
                            .appButtonContext(.regular)
                        }
                        if model.isSaving {
                            AgentStartLoader(size: Theme.Control.largeIcon)
                                .frame(
                                    width: Theme.Size.minimumHitTarget,
                                    height: Theme.Size.minimumHitTarget
                                )
                        } else if model.isDirty {
                            Button("Save") { Task { await model.save() } }
                                .appProminentGlassButton()
                                .appButtonContext(.regular)
                                .disabled(!model.isEditable)
                        }
                    }
                }
                .padding(Theme.Spacing.standard)
            }
        }
    }

    private var showsFloatingActions: Bool {
        statusMessage != nil || model.isDirty || model.isSaving || !model.isEditable
    }

    private func requestRefresh() {
        if model.isDirty {
            showsDiscardConfirmation = true
        } else {
            Task { await model.load(descriptor) }
        }
    }

    private var statusMessage: String? {
        if let saveError = model.saveError { return saveError }
        if model.isStale { return String(localized: "Changed on the daemon host") }
        guard let reason = model.readOnlyReason else { return nil }
        switch reason {
        case .unsupportedPreview: return String(localized: "This preview is read only.")
        case .unsupportedTab:
            return String(localized: "This document cannot be edited on mobile.")
        case .unsupportedUntitled:
            return String(localized: "Untitled documents are read only on mobile.")
        case .fileTooLarge, .diskFileTooLarge:
            return String(localized: "File too large for mobile editing.")
        case .desktopUnavailable:
            return String(localized: "Editing needs the AgentStart daemon running.")
        case .desktopHasUnsavedChanges:
            return String(localized: "The daemon reports unsaved changes. Showing disk content.")
        }
    }
}
