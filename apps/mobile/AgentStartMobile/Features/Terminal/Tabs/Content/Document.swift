import Foundation

nonisolated enum WorkspaceMarkdownReadOnlyReason: Sendable {
    case unsupportedPreview
    case unsupportedTab
    case unsupportedUntitled
    case fileTooLarge
    case desktopUnavailable
    case desktopHasUnsavedChanges
    case diskFileTooLarge
}

nonisolated struct WorkspaceMarkdownDocument: Sendable {
    let content: String
    let version: String
    let editable: Bool
    let isHostDirty: Bool
    let readOnlyReason: WorkspaceMarkdownReadOnlyReason?
}

nonisolated struct WorkspaceMarkdownDraft: Sendable {
    let tabID: String
    let title: String
    let content: String
}

nonisolated enum WorkspaceFileDocument: Sendable {
    case text(content: String, isTruncated: Bool, byteLength: Int64)
    case diff(lines: [WorkspaceDiffLine], isTruncated: Bool)
    case image(data: Data, mimeType: String?)
    case html(content: String, isTruncated: Bool)
}

extension WorkspaceFileDocument {
    // Why: an empty, non-truncated text body renders as a blank editor with no signal that the
    // file genuinely has no content, which is indistinguishable from a failed load. Show an
    // explicit "Empty file" state instead.
    var isEmptyText: Bool {
        if case .text(let content, let isTruncated, _) = self {
            return content.isEmpty && !isTruncated
        }
        return false
    }
}

nonisolated struct WorkspaceDiffLine: Sendable {
    enum Kind: Sendable, Equatable {
        case context
        case add
        case delete
    }

    let kind: Kind
    let text: String
    let oldLineNumber: Int?
    let newLineNumber: Int?
}

nonisolated enum WorkspaceContentError: Error {
    case invalidImage
    case unsupportedBinary
}
