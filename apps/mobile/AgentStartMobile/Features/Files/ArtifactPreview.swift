import Observation
import SwiftUI

nonisolated enum TerminalArtifactPreviewPhase: Sendable {
    case waiting
    case loading
    case ready(WorkspaceFileDocument)
    case failed(LocalizedStringResource)
}

@Observable
@MainActor
final class TerminalArtifactPreviewModel {
    private(set) var phase = TerminalArtifactPreviewPhase.loading
    private(set) var source: TerminalArtifactSource
    private(set) var isConnected = false
    private(set) var baseContent = ""
    private(set) var isSaving = false
    private(set) var errorMessage: LocalizedStringResource?
    var draft = ""
    var isEditing = false

    @ObservationIgnored private let repository: any TerminalFileRepository
    @ObservationIgnored private let connectionRuntime: any HostConnectionRuntime

    init(
        source: TerminalArtifactSource,
        repository: any TerminalFileRepository,
        connectionRuntime: any HostConnectionRuntime
    ) {
        self.source = source
        self.repository = repository
        self.connectionRuntime = connectionRuntime
    }

    var isDirty: Bool { isEditing && draft != baseContent }

    func observe() async {
        let updates = await connectionRuntime.connectionSnapshots(forHostIDs: [source.hostID])
        for await snapshots in updates {
            guard !Task.isCancelled else { return }
            isConnected = snapshots[source.hostID]?.phase == .connected
            if !isConnected {
                if case .ready = phase {} else { phase = .waiting }
            }
        }
    }

    func load() async {
        guard isConnected else {
            if case .ready = phase {} else { phase = .waiting }
            return
        }
        let wasCleanWhenLoadStarted = !isDirty
        guard wasCleanWhenLoadStarted else { return }
        phase = .loading
        errorMessage = nil
        do {
            let loaded = try await repository.loadTerminalArtifact(source)
            guard !Task.isCancelled else { return }
            // Why: the user can start editing while an already-authorized request is in
            // flight. Re-check the draft before applying the response so reconnect or
            // refresh work can never overwrite newer local text.
            guard wasCleanWhenLoadStarted, !isDirty else { return }
            source = loaded.source
            apply(loaded.document)
        } catch is CancellationError {
            return
        } catch {
            phase = .failed("Couldn't load file preview")
        }
    }

    func retry() async {
        guard isConnected else {
            await connectionRuntime.reconnect(hostID: source.hostID)
            return
        }
        await load()
    }

    func beginEditing() {
        guard case .ready(.text(_, let isTruncated, _)) = phase, !isTruncated else { return }
        isEditing = true
    }

    func discardChanges() {
        draft = baseContent
        isEditing = false
        errorMessage = nil
    }

    func save() async {
        guard isDirty, !isSaving else { return }
        guard isConnected else {
            errorMessage = "Waiting for daemon…"
            return
        }
        isSaving = true
        errorMessage = nil
        do {
            source = try await repository.saveTerminalArtifact(
                source,
                content: draft,
                baseContent: baseContent
            )
            baseContent = draft
            phase = .ready(
                .text(content: draft, isTruncated: false, byteLength: Int64(draft.utf8.count))
            )
            isEditing = false
        } catch is CancellationError {
            isSaving = false
            return
        } catch TerminalArtifactError.changedOnHost {
            errorMessage = "File changed on the daemon host. Reload before saving."
        } catch {
            errorMessage = "Couldn't save file"
        }
        isSaving = false
    }

    private func apply(_ document: WorkspaceFileDocument) {
        phase = .ready(document)
        if case .text(let content, let isTruncated, _) = document {
            baseContent = content
            draft = content
            isEditing = !isTruncated
        } else if case .html(let content, let isTruncated) = document {
            baseContent = content
            draft = content
            isEditing = !isTruncated
        }
    }
}

struct TerminalArtifactPreviewView: View {
    @Environment(\.dismiss) private var dismiss
    let target: WorkspaceFilePreviewTarget
    @State private var model: TerminalArtifactPreviewModel
    @State private var showsDiscardConfirmation = false
    @State private var selection: TextSelection?

    init(
        target: WorkspaceFilePreviewTarget,
        source: TerminalArtifactSource,
        repository: any TerminalFileRepository,
        connectionRuntime: any HostConnectionRuntime
    ) {
        self.target = target
        _model = State(
            initialValue: TerminalArtifactPreviewModel(
                source: source,
                repository: repository,
                connectionRuntime: connectionRuntime
            )
        )
    }

