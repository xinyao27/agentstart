@MainActor
struct AppDependencies {
    let accountsRepository: any AccountsRepository
    let activityRepository: any ActivityStatsRepository
    let agentHistoryRepository: any AgentHistoryRepository
    let browserRepository: any WorkspaceBrowserRepository
    let connectionDiagnosticsRepository: any ConnectionDiagnosticsRepository
    let filesRepository: any WorkspaceFilesRepository
    let hostRepository: any HostRepository
    let hostConnectionRuntime: any HostConnectionRuntime
    let credentialCleanupRepository: any CredentialCleanupRepository
    let homeRuntime: any HomeRuntime
    let homeSnapshotCache: HomeSnapshotCache
    let hostedReviewRepository: any HostedReviewRepository
    let notificationCoordinator: NotificationCoordinator
    let pairingRuntime: any PairingRuntime
    let recentWorkspaceStore: RecentWorkspaceStore
    let runtimeClient: RuntimeClient
    let sourceControlRepository: any SourceControlRepository
    let sourceReviewRepository: any SourceReviewRepository
    let terminalDisplayModeRuntime: any TerminalDisplayModeRuntime
    let terminalFileRepository: any TerminalFileRepository
    let terminalPreferences: TerminalPreferences
    let terminalQuickCommandRepository: any TerminalQuickCommandRepository
    let settingsPreferences: SettingsPreferences
    let terminalSessionRuntime: any TerminalSessionRuntime
    let terminalSurfaceFactory: any TerminalSurfaceFactory
    let terminalWorkspaceRepository: any TerminalWorkspaceRepository
    let workspaceContentRepository: any WorkspaceContentRepository
    let workspaceRepository: any WorkspaceRepository
    let workspaceCreationRepository: any WorkspaceCreationRepository
    let widgetSnapshotWriter: WidgetSnapshotWriter

    static func live() -> AppDependencies {
        let hosts = KeychainHostRepository()
        let runtime = RuntimeClient(hosts: hosts)
        let terminalPreferences = TerminalPreferences(
            store: UserDefaultsTerminalPreferenceStore()
        )
        let notificationCoordinator = NotificationCoordinator(hosts: hosts, runtime: runtime)
        notificationCoordinator.install()
        return AppDependencies(
            accountsRepository: runtime,
            activityRepository: runtime,
            agentHistoryRepository: runtime,
            browserRepository: runtime,
            connectionDiagnosticsRepository: runtime,
            filesRepository: runtime,
            hostRepository: hosts,
            hostConnectionRuntime: runtime,
            credentialCleanupRepository: hosts,
            homeRuntime: runtime,
            homeSnapshotCache: HomeSnapshotCache(),
            hostedReviewRepository: runtime,
            notificationCoordinator: notificationCoordinator,
            pairingRuntime: DirectPairingClient(hosts: hosts),
            recentWorkspaceStore: RecentWorkspaceStore(),
            runtimeClient: runtime,
            sourceControlRepository: runtime,
            sourceReviewRepository: runtime,
            terminalDisplayModeRuntime: runtime,
            terminalFileRepository: runtime,
            terminalPreferences: terminalPreferences,
            terminalQuickCommandRepository: runtime,
            settingsPreferences: SettingsPreferences(),
            terminalSessionRuntime: runtime,
            terminalSurfaceFactory: SwiftTermSurfaceFactory(),
            terminalWorkspaceRepository: runtime,
            workspaceContentRepository: runtime,
            workspaceRepository: runtime,
            workspaceCreationRepository: runtime,
            widgetSnapshotWriter: WidgetSnapshotWriter()
        )
    }
}
