import Foundation

@MainActor
extension TerminalWorkspaceModel {
    func activateOpenedDiff(
        relativePath: String,
        activeTabIDAtTap: String?
    ) async -> Bool {
        guard isConnected else { return false }
        for delay in [300, 900, 1_800] {
            do {
                try await Task.sleep(for: .milliseconds(delay))
            } catch {
                return false
            }
            await refreshTabs()
            guard
                let opened = tabs.first(where: { tab in
                    guard case .file(let descriptor) = tab.content else { return false }
                    return descriptor.relativePath == relativePath && descriptor.diffSource != nil
                })
            else {
                continue
            }
            if activeTabID == opened.id || activeTabID == activeTabIDAtTap {
                if activeTabID != opened.id {
                    await select(opened)
                }
                return true
            }
            // Why: a tab switch made after the tap is user intent; never pull focus back to
            // the diff merely because the Desktop snapshot arrived later.
            return false
        }
        return false
    }
}