    var body: some View {
        VStack(spacing: 0) {
            FilePreviewMetadata(text: target.metadata ?? model.source.pathText)
            Group {
                switch model.phase {
                case .waiting:
                    AppUnavailableState(
                        "Waiting for daemon…",
                        iconID: .wifiSlash,
                        description: Text("Reconnect to load this file.")
                    ) {
                        Button("Retry") { Task { await model.retry() } }
                            .buttonStyle(.glass)
                            .appButtonContext(.regular)
                    }
                case .loading:
                    AgentStartLoader(size: Theme.Control.largeIcon)
                case .failed(let message):
                    AppUnavailableState(
                        "File preview unavailable",
                        iconID: .fileText,
                        description: Text(message)
                    ) {
                        Button("Retry") { Task { await model.retry() } }
                            .buttonStyle(.glass)
                            .appButtonContext(.regular)
                    }
                case .ready(let document):
                    content(document)
                }
            }
            .frame(maxWidth: .infinity, maxHeight: .infinity)
        }
        .background(Theme.Colors.content)
        .navigationTitle(target.title)
        .navigationBarTitleDisplayMode(.inline)
        .navigationBarBackButtonHidden(model.isDirty)
        .disablesInteractivePopGesture(model.isDirty)
        .toolbar { toolbarContent }
        .task {
            await model.observe()
        }
        .task(id: model.isConnected) {
            guard model.isConnected else { return }
            await model.load()
            selection = initialTextSelection(
                in: model.draft,
                line: target.line,
                column: target.column
            )
        }
        .confirmationDialog(
            "Discard local changes?",
            isPresented: $showsDiscardConfirmation,
            titleVisibility: .visible
        ) {
            Button("Discard", role: .destructive) {
                model.discardChanges()
                dismiss()
            }
            Button("Cancel", role: .cancel) {}
        } message: {
            Text("Your unsaved edits on this iPhone will be lost.")
        }
    }

    @ViewBuilder
    private func content(_ document: WorkspaceFileDocument) -> some View {
        if model.isEditing {
            ZStack(alignment: .bottomLeading) {
                TextEditor(text: $model.draft, selection: $selection)
                    .font(.system(size: Theme.Typography.code, design: .monospaced))
                    .foregroundStyle(Theme.Colors.foreground)
                    .scrollContentBackground(.hidden)
                    .padding(.horizontal, Theme.Spacing.medium)
                    .padding(.vertical, Theme.Spacing.small)
                if let message = model.errorMessage {
                    Text(message)
                        .font(.system(size: Theme.Typography.metadata))
                        .foregroundStyle(Theme.Colors.attention)
                        .padding(.horizontal, Theme.Spacing.medium)
                        .frame(minHeight: Theme.Control.regularHeight)
                        .glassEffect(.regular, in: .capsule)
                        .padding(Theme.Spacing.standard)
                }
            }
        } else {
            WorkspaceFileDocumentView(
                document: document,
                title: target.title,
                path: model.source.absolutePath,
                focusLine: target.line
            )
        }
    }

    @ToolbarContentBuilder
    private var toolbarContent: some ToolbarContent {
        if model.isDirty {
            ToolbarItem(placement: .topBarLeading) {
                Button {
                    showsDiscardConfirmation = true
                } label: {
                    AgentStartToolbarIcon(.arrowLeft)
                }
                .accessibilityLabel("Back")
            }
        }
        ToolbarItem(placement: .topBarTrailing) {
            if model.isSaving {
                AgentStartLoader(size: Theme.Control.largeIcon)
                    .accessibilityLabel("Saving file")
            } else if model.isEditing {
                Button("Save") { Task { await model.save() } }
                    .disabled(!model.isDirty)
            }
        }
    }
}

private func initialTextSelection(in content: String, line: Int?, column: Int?) -> TextSelection? {
    guard let line, line > 0 else { return nil }
    var lineStart = content.startIndex
    for _ in 1..<line {
        guard let lineBreak = content[lineStart...].firstIndex(of: "\n") else {
            return TextSelection(insertionPoint: content.endIndex)
        }
        lineStart = content.index(after: lineBreak)
    }
    let lineEnd = content[lineStart...].firstIndex(of: "\n") ?? content.endIndex
    let columnOffset = max(0, (column ?? 1) - 1)
    let insertionPoint = content.index(
        lineStart,
        offsetBy: min(columnOffset, content.distance(from: lineStart, to: lineEnd))
    )
    return TextSelection(insertionPoint: insertionPoint)
}
