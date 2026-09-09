enum AppRoute: Hashable {
    case activityInsights
    case designSystemCatalog
    case settings
    case appearanceSettings
    case browserSettings
    case connectionLog
    case notificationSettings
    case troubleshooting
    case about
    case editHost(HostProfile)
    case accounts(HostProfile)
    case agentHistory(HostProfile, WorkspaceSummary)
    case files(HostProfile, WorkspaceSummary)
    case filePreview(HostProfile, WorkspaceSummary, WorkspaceFilePreviewTarget)
    case sourceControl(HostProfile, WorkspaceSummary, SourceControlHubTab)
    case sourceReview(HostProfile, WorkspaceSummary, SourceReviewTarget)
    case sourceDiff(HostProfile, WorkspaceSummary, String, String, WorkspaceFileDiffSource)
    case workspaces(HostProfile, WorkspaceListPresentation)
    case workspaceSession(HostProfile, WorkspaceSummary, WorkspaceOpenTab?)
    case terminalSettings
    case pair
    case pairConfirm(PairingOffer)
    case pairLinkError(PairingLinkError)
}

extension AppRoute {
    var hostID: String? {
        switch self {
        case .editHost(let host), .accounts(let host), .agentHistory(let host, _),
            .files(let host, _), .filePreview(let host, _, _),
            .sourceControl(let host, _, _), .sourceReview(let host, _, _),
            .sourceDiff(let host, _, _, _, _), .workspaces(let host, _),
            .workspaceSession(let host, _, _):
            host.id
        case .activityInsights, .designSystemCatalog, .settings, .appearanceSettings,
            .browserSettings, .connectionLog, .notificationSettings,
            .troubleshooting, .about, .terminalSettings, .pair, .pairConfirm,
            .pairLinkError:
            nil
        }
    }

    nonisolated func replacingWorkspaceRootHost(_ updated: HostProfile) -> AppRoute {
        guard case .workspaces(let current, let presentation) = self,
            current.id == updated.id
        else { return self }
        return .workspaces(updated, presentation)
    }
}
