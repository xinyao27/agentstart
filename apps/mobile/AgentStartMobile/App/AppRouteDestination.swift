import SwiftUI

struct AppRouteDestinationView: View {
    let route: AppRoute
    let model: AppModel

    @ViewBuilder
    var body: some View {
        switch route {
        case .activityInsights:
            ActivityInsightsView(
                hosts: model.dependencies.hostRepository,
                connectionRuntime: model.dependencies.hostConnectionRuntime,
                repository: model.dependencies.activityRepository,
                snapshotCache: model.dependencies.homeSnapshotCache
            )
        case .designSystemCatalog:
            DesignSystemCatalogView()
        case .appearanceSettings:
            AppearanceSettingsView(preferences: model.dependencies.settingsPreferences)
        case .browserSettings:
            BrowserSettingsView(preferences: model.dependencies.settingsPreferences)
        case .notificationSettings:
            NotificationSettingsView()
        case .connectionLog:
            ConnectionLogView(
                hosts: model.dependencies.hostRepository,
                diagnostics: model.dependencies.connectionDiagnosticsRepository
            )
        case .troubleshooting:
            TroubleshootingView(
                repository: model.dependencies.hostRepository,
                showConnectionLog: model.showConnectionLog
            )
        case .about:
            AboutView()
        case .editHost(let host):
            HostEditView(
                host: host,
                repository: model.dependencies.hostRepository,
                connectionRuntime: model.dependencies.hostConnectionRuntime,
                onSaved: model.finishEditingHost
            )
        case .accounts(let host):
            AccountView(
                host: host,
                hostRepository: model.dependencies.hostRepository,
                repository: model.dependencies.accountsRepository,
                connectionRuntime: model.dependencies.hostConnectionRuntime
            )
        case .browser(let host):
            BrowserTabsView(
                host: host,
                hostRepository: model.dependencies.hostRepository,
                repository: model.dependencies.browserTabsRepository,
                connectionRuntime: model.dependencies.hostConnectionRuntime,
                showTab: { tab in model.showBrowserTab(host: host, tab: tab) }
            )
        case .browserNewTab(let host, let url):
            BrowserTabsView(
                host: host,
                hostRepository: model.dependencies.hostRepository,
                repository: model.dependencies.browserTabsRepository,
                connectionRuntime: model.dependencies.hostConnectionRuntime,
                createsTabOnAppear: true,
                initialTabURL: url,
                showTab: { tab in model.showBrowserTab(host: host, tab: tab) }
            )
        case .browserTab(let host, let tab):
            BrowserTabDetailView(
                host: host,
                tab: tab,
                repository: model.dependencies.browserRepository,
                connectionRuntime: model.dependencies.hostConnectionRuntime
            )
        case .agentHistory(let host, let workspace):
            AgentHistoryView(
                host: host,
                workspace: workspace,
                repository: model.dependencies.agentHistoryRepository,
                workspaceRepository: model.dependencies.workspaceRepository,
                connectionRuntime: model.dependencies.hostConnectionRuntime,
                showWorkspaceSession: { target in
                    model.showWorkspaceSession(host: host, workspace: target)
                }
            )
        case .files(let host, let workspace):
            WorkspaceFileExplorerView(
                host: host,
                workspace: workspace,
                repository: model.dependencies.filesRepository,
                connectionRuntime: model.dependencies.hostConnectionRuntime,
                openFile: { path, title in
                    model.showFilePreview(
                        host: host,
                        workspace: workspace,
                        relativePath: path,
                        title: title
                    )
                }
            )
        case .filePreview(let host, let workspace, let target):
            switch target.source {
            case .worktree:
                WorkspaceFilePreviewView(
                    host: host,
                    workspace: workspace,
                    target: target,
                    repository: model.dependencies.workspaceContentRepository,
                    connectionRuntime: model.dependencies.hostConnectionRuntime
                )
            case .terminalArtifact(let source):
                TerminalArtifactPreviewView(
                    target: target,
                    source: source,
                    repository: model.dependencies.terminalFileRepository,
                    connectionRuntime: model.dependencies.hostConnectionRuntime
                )
            }
        case .sourceControl(let host, let workspace, let initialTab):
            SourceControlView(
                host: host,
                workspace: workspace,
                repository: model.dependencies.sourceControlRepository,
                hostedReviewRepository: model.dependencies.hostedReviewRepository,
                connectionRuntime: model.dependencies.hostConnectionRuntime,
                initialTab: initialTab,
                requestedTab: initialTab,
                openReview: { entry in
                    model.showSourceReview(
                        host: host,
                        workspace: workspace,
                        target: SourceReviewTarget(
                            filePath: entry.path,
                            scope: entry.area == .staged ? .staged : .unstaged,
                            filter: nil
                        )
                    )
                }
            )
        case .sourceReview(let host, let workspace, let target):
            SourceReviewView(
                host: host,
                workspace: workspace,
                target: target,
                sourceRepository: model.dependencies.sourceControlRepository,
                reviewRepository: model.dependencies.sourceReviewRepository,
                hostedReviewRepository: model.dependencies.hostedReviewRepository,
                isGitHubRepositoryProbe: {
                    // Why: the review screen can be pushed immediately after the workspace
                    // snapshot. The repo-slug call is then racing the runtime's repository
                    // cache; one transient miss must not remove the GitHub checklist action
                    // from an otherwise valid GitHub worktree.
                    for attempt in 0..<3 {
                        do {
                            let slug = try await model.dependencies.workspaceCreationRepository
                                .workspaceRepoSlug(for: host.id, repoID: workspace.repoID)
                            if slug != nil {
                                return true
                            }
                        } catch {
                            // Retry below; the review screen remains usable without the hosted
                            // affordance if the runtime cannot resolve the remote.
                        }
                        if attempt < 2 {
                            try? await Task.sleep(for: .milliseconds(250))
                        }
                    }
                    return false
                },
                connectionRuntime: model.dependencies.hostConnectionRuntime,
                showWorkspaceSession: {
                    model.showWorkspaceSession(host: host, workspace: workspace)
                }
            )
        case .sourceDiff(let host, let workspace, let path, let title, let source):
            WorkspaceSourceDiffView(
                host: host,
                workspace: workspace,
                relativePath: path,
                title: title,
                source: source,
                repository: model.dependencies.workspaceContentRepository,
                connectionRuntime: model.dependencies.hostConnectionRuntime
            )
        case .workspaces(let host, let presentation):
            AppWorkspaceListDestinationView(
                host: host,
                presentation: presentation,
                model: model,
                leaveHost: nil,
                hideSidebar: nil,
                replaceDetail: nil
            )
        case .workspaceSession(let host, let workspace, let initialTab):
            TerminalWorkspaceView(
                host: host,
                workspace: workspace,
                initialTab: initialTab,
                repository: model.dependencies.terminalWorkspaceRepository,
                connectionRuntime: model.dependencies.hostConnectionRuntime,
                contentRepository: model.dependencies.workspaceContentRepository,
                browserRepository: model.dependencies.browserRepository,
                workspaceCreationRepository: model.dependencies.workspaceCreationRepository,
                quickCommandRepository: model.dependencies.terminalQuickCommandRepository,
                capabilityRepository: model.dependencies.runtimeClient,
                filesRepository: model.dependencies.filesRepository,
                sourceRepository: model.dependencies.sourceControlRepository,
                sourceReviewRepository: model.dependencies.sourceReviewRepository,
                hostedReviewRepository: model.dependencies.hostedReviewRepository,
                runtime: model.dependencies.terminalSessionRuntime,
                displayModeRuntime: model.dependencies.terminalDisplayModeRuntime,
                surfaceFactory: model.dependencies.terminalSurfaceFactory,
                preferences: model.dependencies.terminalPreferences,
                settingsPreferences: model.dependencies.settingsPreferences,
                showFiles: { model.showFiles(host: host, workspace: workspace) },
                showSourceControl: {
                    model.showSourceControl(host: host, workspace: workspace)
                },
                showAgentHistory: {
                    model.showAgentHistory(host: host, workspace: workspace)
                },
                showBrowser: { model.showBrowser(host) },
                openTerminalFile: {
                    model.openTerminalFile($0, host: host, workspace: workspace)
                },
                openWorkspaceFile: { path, title in
                    model.showFilePreview(
                        host: host,
                        workspace: workspace,
                        relativePath: path,
                        title: title
                    )
                },
                openSourceReview: { entry in
                    model.showSourceReview(
                        host: host,
                        workspace: workspace,
                        target: SourceReviewTarget(
                            filePath: entry.path,
                            scope: entry.area == .staged ? .staged : .unstaged,
                            filter: nil
                        )
                    )
                }
            )
        case .terminalSettings:
            TerminalSettingsView(
                preferences: model.dependencies.terminalPreferences,
                hosts: model.dependencies.hostRepository,
                autoRestoreRepository: model.dependencies.runtimeClient
            )
        case .pair:
            PairingScanView(
                runtime: model.dependencies.pairingRuntime,
                onPaired: model.finishPairing
            )
        case .pairConfirm(let offer):
            PairingConfirmView(
                offer: offer,
                runtime: model.dependencies.pairingRuntime,
                onPaired: model.finishPairing,
                onCancel: model.cancelPairing
            )
        case .pairLinkError(let error):
            PairingLinkErrorView(error: error, onCancel: model.cancelPairing)
        }
    }

}
