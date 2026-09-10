import Foundation

nonisolated protocol WorkspaceBrowserRepository: Sendable {
    func browserEvents(
        for hostID: String,
        worktreeID: String,
        pageID: String,
        configuration: WorkspaceBrowserStreamConfiguration
    ) async throws -> AsyncThrowingStream<WorkspaceBrowserEvent, Error>
    func navigateBrowser(
        for hostID: String,
        worktreeID: String,
        pageID: String,
        action: WorkspaceBrowserNavigation
    ) async throws -> String
    func navigateBrowser(
        for hostID: String,
        worktreeID: String,
        pageID: String,
        url: String
    ) async throws -> String
    func clickBrowser(
        for hostID: String,
        worktreeID: String,
        pageID: String,
        point: WorkspaceBrowserPoint,
        button: WorkspaceBrowserButton,
        radius: Double?,
        modifiers: [WorkspaceBrowserPointerModifier]
    ) async throws
    func scrollBrowser(
        for hostID: String,
        worktreeID: String,
        pageID: String,
        point: WorkspaceBrowserPoint,
        deltaX: Double,
        deltaY: Double
    ) async throws
    func pressBrowserKey(
        for hostID: String,
        worktreeID: String,
        pageID: String,
        key: String
    ) async throws
    func insertBrowserText(
        for hostID: String,
        worktreeID: String,
        pageID: String,
        text: String
    ) async throws
    func respondToBrowserDialog(
        for hostID: String,
        worktreeID: String,
        pageID: String,
        accepts: Bool
    ) async throws
}
