import Observation
import UIKit

nonisolated enum WorkspaceMarkdownPhase: Sendable {
    case loading
    case ready
    case failed
}

@Observable
@MainActor
final class WorkspaceMarkdownModel {
    private(set) var phase = WorkspaceMarkdownPhase.loading
    private(set) var content = ""
    private(set) var localContent = ""
    private(set) var version = ""
    private(set) var isEditable = false
    private(set) var isHostDirty = false
    private(set) var readOnlyReason: WorkspaceMarkdownReadOnlyReason?
    private(set) var isStale = false
    private(set) var isSaving = false
    private(set) var saveError: String?

    @ObservationIgnored private let hostID: String
    @ObservationIgnored private let worktreeID: String
    @ObservationIgnored private let tab: TerminalWorkspaceTab
    @ObservationIgnored private let repository: any WorkspaceContentRepository
    @ObservationIgnored private var loadedDocumentVersion: String?

    init(
        hostID: String,
        worktreeID: String,
        tab: TerminalWorkspaceTab,
        repository: any WorkspaceContentRepository
    ) {
        self.hostID = hostID
        self.worktreeID = worktreeID
        self.tab = tab
        self.repository = repository
    }

    var isDirty: Bool { localContent != content }
    var tabID: String { tab.id }
    var title: String { tab.title }

    func synchronize(_ descriptor: WorkspaceMarkdownTab) async {
        if loadedDocumentVersion == nil {
            await load(descriptor)
            return
        }
        guard loadedDocumentVersion != descriptor.documentVersion else { return }
        loadedDocumentVersion = descriptor.documentVersion
        if isDirty {
            isStale = true
        } else {
            await load(descriptor)
        }
    }

    func load(_ descriptor: WorkspaceMarkdownTab) async {
        phase = .loading
        saveError = nil
        do {
            let document = try await repository.readWorkspaceMarkdown(
                for: hostID,
                worktreeID: worktreeID,
                tab: tab,
                descriptor: descriptor
            )
            guard !Task.isCancelled else { return }
            apply(document)
            loadedDocumentVersion = descriptor.documentVersion
        } catch is CancellationError {
            return
        } catch {
            phase = .failed
        }
    }

    func update(_ value: String) {
        guard isEditable, !isSaving else { return }
        localContent = value
        saveError = nil
    }

    func save() async {
        guard isEditable, isDirty, !isSaving else { return }
        isSaving = true
        saveError = nil
        defer { isSaving = false }
        do {
            let document = try await repository.saveWorkspaceMarkdown(
                for: hostID,
                worktreeID: worktreeID,
                tabID: tab.id,
                baseVersion: version,
                content: localContent
            )
            guard !Task.isCancelled else { return }
            apply(document)
            loadedDocumentVersion = document.version
        } catch is CancellationError {
            return
        } catch {
            saveError = String(localized: "Save failed")
        }
    }

    func copy() {
        UIPasteboard.general.string = localContent
    }

    func discard(_ descriptor: WorkspaceMarkdownTab) async {
        await load(descriptor)
    }

    private func apply(_ document: WorkspaceMarkdownDocument) {
        content = document.content
        localContent = document.content
        version = document.version
        isEditable = document.editable
        isHostDirty = document.isHostDirty
        readOnlyReason = document.readOnlyReason
        isStale = false
        saveError = nil
        phase = .ready
    }
}
