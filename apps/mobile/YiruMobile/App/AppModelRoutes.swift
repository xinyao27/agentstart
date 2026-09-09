import Foundation

@MainActor
extension AppModel {
    func hostsDidChange() {
        hostRevision += 1
        homeRevision += 1
    }

    func showDesignSystemCatalog() {
        routes.append(.designSystemCatalog)
    }

    func showSettings() {
        routes.append(.settings)
    }

    func showActivityInsights() {
        isActivityInsightsPresented = true
    }

    func showAppearanceSettings() {
        routes.append(.appearanceSettings)
    }

    func showBrowserSettings() {
        routes.append(.browserSettings)
    }

    func showNotificationSettings() {
        routes.append(.notificationSettings)
    }

    func showConnectionLog() {
        routes.append(.connectionLog)
    }

    func showTroubleshooting() {
        routes.append(.troubleshooting)
    }

    func showAbout() {
        routes.append(.about)
    }

    func showPairing() {
        routes.append(.pair)
    }

    func showWorkspaces(_ host: HostProfile) {
        routes.append(.workspaces(host, .standard))
    }

    func showEditHost(_ host: HostProfile) {
        routes.append(.editHost(host))
    }

    func showAccounts(_ host: HostProfile) {
        routes.append(.accounts(host))
    }

    func showAgentHistory(host: HostProfile, workspace: WorkspaceSummary) {
        routes.append(.agentHistory(host, workspace))
    }

    func showFiles(host: HostProfile, workspace: WorkspaceSummary) {
        routes.append(.files(host, workspace))
    }

    func showSourceControl(
        host: HostProfile,
        workspace: WorkspaceSummary,
        initialTab: SourceControlHubTab = .changes
    ) {
        routes.append(.sourceControl(host, workspace, initialTab))
    }

    func showSourceReview(
        host: HostProfile,
        workspace: WorkspaceSummary,
        target: SourceReviewTarget = .all
    ) {
        routes.append(.sourceReview(host, workspace, target))
    }

    func showFilePreview(
        host: HostProfile,
        workspace: WorkspaceSummary,
        relativePath: String,
        title: String
    ) {
        routes.append(
            .filePreview(
                host,
                workspace,
                // Why: no baked metadata here — WorkspaceFilePreviewView composes the
                // "<workspace> - <path>" subtitle itself from a live-refreshed workspace
                // label, since baking it in at route-append time would freeze a rename
                // made while this preview stays open (see PreviewView.swift).
                WorkspaceFilePreviewTarget(
                    source: .worktree(relativePath: relativePath),
                    title: title,
                    line: nil,
                    column: nil
                )
            )
        )
    }

    func openTerminalFile(
        _ request: TerminalFileOpenRequest,
        host: HostProfile,
        workspace: WorkspaceSummary
    ) {
        Task {
            guard
                let destination = try? await dependencies.terminalFileRepository
                    .resolveTerminalFile(request)
            else { return }
            switch destination {
            case .worktree(let relativePath, let absolutePath, let provider):
                if request.tappedFile.line != nil || request.tappedFile.column != nil {
                    routes.append(
                        .filePreview(
                            host,
                            workspace,
                            // Why: see showFilePreview — leave metadata unbaked so the
                            // preview composes its subtitle from a live-refreshed label.
                            WorkspaceFilePreviewTarget(
                                source: .worktree(relativePath: relativePath),
                                title: URL(fileURLWithPath: relativePath).lastPathComponent,
                                line: request.tappedFile.line,
                                column: request.tappedFile.column
                            )
                        )
                    )
                } else if isHTMLPath(relativePath), provider == "local",
                    let fileURL = fileURIFromFilesystemPath(absolutePath)
                {
                    // Why: a local-provider HTML file belongs in the workspace's own browser
                    // tab, not the read-only preview — the preview cannot run the page, so
                    // tapping an HTML file there dead-ends.
                    _ = try? await dependencies.terminalWorkspaceRepository.createWorkspaceBrowser(
                        for: request.hostID,
                        worktreeID: request.worktreeID,
                        url: fileURL.absoluteString
                    )
                } else {
                    try? await dependencies.terminalFileRepository.openTerminalWorktreeFile(
                        for: request.hostID,
                        worktreeID: request.worktreeID,
                        relativePath: relativePath
                    )
                }
            case .artifact(let source):
                routes.append(
                    .filePreview(
                        host,
                        workspace,
                        WorkspaceFilePreviewTarget(
                            source: .terminalArtifact(source),
                            title: URL(fileURLWithPath: source.absolutePath).lastPathComponent,
                            line: request.tappedFile.line,
                            column: request.tappedFile.column,
                            metadata:
                                "\(filePreviewWorkspaceLabel(workspace)) - \(source.absolutePath)"
                        )
                    )
                )
            }
        }
    }

    func showSourceDiff(
        host: HostProfile,
        workspace: WorkspaceSummary,
        entry: SourceFileEntry
    ) {
        let source: WorkspaceFileDiffSource = entry.area == .staged ? .staged : .unstaged
        let title = URL(fileURLWithPath: entry.path).lastPathComponent
        routes.append(.sourceDiff(host, workspace, entry.path, title, source))
    }

    func finishEditingHost(_ updated: HostProfile) {
        if !routes.isEmpty { routes.removeLast() }
        routes = routes.map { $0.replacingWorkspaceRootHost(updated) }
        hostsDidChange()
    }

    func showWorkspaceSession(
        host: HostProfile,
        workspace: WorkspaceSummary,
        initialTab: WorkspaceOpenTab? = nil
    ) {
        dependencies.recentWorkspaceStore.save(host: host, workspace: workspace)
        routes.append(.workspaceSession(host, workspace, initialTab))
    }

    func showTerminalSettings() {
        routes.append(.terminalSettings)
    }

    // Why: land the user inside the host they just paired. Clearing back to Home instead
    // makes the very first thing a new user does end one tap short of the thing they
    // paired for.
    func finishPairing(_ host: HostProfile) {
        routes = [.workspaces(host, .standard)]
        hostsDidChange()
    }

    func cancelPairing() {
        routes.removeAll()
    }

    private func isHTMLPath(_ path: String) -> Bool {
        ["html", "htm"].contains(URL(fileURLWithPath: path).pathExtension.lowercased())
    }
}

// Why: the host browser needs a `file://` URL for the daemon-authoritative absolute path; encode
// each path segment so spaces and platform-specific roots round-trip without changing identity.
nonisolated private func fileURIFromFilesystemPath(_ path: String) -> URL? {
    let normalizedPath = path.replacingOccurrences(of: "\\", with: "/")
    let segments = normalizedPath.split(separator: "/", omittingEmptySubsequences: false)
    let encodedSegments = segments.enumerated().map { index, segment -> String in
        let value = String(segment)
        if index == 0, value.range(of: "^[A-Za-z]:$", options: .regularExpression) != nil {
            return value
        }
        return value.addingPercentEncoding(withAllowedCharacters: .urlPathAllowed) ?? value
    }
    let encodedPath = encodedSegments.joined(separator: "/")
    let uriString =
        normalizedPath.hasPrefix("/") ? "file://\(encodedPath)" : "file:///\(encodedPath)"
    return URL(string: uriString)
}
