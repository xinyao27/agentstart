import Foundation

@MainActor
extension AppModel {
    func hostsDidChange() {
        hostRevision += 1
        homeRevision += 1
    }

    func showDesignSystemCatalog() {
        push(.designSystemCatalog)
    }

    func showActivityInsights() {
        push(.activityInsights)
    }

    func showAppearanceSettings() {
        push(.appearanceSettings)
    }

    func showBrowserSettings() {
        push(.browserSettings)
    }

    func showNotificationSettings() {
        push(.notificationSettings)
    }

    func showConnectionLog() {
        push(.connectionLog)
    }

    func showTroubleshooting() {
        push(.troubleshooting)
    }

    func showAbout() {
        push(.about)
    }

    func showPairing() {
        push(.pair)
    }

    func showWorkspaces(_ host: HostProfile) {
        push(.workspaces(host, .standard))
    }

    func showEditHost(_ host: HostProfile) {
        push(.editHost(host))
    }

    func showAccounts(_ host: HostProfile) {
        push(.accounts(host))
    }

    func showBrowser(_ host: HostProfile) {
        push(.browser(host))
    }

    func showBrowserTab(host: HostProfile, tab: BrowserTabSummary) {
        push(.browserTab(host, tab))
    }

    func showAgentHistory(host: HostProfile, workspace: WorkspaceSummary) {
        push(.agentHistory(host, workspace))
    }

    func showFiles(host: HostProfile, workspace: WorkspaceSummary) {
        push(.files(host, workspace))
    }

    func showSourceControl(
        host: HostProfile,
        workspace: WorkspaceSummary,
        initialTab: SourceControlHubTab = .changes
    ) {
        push(.sourceControl(host, workspace, initialTab))
    }

    func showSourceReview(
        host: HostProfile,
        workspace: WorkspaceSummary,
        target: SourceReviewTarget = .all
    ) {
        push(.sourceReview(host, workspace, target))
    }

    func showFilePreview(
        host: HostProfile,
        workspace: WorkspaceSummary,
        relativePath: String,
        title: String
    ) {
        push(
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
                    push(
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
                push(
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
        push(.sourceDiff(host, workspace, entry.path, title, source))
    }

    func finishEditingHost(_ updated: HostProfile) {
        let tab = AppRoute.editHost(updated).tab
        popLast(for: tab)
        setRoutes(routes(for: tab).map { $0.replacingWorkspaceRootHost(updated) }, for: tab)
        hostsDidChange()
    }

    func showWorkspaceSession(
        host: HostProfile,
        workspace: WorkspaceSummary,
        initialTab: WorkspaceOpenTab? = nil
    ) {
        dependencies.recentWorkspaceStore.save(host: host, workspace: workspace)
        push(.workspaceSession(host, workspace, initialTab))
    }

    func showTerminalSettings() {
        push(.terminalSettings)
    }

    // Why: land the user inside the host they just paired. Clearing back to Home instead
    // makes the very first thing a new user does end one tap short of the thing they
    // paired for.
    func finishPairing(_ host: HostProfile) {
        setRoutes([.workspaces(host, .standard)], for: .home)
        selectedTab = .home
        hostsDidChange()
    }

    func cancelPairing() {
        popAll(for: .home)
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
