use agentstart_protocol::method_metadata::MethodId;

use super::{
    agents, browser, computer, files, git, github, orchestration, preferences, projects, runtime,
    support, terminal, workspaces,
};

pub(super) enum Method {
    Agents(agents::Method),
    Browser(browser::Method),
    Computer(computer::Method),
    Files(files::Method),
    Git(git::Method),
    Github(github::Method),
    Orchestration(orchestration::Method),
    Preferences(preferences::Method),
    Projects(projects::Method),
    Runtime(runtime::Method),
    Support(support::Method),
    Terminal(terminal::Method),
    Workspaces(workspaces::Method),
}

impl From<MethodId> for Method {
    fn from(method: MethodId) -> Self {
        match method {
            MethodId::AgentStartRuntimeV1ShellHostServiceRegister => {
                Self::Runtime(runtime::Method::ShellHostServiceRegister)
            }
            MethodId::AgentStartRuntimeV1ShellHostServiceExecute => {
                Self::Runtime(runtime::Method::ShellHostServiceExecute)
            }
            MethodId::AgentStartRuntimeV1AccountsServiceAdd => {
                Self::Agents(agents::Method::AccountsServiceAdd)
            }
            MethodId::AgentStartRuntimeV1AccountsServiceCancelPendingLogin => {
                Self::Agents(agents::Method::AccountsServiceCancelPendingLogin)
            }
            MethodId::AgentStartRuntimeV1AccountsServiceClearMiniMaxCookie => {
                Self::Agents(agents::Method::AccountsServiceClearMiniMaxCookie)
            }
            MethodId::AgentStartRuntimeV1AccountsServiceGetMiniMaxCredentials => {
                Self::Agents(agents::Method::AccountsServiceGetMiniMaxCredentials)
            }
            MethodId::AgentStartRuntimeV1AgentSessionServiceProviders => {
                Self::Agents(agents::Method::AgentSessionServiceProviders)
            }
            MethodId::AgentStartRuntimeV1AgentSessionServiceList => {
                Self::Agents(agents::Method::AgentSessionServiceList)
            }
            MethodId::AgentStartRuntimeV1AgentSessionServiceStart => {
                Self::Agents(agents::Method::AgentSessionServiceStart)
            }
            MethodId::AgentStartRuntimeV1AgentSessionServiceStop => {
                Self::Agents(agents::Method::AgentSessionServiceStop)
            }
            MethodId::AgentStartRuntimeV1AgentSessionServiceFollowup => {
                Self::Agents(agents::Method::AgentSessionServiceFollowup)
            }
            MethodId::AgentStartRuntimeV1AgentStatusServiceInferInterrupt => {
                Self::Agents(agents::Method::AgentStatusServiceInferInterrupt)
            }
            MethodId::AgentStartRuntimeV1AgentStatusServiceGetSnapshot => {
                Self::Agents(agents::Method::AgentStatusServiceGetSnapshot)
            }
            MethodId::AgentStartRuntimeV1AgentStatusServiceGetMigrationUnsupportedSnapshot => {
                Self::Agents(agents::Method::AgentStatusServiceGetMigrationUnsupportedSnapshot)
            }
            MethodId::AgentStartRuntimeV1AgentStatusServiceSubscribe => {
                Self::Agents(agents::Method::AgentStatusServiceSubscribe)
            }
            MethodId::AgentStartRuntimeV1AgentStatusServiceDrop => {
                Self::Agents(agents::Method::AgentStatusServiceDrop)
            }
            MethodId::AgentStartRuntimeV1AgentStatusServiceDropByTabPrefix => {
                Self::Agents(agents::Method::AgentStatusServiceDropByTabPrefix)
            }
            MethodId::AgentStartRuntimeV1AgentStatusServiceRetirePaneAuthority => {
                Self::Agents(agents::Method::AgentStatusServiceRetirePaneAuthority)
            }
            MethodId::AgentStartRuntimeV1AgentStatusServiceTransferPaneAuthority => {
                Self::Agents(agents::Method::AgentStatusServiceTransferPaneAuthority)
            }
            MethodId::AgentStartRuntimeV1AiVaultServiceListSessions => {
                Self::Agents(agents::Method::AiVaultServiceListSessions)
            }
            MethodId::AgentStartRuntimeV1AiVaultServiceListSubagentSessions => {
                Self::Agents(agents::Method::AiVaultServiceListSubagentSessions)
            }
            MethodId::AgentStartRuntimeV1AccountsServiceList => {
                Self::Agents(agents::Method::AccountsServiceList)
            }
            MethodId::AgentStartRuntimeV1AccountsServiceListCachedClaude => {
                Self::Agents(agents::Method::AccountsServiceListCachedClaude)
            }
            MethodId::AgentStartRuntimeV1AccountsServiceListCachedCodex => {
                Self::Agents(agents::Method::AccountsServiceListCachedCodex)
            }
            MethodId::AgentStartRuntimeV1AccountsServiceRemove => {
                Self::Agents(agents::Method::AccountsServiceRemove)
            }
            MethodId::AgentStartRuntimeV1AccountsServiceUnsubscribe => {
                Self::Agents(agents::Method::AccountsServiceUnsubscribe)
            }
            MethodId::AgentStartRuntimeV1AccountsServiceRefreshRateLimits => {
                Self::Agents(agents::Method::AccountsServiceRefreshRateLimits)
            }
            MethodId::AgentStartRuntimeV1AccountsServiceRefreshRateLimitsForTarget => {
                Self::Agents(agents::Method::AccountsServiceRefreshRateLimitsForTarget)
            }
            MethodId::AgentStartRuntimeV1AccountsServiceConsumeCodexResetCredit => {
                Self::Agents(agents::Method::AccountsServiceConsumeCodexResetCredit)
            }
            MethodId::AgentStartRuntimeV1AccountsServiceRefreshInactiveAccounts => {
                Self::Agents(agents::Method::AccountsServiceRefreshInactiveAccounts)
            }
            MethodId::AgentStartRuntimeV1AccountsServiceRefreshGrokRateLimits => {
                Self::Agents(agents::Method::AccountsServiceRefreshGrokRateLimits)
            }
            MethodId::AgentStartRuntimeV1AccountsServiceGetGrokStatus => {
                Self::Agents(agents::Method::AccountsServiceGetGrokStatus)
            }
            MethodId::AgentStartRuntimeV1AccountsServiceSelect => {
                Self::Agents(agents::Method::AccountsServiceSelect)
            }
            MethodId::AgentStartRuntimeV1AccountsServiceReauthenticate => {
                Self::Agents(agents::Method::AccountsServiceReauthenticate)
            }
            MethodId::AgentStartRuntimeV1AccountsServiceSaveMiniMaxCookie => {
                Self::Agents(agents::Method::AccountsServiceSaveMiniMaxCookie)
            }
            MethodId::AgentStartRuntimeV1AccountsServiceSubscribe => {
                Self::Agents(agents::Method::AccountsServiceSubscribe)
            }
            MethodId::AgentStartRuntimeV1StatsServiceGetSummary => {
                Self::Agents(agents::Method::StatsServiceGetSummary)
            }
            MethodId::AgentStartRuntimeV1ProviderUsageServiceGetScanState => {
                Self::Agents(agents::Method::ProviderUsageServiceGetScanState)
            }
            MethodId::AgentStartRuntimeV1ProviderUsageServiceSetEnabled => {
                Self::Agents(agents::Method::ProviderUsageServiceSetEnabled)
            }
            MethodId::AgentStartRuntimeV1ProviderUsageServiceRefresh => {
                Self::Agents(agents::Method::ProviderUsageServiceRefresh)
            }
            MethodId::AgentStartRuntimeV1ProviderUsageServiceGetSnapshot => {
                Self::Agents(agents::Method::ProviderUsageServiceGetSnapshot)
            }
            MethodId::AgentStartRuntimeV1RateLimitResumeServiceInspectCodex => {
                Self::Agents(agents::Method::RateLimitResumeServiceInspectCodex)
            }
            MethodId::AgentStartRuntimeV1RateLimitResumeServiceList => {
                Self::Agents(agents::Method::RateLimitResumeServiceList)
            }
            MethodId::AgentStartRuntimeV1RateLimitResumeServiceSchedule => {
                Self::Agents(agents::Method::RateLimitResumeServiceSchedule)
            }
            MethodId::AgentStartRuntimeV1RateLimitResumeServiceCancel => {
                Self::Agents(agents::Method::RateLimitResumeServiceCancel)
            }
            MethodId::AgentStartRuntimeV1RateLimitResumeServiceRunNow => {
                Self::Agents(agents::Method::RateLimitResumeServiceRunNow)
            }
            MethodId::AgentStartRuntimeV1RateLimitResumeServiceMarkFired => {
                Self::Agents(agents::Method::RateLimitResumeServiceMarkFired)
            }
            MethodId::AgentStartRuntimeV1RateLimitResumeServiceMarkFailed => {
                Self::Agents(agents::Method::RateLimitResumeServiceMarkFailed)
            }
            MethodId::AgentStartRuntimeV1RateLimitResumeServiceMarkStale => {
                Self::Agents(agents::Method::RateLimitResumeServiceMarkStale)
            }
            MethodId::AgentStartRuntimeV1RateLimitResumeServiceRendererReady => {
                Self::Agents(agents::Method::RateLimitResumeServiceRendererReady)
            }
            MethodId::AgentStartRuntimeV1SkillsServiceDiscover => {
                Self::Agents(agents::Method::SkillsServiceDiscover)
            }
            MethodId::AgentStartRuntimeV1SkillsServiceManageFreshnessInventory => {
                Self::Agents(agents::Method::SkillsServiceManageFreshnessInventory)
            }
            MethodId::AgentStartRuntimeV1SkillsServiceManageStartUpdateRun => {
                Self::Agents(agents::Method::SkillsServiceManageStartUpdateRun)
            }
            MethodId::AgentStartRuntimeV1SkillsServiceManageStartInstallRun => {
                Self::Agents(agents::Method::SkillsServiceManageStartInstallRun)
            }
            MethodId::AgentStartRuntimeV1SkillsServiceManageStartRemoveRun => {
                Self::Agents(agents::Method::SkillsServiceManageStartRemoveRun)
            }
            MethodId::AgentStartRuntimeV1SkillsServiceManageListSkillFiles => {
                Self::Agents(agents::Method::SkillsServiceManageListSkillFiles)
            }
            MethodId::AgentStartRuntimeV1SkillsServiceManageReadSkillDirFile => {
                Self::Agents(agents::Method::SkillsServiceManageReadSkillDirFile)
            }
            MethodId::AgentStartRuntimeV1SkillsServiceManageCancelUpdateRun => {
                Self::Agents(agents::Method::SkillsServiceManageCancelUpdateRun)
            }
            MethodId::AgentStartRuntimeV1SkillsServiceManageAcknowledgeUpdateRun => {
                Self::Agents(agents::Method::SkillsServiceManageAcknowledgeUpdateRun)
            }
            MethodId::AgentStartRuntimeV1SkillsServiceManageGetUpdateRun => {
                Self::Agents(agents::Method::SkillsServiceManageGetUpdateRun)
            }
            MethodId::AgentStartRuntimeV1SkillsServiceManageEventsSubscribe => {
                Self::Agents(agents::Method::SkillsServiceManageEventsSubscribe)
            }
            MethodId::AgentStartRuntimeV1BrowserCliServiceResolveTarget => {
                Self::Browser(browser::Method::BrowserCliServiceResolveTarget)
            }
            MethodId::AgentStartRuntimeV1BrowserCliServiceResolveUpload => {
                Self::Browser(browser::Method::BrowserCliServiceResolveUpload)
            }
            MethodId::AgentStartRuntimeV1BrowserRuntimeServiceCreateTab => {
                Self::Browser(browser::Method::BrowserRuntimeServiceCreateTab)
            }
            MethodId::AgentStartRuntimeV1BrowserHostServiceExecute => {
                Self::Browser(browser::Method::BrowserHostServiceExecute)
            }
            MethodId::AgentStartRuntimeV1BrowserHostServiceDownload => {
                Self::Browser(browser::Method::BrowserHostServiceDownload)
            }
            MethodId::AgentStartRuntimeV1LocalDownloadServiceAppendFileChunk => {
                Self::Browser(browser::Method::LocalDownloadServiceAppendFileChunk)
            }
            MethodId::AgentStartRuntimeV1LocalDownloadServiceAppendFolderFileChunk => {
                Self::Browser(browser::Method::LocalDownloadServiceAppendFolderFileChunk)
            }
            MethodId::AgentStartRuntimeV1LocalDownloadServiceCancelFile => {
                Self::Browser(browser::Method::LocalDownloadServiceCancelFile)
            }
            MethodId::AgentStartRuntimeV1LocalDownloadServiceCancelFolder => {
                Self::Browser(browser::Method::LocalDownloadServiceCancelFolder)
            }
            MethodId::AgentStartRuntimeV1LocalDownloadServiceCreateFolderDirectory => {
                Self::Browser(browser::Method::LocalDownloadServiceCreateFolderDirectory)
            }
            MethodId::AgentStartRuntimeV1LocalDownloadServiceFinishFile => {
                Self::Browser(browser::Method::LocalDownloadServiceFinishFile)
            }
            MethodId::AgentStartRuntimeV1LocalDownloadServiceFinishFolder => {
                Self::Browser(browser::Method::LocalDownloadServiceFinishFolder)
            }
            MethodId::AgentStartRuntimeV1LocalDownloadServiceStartFile => {
                Self::Browser(browser::Method::LocalDownloadServiceStartFile)
            }
            MethodId::AgentStartRuntimeV1LocalDownloadServiceStartFolder => {
                Self::Browser(browser::Method::LocalDownloadServiceStartFolder)
            }
            MethodId::AgentStartRuntimeV1BrowserHostServiceExecuteMobile => {
                Self::Browser(browser::Method::BrowserHostServiceExecuteMobile)
            }
            MethodId::AgentStartRuntimeV1BrowserScreencastServiceSubscribe => {
                Self::Browser(browser::Method::BrowserScreencastServiceSubscribe)
            }
            MethodId::AgentStartRuntimeV1BrowserCommandServiceOpen => {
                Self::Browser(browser::Method::BrowserCommandServiceOpen)
            }
            MethodId::AgentStartRuntimeV1BrowserReplayServiceList => {
                Self::Browser(browser::Method::BrowserReplayServiceList)
            }
            MethodId::AgentStartRuntimeV1BrowserReplayServiceRecordResult => {
                Self::Browser(browser::Method::BrowserReplayServiceRecordResult)
            }
            MethodId::AgentStartRuntimeV1BrowserReplayServiceSave => {
                Self::Browser(browser::Method::BrowserReplayServiceSave)
            }
            MethodId::AgentStartRuntimeV1BrowserWritebackServiceApplyColor => {
                Self::Browser(browser::Method::BrowserWritebackServiceApplyColor)
            }
            MethodId::AgentStartRuntimeV1BrowserWritebackServiceApplyCss => {
                Self::Browser(browser::Method::BrowserWritebackServiceApplyCss)
            }
            MethodId::AgentStartRuntimeV1BrowserWritebackServiceLocateElement => {
                Self::Browser(browser::Method::BrowserWritebackServiceLocateElement)
            }
            MethodId::AgentStartRuntimeV1BrowserWritebackServiceRecordVerification => {
                Self::Browser(browser::Method::BrowserWritebackServiceRecordVerification)
            }
            MethodId::AgentStartRuntimeV1VisualRegressionServiceLatest => {
                Self::Browser(browser::Method::VisualRegressionServiceLatest)
            }
            MethodId::AgentStartRuntimeV1VisualRegressionServiceSave => {
                Self::Browser(browser::Method::VisualRegressionServiceSave)
            }
            MethodId::AgentStartRuntimeV1ComputerServiceCapabilities => {
                Self::Computer(computer::Method::ComputerServiceCapabilities)
            }
            MethodId::AgentStartRuntimeV1ComputerServiceListApps => {
                Self::Computer(computer::Method::ComputerServiceListApps)
            }
            MethodId::AgentStartRuntimeV1ComputerServicePermissions => {
                Self::Computer(computer::Method::ComputerServicePermissions)
            }
            MethodId::AgentStartRuntimeV1ComputerServicePermissionsStatus => {
                Self::Computer(computer::Method::ComputerServicePermissionsStatus)
            }
            MethodId::AgentStartRuntimeV1ComputerServicePermissionsReset => {
                Self::Computer(computer::Method::ComputerServicePermissionsReset)
            }
            MethodId::AgentStartRuntimeV1ComputerServiceListWindows => {
                Self::Computer(computer::Method::ComputerServiceListWindows)
            }
            MethodId::AgentStartRuntimeV1ComputerServiceGetAppState => {
                Self::Computer(computer::Method::ComputerServiceGetAppState)
            }
            MethodId::AgentStartRuntimeV1ComputerServiceClick => {
                Self::Computer(computer::Method::ComputerServiceClick)
            }
            MethodId::AgentStartRuntimeV1ComputerServicePerformSecondaryAction => {
                Self::Computer(computer::Method::ComputerServicePerformSecondaryAction)
            }
            MethodId::AgentStartRuntimeV1ComputerServiceScroll => {
                Self::Computer(computer::Method::ComputerServiceScroll)
            }
            MethodId::AgentStartRuntimeV1ComputerServiceDrag => {
                Self::Computer(computer::Method::ComputerServiceDrag)
            }
            MethodId::AgentStartRuntimeV1ComputerServiceTypeText => {
                Self::Computer(computer::Method::ComputerServiceTypeText)
            }
            MethodId::AgentStartRuntimeV1ComputerServicePressKey => {
                Self::Computer(computer::Method::ComputerServicePressKey)
            }
            MethodId::AgentStartRuntimeV1ComputerServiceHotkey => {
                Self::Computer(computer::Method::ComputerServiceHotkey)
            }
            MethodId::AgentStartRuntimeV1ComputerServicePasteText => {
                Self::Computer(computer::Method::ComputerServicePasteText)
            }
            MethodId::AgentStartRuntimeV1ComputerServiceSetValue => {
                Self::Computer(computer::Method::ComputerServiceSetValue)
            }
            MethodId::AgentStartRuntimeV1EmulatorServiceList => {
                Self::Computer(computer::Method::EmulatorServiceList)
            }
            MethodId::AgentStartRuntimeV1EmulatorServiceAttach => {
                Self::Computer(computer::Method::EmulatorServiceAttach)
            }
            MethodId::AgentStartRuntimeV1EmulatorServiceTap => {
                Self::Computer(computer::Method::EmulatorServiceTap)
            }
            MethodId::AgentStartRuntimeV1EmulatorServiceGesture => {
                Self::Computer(computer::Method::EmulatorServiceGesture)
            }
            MethodId::AgentStartRuntimeV1EmulatorServiceTypeText => {
                Self::Computer(computer::Method::EmulatorServiceTypeText)
            }
            MethodId::AgentStartRuntimeV1EmulatorServiceButton => {
                Self::Computer(computer::Method::EmulatorServiceButton)
            }
            MethodId::AgentStartRuntimeV1EmulatorServiceRotate => {
                Self::Computer(computer::Method::EmulatorServiceRotate)
            }
            MethodId::AgentStartRuntimeV1EmulatorServiceExec => {
                Self::Computer(computer::Method::EmulatorServiceExec)
            }
            MethodId::AgentStartRuntimeV1EmulatorServiceKill => {
                Self::Computer(computer::Method::EmulatorServiceKill)
            }
            MethodId::AgentStartRuntimeV1EmulatorServiceShutdown => {
                Self::Computer(computer::Method::EmulatorServiceShutdown)
            }
            MethodId::AgentStartRuntimeV1EmulatorServiceListSimulators => {
                Self::Computer(computer::Method::EmulatorServiceListSimulators)
            }
            MethodId::AgentStartRuntimeV1EmulatorServiceAvailability => {
                Self::Computer(computer::Method::EmulatorServiceAvailability)
            }
            MethodId::AgentStartRuntimeV1EmulatorServiceUnregisterActive => {
                Self::Computer(computer::Method::EmulatorServiceUnregisterActive)
            }
            MethodId::AgentStartRuntimeV1EmulatorServiceStreamFrames => {
                Self::Computer(computer::Method::EmulatorServiceStreamFrames)
            }
            MethodId::AgentStartRuntimeV1DangerousApprovalServiceStatus => {
                Self::Computer(computer::Method::DangerousApprovalServiceStatus)
            }
            MethodId::AgentStartRuntimeV1DangerousApprovalServiceBeginRegistration => {
                Self::Computer(computer::Method::DangerousApprovalServiceBeginRegistration)
            }
            MethodId::AgentStartRuntimeV1DangerousApprovalServiceFinishRegistration => {
                Self::Computer(computer::Method::DangerousApprovalServiceFinishRegistration)
            }
            MethodId::AgentStartRuntimeV1DangerousApprovalServiceBeginApproval => {
                Self::Computer(computer::Method::DangerousApprovalServiceBeginApproval)
            }
            MethodId::AgentStartRuntimeV1DangerousApprovalServiceFinishApproval => {
                Self::Computer(computer::Method::DangerousApprovalServiceFinishApproval)
            }
            MethodId::AgentStartRuntimeV1DangerousApprovalServiceRemove => {
                Self::Computer(computer::Method::DangerousApprovalServiceRemove)
            }
            MethodId::AgentStartRuntimeV1FilesServiceBrowseServerDirectory => {
                Self::Files(files::Method::FilesServiceBrowseServerDirectory)
            }
            MethodId::AgentStartRuntimeV1FilesServiceList => {
                Self::Files(files::Method::FilesServiceList)
            }
            MethodId::AgentStartRuntimeV1FilesServiceSearchPaths => {
                Self::Files(files::Method::FilesServiceSearchPaths)
            }
            MethodId::AgentStartRuntimeV1FilesServiceListAll => {
                Self::Files(files::Method::FilesServiceListAll)
            }
            MethodId::AgentStartRuntimeV1FilesServiceListMarkdownDocuments => {
                Self::Files(files::Method::FilesServiceListMarkdownDocuments)
            }
            MethodId::AgentStartRuntimeV1FilesServiceOpen => {
                Self::Files(files::Method::FilesServiceOpen)
            }
            MethodId::AgentStartRuntimeV1FilesServiceOpenDiff => {
                Self::Files(files::Method::FilesServiceOpenDiff)
            }
            MethodId::AgentStartRuntimeV1FilesServiceRead => {
                Self::Files(files::Method::FilesServiceRead)
            }
            MethodId::AgentStartRuntimeV1FilesServiceReadChunk => {
                Self::Files(files::Method::FilesServiceReadChunk)
            }
            MethodId::AgentStartRuntimeV1FilesServiceReadDirectory => {
                Self::Files(files::Method::FilesServiceReadDirectory)
            }
            MethodId::AgentStartRuntimeV1FilesServiceReadPreview => {
                Self::Files(files::Method::FilesServiceReadPreview)
            }
            MethodId::AgentStartRuntimeV1FilesServiceStat => {
                Self::Files(files::Method::FilesServiceStat)
            }
            MethodId::AgentStartRuntimeV1FilesServiceSearch => {
                Self::Files(files::Method::FilesServiceSearch)
            }
            MethodId::AgentStartRuntimeV1FilesServiceWrite => {
                Self::Files(files::Method::FilesServiceWrite)
            }
            MethodId::AgentStartRuntimeV1FilesServiceWriteBase64 => {
                Self::Files(files::Method::FilesServiceWriteBase64)
            }
            MethodId::AgentStartRuntimeV1FilesServiceWriteBase64Chunk => {
                Self::Files(files::Method::FilesServiceWriteBase64Chunk)
            }
            MethodId::AgentStartRuntimeV1FilesServiceCreateFile => {
                Self::Files(files::Method::FilesServiceCreateFile)
            }
            MethodId::AgentStartRuntimeV1FilesServiceCreateDirectory => {
                Self::Files(files::Method::FilesServiceCreateDirectory)
            }
            MethodId::AgentStartRuntimeV1FilesServiceCreateDirectoryNoClobber => {
                Self::Files(files::Method::FilesServiceCreateDirectoryNoClobber)
            }
            MethodId::AgentStartRuntimeV1FilesServiceCommitUpload => {
                Self::Files(files::Method::FilesServiceCommitUpload)
            }
            MethodId::AgentStartRuntimeV1FilesServiceRename => {
                Self::Files(files::Method::FilesServiceRename)
            }
            MethodId::AgentStartRuntimeV1FilesServiceCopy => {
                Self::Files(files::Method::FilesServiceCopy)
            }
            MethodId::AgentStartRuntimeV1FilesServiceDelete => {
                Self::Files(files::Method::FilesServiceDelete)
            }
            MethodId::AgentStartRuntimeV1FilesServiceReadLogTail => {
                Self::Files(files::Method::FilesServiceReadLogTail)
            }
            MethodId::AgentStartRuntimeV1FilesServiceResolveTerminalPath => {
                Self::Files(files::Method::FilesServiceResolveTerminalPath)
            }
            MethodId::AgentStartRuntimeV1FilesServiceReadTerminalArtifact => {
                Self::Files(files::Method::FilesServiceReadTerminalArtifact)
            }
            MethodId::AgentStartRuntimeV1FilesServiceReadTerminalArtifactPreview => {
                Self::Files(files::Method::FilesServiceReadTerminalArtifactPreview)
            }
            MethodId::AgentStartRuntimeV1FilesServiceWriteTerminalArtifact => {
                Self::Files(files::Method::FilesServiceWriteTerminalArtifact)
            }
            MethodId::AgentStartRuntimeV1FilesServiceWatch => {
                Self::Files(files::Method::FilesServiceWatch)
            }
            MethodId::AgentStartRuntimeV1FilesServiceWatchLogTail => {
                Self::Files(files::Method::FilesServiceWatchLogTail)
            }
            MethodId::AgentStartRuntimeV1ShellFilesServiceAuthorizeExternalPath => {
                Self::Files(files::Method::ShellFilesServiceAuthorizeExternalPath)
            }
            MethodId::AgentStartRuntimeV1ShellFilesServiceCopy => {
                Self::Files(files::Method::ShellFilesServiceCopy)
            }
            MethodId::AgentStartRuntimeV1ShellFilesServiceCreateDirectory => {
                Self::Files(files::Method::ShellFilesServiceCreateDirectory)
            }
            MethodId::AgentStartRuntimeV1ShellFilesServiceCreateFile => {
                Self::Files(files::Method::ShellFilesServiceCreateFile)
            }
            MethodId::AgentStartRuntimeV1ShellFilesServiceDelete => {
                Self::Files(files::Method::ShellFilesServiceDelete)
            }
            MethodId::AgentStartRuntimeV1ShellFilesServicePathExists => {
                Self::Files(files::Method::ShellFilesServicePathExists)
            }
            MethodId::AgentStartRuntimeV1ShellFilesServiceRead => {
                Self::Files(files::Method::ShellFilesServiceRead)
            }
            MethodId::AgentStartRuntimeV1ShellFilesServiceReadChunk => {
                Self::Files(files::Method::ShellFilesServiceReadChunk)
            }
            MethodId::AgentStartRuntimeV1ShellFilesServiceRename => {
                Self::Files(files::Method::ShellFilesServiceRename)
            }
            MethodId::AgentStartRuntimeV1ShellFilesServiceResolveDroppedPathsForAgent => {
                Self::Files(files::Method::ShellFilesServiceResolveDroppedPathsForAgent)
            }
            MethodId::AgentStartRuntimeV1ShellFilesServiceStageExternalPathsForRuntimeUpload => {
                Self::Files(files::Method::ShellFilesServiceStageExternalPathsForRuntimeUpload)
            }
            MethodId::AgentStartRuntimeV1ShellFilesServiceStat => {
                Self::Files(files::Method::ShellFilesServiceStat)
            }
            MethodId::AgentStartRuntimeV1ShellFilesServiceWrite => {
                Self::Files(files::Method::ShellFilesServiceWrite)
            }
            MethodId::AgentStartRuntimeV1MarkdownServiceReadTab => {
                Self::Files(files::Method::MarkdownServiceReadTab)
            }
            MethodId::AgentStartRuntimeV1MarkdownServiceSaveTab => {
                Self::Files(files::Method::MarkdownServiceSaveTab)
            }
            MethodId::AgentStartRuntimeV1ArtifactServiceBegin => {
                Self::Files(files::Method::ArtifactServiceBegin)
            }
            MethodId::AgentStartRuntimeV1ArtifactServiceAppend => {
                Self::Files(files::Method::ArtifactServiceAppend)
            }
            MethodId::AgentStartRuntimeV1ArtifactServiceComplete => {
                Self::Files(files::Method::ArtifactServiceComplete)
            }
            MethodId::AgentStartRuntimeV1ArtifactServiceAbort => {
                Self::Files(files::Method::ArtifactServiceAbort)
            }
            MethodId::AgentStartRuntimeV1ArtifactServiceDownloadTicket => {
                Self::Files(files::Method::ArtifactServiceDownloadTicket)
            }
            MethodId::AgentStartRuntimeV1ArtifactServiceRead => {
                Self::Files(files::Method::ArtifactServiceRead)
            }
            MethodId::AgentStartRuntimeV1ClipboardServiceStartImageUpload => {
                Self::Files(files::Method::ClipboardServiceStartImageUpload)
            }
            MethodId::AgentStartRuntimeV1ClipboardServiceAppendImageUploadChunk => {
                Self::Files(files::Method::ClipboardServiceAppendImageUploadChunk)
            }
            MethodId::AgentStartRuntimeV1ClipboardServiceCommitImageUpload => {
                Self::Files(files::Method::ClipboardServiceCommitImageUpload)
            }
            MethodId::AgentStartRuntimeV1ClipboardServiceAbortImageUpload => {
                Self::Files(files::Method::ClipboardServiceAbortImageUpload)
            }
            MethodId::AgentStartRuntimeV1ClipboardServiceSaveImageAsTempFile => {
                Self::Files(files::Method::ClipboardServiceSaveImageAsTempFile)
            }
            MethodId::AgentStartRuntimeV1NotebookServiceRunPythonCell => {
                Self::Files(files::Method::NotebookServiceRunPythonCell)
            }
            MethodId::AgentStartRuntimeV1ExternalEditorServiceOpenRemoteSsh => {
                Self::Files(files::Method::ExternalEditorServiceOpenRemoteSsh)
            }
            MethodId::AgentStartRuntimeV1GitStatusServiceStatus => {
                Self::Git(git::Method::StatusServiceStatus)
            }
            MethodId::AgentStartRuntimeV1GitStatusServiceDiff => {
                Self::Git(git::Method::StatusServiceDiff)
            }
            MethodId::AgentStartRuntimeV1GitStatusServiceSubmoduleStatus => {
                Self::Git(git::Method::StatusServiceSubmoduleStatus)
            }
            MethodId::AgentStartRuntimeV1GitStatusServiceCheckIgnored => {
                Self::Git(git::Method::StatusServiceCheckIgnored)
            }
            MethodId::AgentStartRuntimeV1GitStatusServiceFindHugeFoldersToIgnore => {
                Self::Git(git::Method::StatusServiceFindHugeFoldersToIgnore)
            }
            MethodId::AgentStartRuntimeV1GitStatusServiceLocalBranches => {
                Self::Git(git::Method::StatusServiceLocalBranches)
            }
            MethodId::AgentStartRuntimeV1GitStatusServiceUpstreamStatus => {
                Self::Git(git::Method::StatusServiceUpstreamStatus)
            }
            MethodId::AgentStartRuntimeV1GitStatusServiceRemoteCommitUrl => {
                Self::Git(git::Method::StatusServiceRemoteCommitUrl)
            }
            MethodId::AgentStartRuntimeV1GitStagingServiceStage => {
                Self::Git(git::Method::StagingServiceStage)
            }
            MethodId::AgentStartRuntimeV1GitStagingServiceUnstage => {
                Self::Git(git::Method::StagingServiceUnstage)
            }
            MethodId::AgentStartRuntimeV1GitStagingServiceDiscard => {
                Self::Git(git::Method::StagingServiceDiscard)
            }
            MethodId::AgentStartRuntimeV1GitStagingServiceBulkStage => {
                Self::Git(git::Method::StagingServiceBulkStage)
            }
            MethodId::AgentStartRuntimeV1GitStagingServiceBulkUnstage => {
                Self::Git(git::Method::StagingServiceBulkUnstage)
            }
            MethodId::AgentStartRuntimeV1GitStagingServiceBulkDiscard => {
                Self::Git(git::Method::StagingServiceBulkDiscard)
            }
            MethodId::AgentStartRuntimeV1GitStagingServiceCommit => {
                Self::Git(git::Method::StagingServiceCommit)
            }
            MethodId::AgentStartRuntimeV1GitStagingServiceAppendGitignore => {
                Self::Git(git::Method::StagingServiceAppendGitignore)
            }
            MethodId::AgentStartRuntimeV1GitBranchServiceCheckout => {
                Self::Git(git::Method::BranchServiceCheckout)
            }
            MethodId::AgentStartRuntimeV1GitBranchServiceCheckoutCommit => {
                Self::Git(git::Method::BranchServiceCheckoutCommit)
            }
            MethodId::AgentStartRuntimeV1GitBranchServiceCreateBranch => {
                Self::Git(git::Method::BranchServiceCreateBranch)
            }
            MethodId::AgentStartRuntimeV1GitBranchServiceAddTag => {
                Self::Git(git::Method::BranchServiceAddTag)
            }
            MethodId::AgentStartRuntimeV1GitHistoryRewriteServiceConflictOperation => {
                Self::Git(git::Method::HistoryRewriteServiceConflictOperation)
            }
            MethodId::AgentStartRuntimeV1GitHistoryRewriteServiceAbortMerge => {
                Self::Git(git::Method::HistoryRewriteServiceAbortMerge)
            }
            MethodId::AgentStartRuntimeV1GitHistoryRewriteServiceAbortRebase => {
                Self::Git(git::Method::HistoryRewriteServiceAbortRebase)
            }
            MethodId::AgentStartRuntimeV1GitHistoryRewriteServiceAbortRevert => {
                Self::Git(git::Method::HistoryRewriteServiceAbortRevert)
            }
            MethodId::AgentStartRuntimeV1GitHistoryRewriteServiceCherryPick => {
                Self::Git(git::Method::HistoryRewriteServiceCherryPick)
            }
            MethodId::AgentStartRuntimeV1GitHistoryRewriteServiceRevertCommit => {
                Self::Git(git::Method::HistoryRewriteServiceRevertCommit)
            }
            MethodId::AgentStartRuntimeV1GitHistoryRewriteServiceDropCommit => {
                Self::Git(git::Method::HistoryRewriteServiceDropCommit)
            }
            MethodId::AgentStartRuntimeV1GitHistoryRewriteServiceResetToCommit => {
                Self::Git(git::Method::HistoryRewriteServiceResetToCommit)
            }
            MethodId::AgentStartRuntimeV1GitHistoryRewriteServiceRebaseFromBase => {
                Self::Git(git::Method::HistoryRewriteServiceRebaseFromBase)
            }
            MethodId::AgentStartRuntimeV1GitHistoryRewriteServiceRebaseOntoCommit => {
                Self::Git(git::Method::HistoryRewriteServiceRebaseOntoCommit)
            }
            MethodId::AgentStartRuntimeV1GitHistoryRewriteServiceMergeCommit => {
                Self::Git(git::Method::HistoryRewriteServiceMergeCommit)
            }
            MethodId::AgentStartRuntimeV1GitHistoryServiceHistory => {
                Self::Git(git::Method::HistoryServiceHistory)
            }
            MethodId::AgentStartRuntimeV1GitHistoryServiceBranchCompare => {
                Self::Git(git::Method::HistoryServiceBranchCompare)
            }
            MethodId::AgentStartRuntimeV1GitHistoryServiceBranchDiff => {
                Self::Git(git::Method::HistoryServiceBranchDiff)
            }
            MethodId::AgentStartRuntimeV1GitHistoryServiceCommitCompare => {
                Self::Git(git::Method::HistoryServiceCommitCompare)
            }
            MethodId::AgentStartRuntimeV1GitHistoryServiceCommitDiff => {
                Self::Git(git::Method::HistoryServiceCommitDiff)
            }
            MethodId::AgentStartRuntimeV1GitRemoteServiceFetch => {
                Self::Git(git::Method::RemoteServiceFetch)
            }
            MethodId::AgentStartRuntimeV1GitRemoteServicePull => {
                Self::Git(git::Method::RemoteServicePull)
            }
            MethodId::AgentStartRuntimeV1GitRemoteServiceFastForward => {
                Self::Git(git::Method::RemoteServiceFastForward)
            }
            MethodId::AgentStartRuntimeV1GitRemoteServicePush => {
                Self::Git(git::Method::RemoteServicePush)
            }
            MethodId::AgentStartRuntimeV1GitRemoteServiceForkSync => {
                Self::Git(git::Method::RemoteServiceForkSync)
            }
            MethodId::AgentStartRuntimeV1GitGenerationServiceGenerateCommitMessage => {
                Self::Git(git::Method::GenerationServiceGenerateCommitMessage)
            }
            MethodId::AgentStartRuntimeV1GitGenerationServiceCancelGenerateCommitMessage => {
                Self::Git(git::Method::GenerationServiceCancelGenerateCommitMessage)
            }
            MethodId::AgentStartRuntimeV1GitGenerationServiceGeneratePullRequestFields => {
                Self::Git(git::Method::GenerationServiceGeneratePullRequestFields)
            }
            MethodId::AgentStartRuntimeV1GitGenerationServiceCancelGeneratePullRequestFields => {
                Self::Git(git::Method::GenerationServiceCancelGeneratePullRequestFields)
            }
            MethodId::AgentStartRuntimeV1GitHubShellServiceGetViewer => {
                Self::Github(github::Method::ShellServiceGetViewer)
            }
            MethodId::AgentStartRuntimeV1GitHubShellServiceEnqueuePrRefresh => {
                Self::Github(github::Method::ShellServiceEnqueuePrRefresh)
            }
            MethodId::AgentStartRuntimeV1GitHubShellServiceReportVisiblePrRefreshCandidates => {
                Self::Github(github::Method::ShellServiceReportVisiblePrRefreshCandidates)
            }
            MethodId::AgentStartRuntimeV1GitHubShellServiceCheckAgentStartStarred => {
                Self::Github(github::Method::ShellServiceCheckAgentStartStarred)
            }
            MethodId::AgentStartRuntimeV1GitHubShellServiceStarAgentStart => {
                Self::Github(github::Method::ShellServiceStarAgentStart)
            }
            MethodId::AgentStartRuntimeV1GitHubServiceGetRepoSlug => {
                Self::Github(github::Method::ServiceGetRepoSlug)
            }
            MethodId::AgentStartRuntimeV1GitHubServiceGetRepoUpstream => {
                Self::Github(github::Method::ServiceGetRepoUpstream)
            }
            MethodId::AgentStartRuntimeV1GitHubServiceGetRateLimit => {
                Self::Github(github::Method::ServiceGetRateLimit)
            }
            MethodId::AgentStartRuntimeV1GitHubServiceListWorkItems => {
                Self::Github(github::Method::ServiceListWorkItems)
            }
            MethodId::AgentStartRuntimeV1GitHubServiceListLabels => {
                Self::Github(github::Method::ServiceListLabels)
            }
            MethodId::AgentStartRuntimeV1GitHubServiceListAssignableUsers => {
                Self::Github(github::Method::ServiceListAssignableUsers)
            }
            MethodId::AgentStartRuntimeV1GitHubServiceGetWorkItem => {
                Self::Github(github::Method::ServiceGetWorkItem)
            }
            MethodId::AgentStartRuntimeV1GitHubServiceGetWorkItemByOwnerRepo => {
                Self::Github(github::Method::ServiceGetWorkItemByOwnerRepo)
            }
            MethodId::AgentStartRuntimeV1GitHubServiceGetWorkItemDetails => {
                Self::Github(github::Method::ServiceGetWorkItemDetails)
            }
            MethodId::AgentStartRuntimeV1GitHubServiceGetPrForBranch => {
                Self::Github(github::Method::ServiceGetPrForBranch)
            }
            MethodId::AgentStartRuntimeV1GitHubServiceRefreshPrForBranch => {
                Self::Github(github::Method::ServiceRefreshPrForBranch)
            }
            MethodId::AgentStartRuntimeV1GitHubServiceGetPrChecks => {
                Self::Github(github::Method::ServiceGetPrChecks)
            }
            MethodId::AgentStartRuntimeV1GitHubServiceGetPrCheckDetails => {
                Self::Github(github::Method::ServiceGetPrCheckDetails)
            }
            MethodId::AgentStartRuntimeV1GitHubServiceRerunPrChecks => {
                Self::Github(github::Method::ServiceRerunPrChecks)
            }
            MethodId::AgentStartRuntimeV1GitHubServiceGetPrComments => {
                Self::Github(github::Method::ServiceGetPrComments)
            }
            MethodId::AgentStartRuntimeV1GitHubServiceGetPrFileContents => {
                Self::Github(github::Method::ServiceGetPrFileContents)
            }
            MethodId::AgentStartRuntimeV1GitHubServiceResolveReviewThread => {
                Self::Github(github::Method::ServiceResolveReviewThread)
            }
            MethodId::AgentStartRuntimeV1GitHubServiceSetPrFileViewed => {
                Self::Github(github::Method::ServiceSetPrFileViewed)
            }
            MethodId::AgentStartRuntimeV1GitHubServiceUpdatePrTitle => {
                Self::Github(github::Method::ServiceUpdatePrTitle)
            }
            MethodId::AgentStartRuntimeV1GitHubServiceUpdatePr => {
                Self::Github(github::Method::ServiceUpdatePr)
            }
            MethodId::AgentStartRuntimeV1GitHubServiceUpdatePrState => {
                Self::Github(github::Method::ServiceUpdatePrState)
            }
            MethodId::AgentStartRuntimeV1GitHubServiceMergePr => {
                Self::Github(github::Method::ServiceMergePr)
            }
            MethodId::AgentStartRuntimeV1GitHubServiceSetPrAutoMerge => {
                Self::Github(github::Method::ServiceSetPrAutoMerge)
            }
            MethodId::AgentStartRuntimeV1GitHubServiceRequestPrReviewers => {
                Self::Github(github::Method::ServiceRequestPrReviewers)
            }
            MethodId::AgentStartRuntimeV1GitHubServiceRemovePrReviewers => {
                Self::Github(github::Method::ServiceRemovePrReviewers)
            }
            MethodId::AgentStartRuntimeV1GitHubServiceAddPrComment => {
                Self::Github(github::Method::ServiceAddPrComment)
            }
            MethodId::AgentStartRuntimeV1GitHubServiceAddPrReviewComment => {
                Self::Github(github::Method::ServiceAddPrReviewComment)
            }
            MethodId::AgentStartRuntimeV1GitHubServiceAddPrReviewCommentReply => {
                Self::Github(github::Method::ServiceAddPrReviewCommentReply)
            }
            MethodId::AgentStartRuntimeV1GitHubServiceCreateCommentDraft => {
                Self::Github(github::Method::ServiceCreateCommentDraft)
            }
            MethodId::AgentStartRuntimeV1GitHubServiceGetHostedReviewForBranch => {
                Self::Github(github::Method::ServiceGetHostedReviewForBranch)
            }
            MethodId::AgentStartRuntimeV1GitHubServiceGetHostedReviewCreationEligibility => {
                Self::Github(github::Method::ServiceGetHostedReviewCreationEligibility)
            }
            MethodId::AgentStartRuntimeV1GitHubServiceCreateHostedReview => {
                Self::Github(github::Method::ServiceCreateHostedReview)
            }
            MethodId::AgentStartRuntimeV1GitHubServiceSubscribeEvents => {
                Self::Github(github::Method::ServiceSubscribeEvents)
            }
            MethodId::AgentStartRuntimeV1OrchestrationServiceRunCreate => {
                Self::Orchestration(orchestration::Method::RunCreate)
            }
            MethodId::AgentStartRuntimeV1OrchestrationServiceRunUse => {
                Self::Orchestration(orchestration::Method::RunUse)
            }
            MethodId::AgentStartRuntimeV1OrchestrationServiceRunCurrent => {
                Self::Orchestration(orchestration::Method::RunCurrent)
            }
            MethodId::AgentStartRuntimeV1OrchestrationServiceRunList => {
                Self::Orchestration(orchestration::Method::RunList)
            }
            MethodId::AgentStartRuntimeV1OrchestrationServiceRunShow => {
                Self::Orchestration(orchestration::Method::RunShow)
            }
            MethodId::AgentStartRuntimeV1OrchestrationServiceTaskCreate => {
                Self::Orchestration(orchestration::Method::TaskCreate)
            }
            MethodId::AgentStartRuntimeV1OrchestrationServiceTaskList => {
                Self::Orchestration(orchestration::Method::TaskList)
            }
            MethodId::AgentStartRuntimeV1OrchestrationServiceTaskUpdate => {
                Self::Orchestration(orchestration::Method::TaskUpdate)
            }
            MethodId::AgentStartRuntimeV1OrchestrationServiceDispatch => {
                Self::Orchestration(orchestration::Method::Dispatch)
            }
            MethodId::AgentStartRuntimeV1OrchestrationServiceDispatchShow => {
                Self::Orchestration(orchestration::Method::DispatchShow)
            }
            MethodId::AgentStartRuntimeV1OrchestrationServiceSend => {
                Self::Orchestration(orchestration::Method::Send)
            }
            MethodId::AgentStartRuntimeV1OrchestrationServiceCheck => {
                Self::Orchestration(orchestration::Method::Check)
            }
            MethodId::AgentStartRuntimeV1OrchestrationServiceReply => {
                Self::Orchestration(orchestration::Method::Reply)
            }
            MethodId::AgentStartRuntimeV1OrchestrationServiceInbox => {
                Self::Orchestration(orchestration::Method::Inbox)
            }
            MethodId::AgentStartRuntimeV1OrchestrationServiceAsk => {
                Self::Orchestration(orchestration::Method::Ask)
            }
            MethodId::AgentStartRuntimeV1OrchestrationServiceRun => {
                Self::Orchestration(orchestration::Method::Run)
            }
            MethodId::AgentStartRuntimeV1OrchestrationServiceRunStop => {
                Self::Orchestration(orchestration::Method::RunStop)
            }
            MethodId::AgentStartRuntimeV1OrchestrationServiceGateCreate => {
                Self::Orchestration(orchestration::Method::GateCreate)
            }
            MethodId::AgentStartRuntimeV1OrchestrationServiceGateResolve => {
                Self::Orchestration(orchestration::Method::GateResolve)
            }
            MethodId::AgentStartRuntimeV1OrchestrationServiceGateList => {
                Self::Orchestration(orchestration::Method::GateList)
            }
            MethodId::AgentStartRuntimeV1OrchestrationServiceReset => {
                Self::Orchestration(orchestration::Method::Reset)
            }
            MethodId::AgentStartRuntimeV1OrchestrationServiceWorkerStart => {
                Self::Orchestration(orchestration::Method::WorkerStart)
            }
            MethodId::AgentStartRuntimeV1OrchestrationServiceWorkerShow => {
                Self::Orchestration(orchestration::Method::WorkerShow)
            }
            MethodId::AgentStartRuntimeV1OrchestrationServiceWorkerRead => {
                Self::Orchestration(orchestration::Method::WorkerRead)
            }
            MethodId::AgentStartRuntimeV1OrchestrationServiceWorkerStop => {
                Self::Orchestration(orchestration::Method::WorkerStop)
            }
            MethodId::AgentStartRuntimeV1OrchestrationServiceWorkerAbandon => {
                Self::Orchestration(orchestration::Method::WorkerAbandon)
            }
            MethodId::AgentStartRuntimeV1OrchestrationServiceFederationAttachStart => {
                Self::Orchestration(orchestration::Method::FederationAttachStart)
            }
            MethodId::AgentStartRuntimeV1OrchestrationServiceFederationPull => {
                Self::Orchestration(orchestration::Method::FederationPull)
            }
            MethodId::AgentStartRuntimeV1OrchestrationServiceFederationAck => {
                Self::Orchestration(orchestration::Method::FederationAck)
            }
            MethodId::AgentStartRuntimeV1OrchestrationServiceFederationImport => {
                Self::Orchestration(orchestration::Method::FederationImport)
            }
            MethodId::AgentStartRuntimeV1OrchestrationServiceFederationShow => {
                Self::Orchestration(orchestration::Method::FederationShow)
            }
            MethodId::AgentStartRuntimeV1OrchestrationServiceFederationRead => {
                Self::Orchestration(orchestration::Method::FederationRead)
            }
            MethodId::AgentStartRuntimeV1OrchestrationServiceFederationReadOutput => {
                Self::Orchestration(orchestration::Method::FederationReadOutput)
            }
            MethodId::AgentStartRuntimeV1OrchestrationServiceFederationStop => {
                Self::Orchestration(orchestration::Method::FederationStop)
            }
            MethodId::AgentStartRuntimeV1SettingsServiceGetDocument => {
                Self::Preferences(preferences::Method::SettingsServiceGetDocument)
            }
            MethodId::AgentStartRuntimeV1SettingsServiceSetDocument => {
                Self::Preferences(preferences::Method::SettingsServiceSetDocument)
            }
            MethodId::AgentStartRuntimeV1SettingsServiceGet => {
                Self::Preferences(preferences::Method::SettingsServiceGet)
            }
            MethodId::AgentStartRuntimeV1SettingsServiceUpdate => {
                Self::Preferences(preferences::Method::SettingsServiceUpdate)
            }
            MethodId::AgentStartRuntimeV1SettingsServiceGetTerminalQuickCommands => {
                Self::Preferences(preferences::Method::SettingsServiceGetTerminalQuickCommands)
            }
            MethodId::AgentStartRuntimeV1SettingsServiceUpdateTerminalQuickCommands => {
                Self::Preferences(preferences::Method::SettingsServiceUpdateTerminalQuickCommands)
            }
            MethodId::AgentStartRuntimeV1SettingsServiceUpdatePrBotAuthorOverride => {
                Self::Preferences(preferences::Method::SettingsServiceUpdatePrBotAuthorOverride)
            }
            MethodId::AgentStartRuntimeV1SettingsServiceListFonts => {
                Self::Preferences(preferences::Method::SettingsServiceListFonts)
            }
            MethodId::AgentStartRuntimeV1SettingsServicePreviewGhosttyImport => {
                Self::Preferences(preferences::Method::SettingsServicePreviewGhosttyImport)
            }
            MethodId::AgentStartRuntimeV1SettingsServicePreviewWarpThemeImport => {
                Self::Preferences(preferences::Method::SettingsServicePreviewWarpThemeImport)
            }
            MethodId::AgentStartRuntimeV1UiServiceGet => {
                Self::Preferences(preferences::Method::UiServiceGet)
            }
            MethodId::AgentStartRuntimeV1UiServiceSet => {
                Self::Preferences(preferences::Method::UiServiceSet)
            }
            MethodId::AgentStartRuntimeV1UiServiceRecordFeatureInteraction => {
                Self::Preferences(preferences::Method::UiServiceRecordFeatureInteraction)
            }
            MethodId::AgentStartRuntimeV1ShellKeybindingsServiceGet => {
                Self::Preferences(preferences::Method::ShellKeybindingsServiceGet)
            }
            MethodId::AgentStartRuntimeV1ShellKeybindingsServiceEnsureFile => {
                Self::Preferences(preferences::Method::ShellKeybindingsServiceEnsureFile)
            }
            MethodId::AgentStartRuntimeV1ShellKeybindingsServiceReload => {
                Self::Preferences(preferences::Method::ShellKeybindingsServiceReload)
            }
            MethodId::AgentStartRuntimeV1ShellKeybindingsServiceOpenFile => {
                Self::Preferences(preferences::Method::ShellKeybindingsServiceOpenFile)
            }
            MethodId::AgentStartRuntimeV1ShellKeybindingsServiceRevealFile => {
                Self::Preferences(preferences::Method::ShellKeybindingsServiceRevealFile)
            }
            MethodId::AgentStartRuntimeV1ShellKeybindingsServiceSetAction => {
                Self::Preferences(preferences::Method::ShellKeybindingsServiceSetAction)
            }
            MethodId::AgentStartRuntimeV1ShellAgentStartProfilesServiceList => {
                Self::Preferences(preferences::Method::ShellAgentStartProfilesServiceList)
            }
            MethodId::AgentStartRuntimeV1ShellAgentStartProfilesServiceCreateLocal => {
                Self::Preferences(preferences::Method::ShellAgentStartProfilesServiceCreateLocal)
            }
            MethodId::AgentStartRuntimeV1ShellAgentStartProfilesServiceSwitchProfile => {
                Self::Preferences(preferences::Method::ShellAgentStartProfilesServiceSwitchProfile)
            }
            MethodId::AgentStartRuntimeV1ShellAgentStartProfilesServiceTransferProject => {
                Self::Preferences(
                    preferences::Method::ShellAgentStartProfilesServiceTransferProject,
                )
            }
            MethodId::AgentStartRuntimeV1ShellAgentStartProfilesServiceFindProjectProfiles => {
                Self::Preferences(
                    preferences::Method::ShellAgentStartProfilesServiceFindProjectProfiles,
                )
            }
            MethodId::AgentStartRuntimeV1ShellCacheServiceGetGitHub => {
                Self::Preferences(preferences::Method::ShellCacheServiceGetGitHub)
            }
            MethodId::AgentStartRuntimeV1ShellCacheServiceSetGitHub => {
                Self::Preferences(preferences::Method::ShellCacheServiceSetGitHub)
            }
            MethodId::AgentStartRuntimeV1ShellOnboardingServiceGet => {
                Self::Preferences(preferences::Method::ShellOnboardingServiceGet)
            }
            MethodId::AgentStartRuntimeV1ShellOnboardingServiceUpdate => {
                Self::Preferences(preferences::Method::ShellOnboardingServiceUpdate)
            }
            MethodId::AgentStartRuntimeV1ClientEventsServiceUnsubscribe => {
                Self::Preferences(preferences::Method::ClientEventsServiceUnsubscribe)
            }
            MethodId::AgentStartRuntimeV1ClientEventsServiceSubscribe => {
                Self::Preferences(preferences::Method::ClientEventsServiceSubscribe)
            }
            MethodId::AgentStartRuntimeV1ShellEventsServiceSubscribe => {
                Self::Preferences(preferences::Method::ShellEventsServiceSubscribe)
            }
            MethodId::AgentStartRuntimeV1ProgressEventsServiceSubscribe => {
                Self::Preferences(preferences::Method::ProgressEventsServiceSubscribe)
            }
            MethodId::AgentStartRuntimeV1RepoServiceGetHooks => {
                Self::Projects(projects::Method::RepoServiceGetHooks)
            }
            MethodId::AgentStartRuntimeV1RepoServiceList => {
                Self::Projects(projects::Method::RepoServiceList)
            }
            MethodId::AgentStartRuntimeV1RepoServiceAdd => {
                Self::Projects(projects::Method::RepoServiceAdd)
            }
            MethodId::AgentStartRuntimeV1RepoServiceBaseRefDefault => {
                Self::Projects(projects::Method::RepoServiceBaseRefDefault)
            }
            MethodId::AgentStartRuntimeV1RepoServiceSearchRefs => {
                Self::Projects(projects::Method::RepoServiceSearchRefs)
            }
            MethodId::AgentStartRuntimeV1ProjectGroupServiceList => {
                Self::Projects(projects::Method::ProjectGroupServiceList)
            }
            MethodId::AgentStartRuntimeV1ProjectGroupServiceCreate => {
                Self::Projects(projects::Method::ProjectGroupServiceCreate)
            }
            MethodId::AgentStartRuntimeV1ProjectGroupServiceUpdate => {
                Self::Projects(projects::Method::ProjectGroupServiceUpdate)
            }
            MethodId::AgentStartRuntimeV1ProjectGroupServiceDelete => {
                Self::Projects(projects::Method::ProjectGroupServiceDelete)
            }
            MethodId::AgentStartRuntimeV1ProjectGroupServiceMoveProject => {
                Self::Projects(projects::Method::ProjectGroupServiceMoveProject)
            }
            MethodId::AgentStartRuntimeV1ProjectGroupServiceScanNested => {
                Self::Projects(projects::Method::ProjectGroupServiceScanNested)
            }
            MethodId::AgentStartRuntimeV1ProjectGroupServiceCancelNestedScan => {
                Self::Projects(projects::Method::ProjectGroupServiceCancelNestedScan)
            }
            MethodId::AgentStartRuntimeV1ProjectGroupServiceImportNested => {
                Self::Projects(projects::Method::ProjectGroupServiceImportNested)
            }
            MethodId::AgentStartRuntimeV1ProjectGroupServiceSubscribeEvents => {
                Self::Projects(projects::Method::ProjectGroupServiceSubscribeEvents)
            }
            MethodId::AgentStartRuntimeV1RepoServiceClone => {
                Self::Projects(projects::Method::RepoServiceClone)
            }
            MethodId::AgentStartRuntimeV1RepoServiceCreate => {
                Self::Projects(projects::Method::RepoServiceCreate)
            }
            MethodId::AgentStartRuntimeV1RepoServiceGitAvailable => {
                Self::Projects(projects::Method::RepoServiceGitAvailable)
            }
            MethodId::AgentStartRuntimeV1RepoServiceReorder => {
                Self::Projects(projects::Method::RepoServiceReorder)
            }
            MethodId::AgentStartRuntimeV1RepoServiceRm => {
                Self::Projects(projects::Method::RepoServiceRm)
            }
            MethodId::AgentStartRuntimeV1RepoServiceUpdate => {
                Self::Projects(projects::Method::RepoServiceUpdate)
            }
            MethodId::AgentStartRuntimeV1RepoServiceHooks => {
                Self::Projects(projects::Method::RepoServiceHooks)
            }
            MethodId::AgentStartRuntimeV1RepoServiceHooksCheck => {
                Self::Projects(projects::Method::RepoServiceHooksCheck)
            }
            MethodId::AgentStartRuntimeV1RepoServiceSetupScriptImports => {
                Self::Projects(projects::Method::RepoServiceSetupScriptImports)
            }
            MethodId::AgentStartRuntimeV1RepoServiceSparsePresets => {
                Self::Projects(projects::Method::RepoServiceSparsePresets)
            }
            MethodId::AgentStartRuntimeV1RepoServiceSaveSparsePreset => {
                Self::Projects(projects::Method::RepoServiceSaveSparsePreset)
            }
            MethodId::AgentStartRuntimeV1RepoServiceRemoveSparsePreset => {
                Self::Projects(projects::Method::RepoServiceRemoveSparsePreset)
            }
            MethodId::AgentStartRuntimeV1ShellRepoHostServiceCloneAbort => {
                Self::Projects(projects::Method::ShellRepoHostServiceCloneAbort)
            }
            MethodId::AgentStartRuntimeV1ShellRepoHostServiceGetDefaultCreateProjectParent => {
                Self::Projects(projects::Method::ShellRepoHostServiceGetDefaultCreateProjectParent)
            }
            MethodId::AgentStartRuntimeV1ShellRepoHostServicePickDirectory => {
                Self::Projects(projects::Method::ShellRepoHostServicePickDirectory)
            }
            MethodId::AgentStartRuntimeV1ShellRepoHostServicePickFolder => {
                Self::Projects(projects::Method::ShellRepoHostServicePickFolder)
            }
            MethodId::AgentStartRuntimeV1ShellRepoHostServicePickFolders => {
                Self::Projects(projects::Method::ShellRepoHostServicePickFolders)
            }
            MethodId::AgentStartRuntimeV1ShellRepoHostServiceRemoveForHost => {
                Self::Projects(projects::Method::ShellRepoHostServiceRemoveForHost)
            }
            MethodId::AgentStartRuntimeV1ShellRepoHostServiceReorderForHost => {
                Self::Projects(projects::Method::ShellRepoHostServiceReorderForHost)
            }
            MethodId::AgentStartRuntimeV1ProjectHostSetupServiceList => {
                Self::Projects(projects::Method::ProjectHostSetupServiceList)
            }
            MethodId::AgentStartRuntimeV1ProjectHostSetupServiceCreate => {
                Self::Projects(projects::Method::ProjectHostSetupServiceCreate)
            }
            MethodId::AgentStartRuntimeV1ProjectHostSetupServiceSetupExistingFolder => {
                Self::Projects(projects::Method::ProjectHostSetupServiceSetupExistingFolder)
            }
            MethodId::AgentStartRuntimeV1ProjectHostSetupServiceClone => {
                Self::Projects(projects::Method::ProjectHostSetupServiceClone)
            }
            MethodId::AgentStartRuntimeV1ProjectHostSetupServiceUpdate => {
                Self::Projects(projects::Method::ProjectHostSetupServiceUpdate)
            }
            MethodId::AgentStartRuntimeV1ProjectHostSetupServiceDelete => {
                Self::Projects(projects::Method::ProjectHostSetupServiceDelete)
            }
            MethodId::AgentStartRuntimeV1FolderWorkspaceServiceList => {
                Self::Projects(projects::Method::FolderWorkspaceServiceList)
            }
            MethodId::AgentStartRuntimeV1FolderWorkspaceServiceCreate => {
                Self::Projects(projects::Method::FolderWorkspaceServiceCreate)
            }
            MethodId::AgentStartRuntimeV1FolderWorkspaceServiceUpdate => {
                Self::Projects(projects::Method::FolderWorkspaceServiceUpdate)
            }
            MethodId::AgentStartRuntimeV1FolderWorkspaceServiceDelete => {
                Self::Projects(projects::Method::FolderWorkspaceServiceDelete)
            }
            MethodId::AgentStartRuntimeV1FolderWorkspaceServiceGetPathStatus => {
                Self::Projects(projects::Method::FolderWorkspaceServiceGetPathStatus)
            }
            MethodId::AgentStartRuntimeV1ProjectServiceList => {
                Self::Projects(projects::Method::ProjectServiceList)
            }
            MethodId::AgentStartRuntimeV1ProjectServiceUpdate => {
                Self::Projects(projects::Method::ProjectServiceUpdate)
            }
            MethodId::AgentStartRuntimeV1ProjectContextServiceResolve => {
                Self::Projects(projects::Method::ProjectContextServiceResolve)
            }
            MethodId::AgentStartRuntimeV1AppControlServiceRecordStartupDiagnostic => {
                Self::Runtime(runtime::Method::AppControlServiceRecordStartupDiagnostic)
            }
            MethodId::AgentStartRuntimeV1AppControlServiceRestart => {
                Self::Runtime(runtime::Method::AppControlServiceRestart)
            }
            MethodId::AgentStartRuntimeV1CliServiceGetInstallStatus => {
                Self::Runtime(runtime::Method::CliServiceGetInstallStatus)
            }
            MethodId::AgentStartRuntimeV1CliServiceInstall => {
                Self::Runtime(runtime::Method::CliServiceInstall)
            }
            MethodId::AgentStartRuntimeV1CliServiceRemove => {
                Self::Runtime(runtime::Method::CliServiceRemove)
            }
            MethodId::AgentStartRuntimeV1CliServiceGetWslInstallStatus => {
                Self::Runtime(runtime::Method::CliServiceGetWslInstallStatus)
            }
            MethodId::AgentStartRuntimeV1CliServiceInstallWsl => {
                Self::Runtime(runtime::Method::CliServiceInstallWsl)
            }
            MethodId::AgentStartRuntimeV1CliServiceRemoveWsl => {
                Self::Runtime(runtime::Method::CliServiceRemoveWsl)
            }
            MethodId::AgentStartRuntimeV1DeveloperPermissionsServiceGetStatus => {
                Self::Runtime(runtime::Method::DeveloperPermissionsServiceGetStatus)
            }
            MethodId::AgentStartRuntimeV1DeveloperPermissionsServiceRequest => {
                Self::Runtime(runtime::Method::DeveloperPermissionsServiceRequest)
            }
            MethodId::AgentStartRuntimeV1WindowsFirewallServiceGetStatus => {
                Self::Runtime(runtime::Method::WindowsFirewallServiceGetStatus)
            }
            MethodId::AgentStartRuntimeV1WindowsFirewallServiceRepair => {
                Self::Runtime(runtime::Method::WindowsFirewallServiceRepair)
            }
            MethodId::AgentStartRuntimeV1WindowsFirewallServiceOpenNetworkSettings => {
                Self::Runtime(runtime::Method::WindowsFirewallServiceOpenNetworkSettings)
            }
            MethodId::AgentStartRuntimeV1HostRegistryServiceIsWslAvailable => {
                Self::Runtime(runtime::Method::HostRegistryServiceIsWslAvailable)
            }
            MethodId::AgentStartRuntimeV1HostRegistryServiceListWslDistros => {
                Self::Runtime(runtime::Method::HostRegistryServiceListWslDistros)
            }
            MethodId::AgentStartRuntimeV1HostRegistryServiceIsGitBashAvailable => {
                Self::Runtime(runtime::Method::HostRegistryServiceIsGitBashAvailable)
            }
            MethodId::AgentStartRuntimeV1HostRegistryServiceIsPwshAvailable => {
                Self::Runtime(runtime::Method::HostRegistryServiceIsPwshAvailable)
            }
            MethodId::AgentStartRuntimeV1HostRegistryServiceMarkAgentTrusted => {
                Self::Runtime(runtime::Method::HostRegistryServiceMarkAgentTrusted)
            }
            MethodId::AgentStartRuntimeV1HostRegistryServiceAdd => {
                Self::Runtime(runtime::Method::HostRegistryServiceAdd)
            }
            MethodId::AgentStartRuntimeV1HostRegistryServiceList => {
                Self::Runtime(runtime::Method::HostRegistryServiceList)
            }
            MethodId::AgentStartRuntimeV1HostRegistryServiceProbe => {
                Self::Runtime(runtime::Method::HostRegistryServiceProbe)
            }
            MethodId::AgentStartRuntimeV1HostRegistryServiceRemove => {
                Self::Runtime(runtime::Method::HostRegistryServiceRemove)
            }
            MethodId::AgentStartRuntimeV1MobilePairingServiceCreateDevelopmentOffer => {
                Self::Runtime(runtime::Method::MobilePairingServiceCreateDevelopmentOffer)
            }
            MethodId::AgentStartRuntimeV1MobilePairingServiceGetPairingQr => {
                Self::Runtime(runtime::Method::MobilePairingServiceGetPairingQr)
            }
            MethodId::AgentStartRuntimeV1MobilePairingServiceListDevices => {
                Self::Runtime(runtime::Method::MobilePairingServiceListDevices)
            }
            MethodId::AgentStartRuntimeV1MobilePairingServiceListNetworkInterfaces => {
                Self::Runtime(runtime::Method::MobilePairingServiceListNetworkInterfaces)
            }
            MethodId::AgentStartRuntimeV1MobilePairingServiceRevokeDevice => {
                Self::Runtime(runtime::Method::MobilePairingServiceRevokeDevice)
            }
            MethodId::AgentStartRuntimeV1RuntimeEnvironmentServiceGenerateOffer => {
                Self::Runtime(runtime::Method::RuntimeEnvironmentServiceGenerateOffer)
            }
            MethodId::AgentStartRuntimeV1RuntimeEnvironmentServiceDisconnect => {
                Self::Runtime(runtime::Method::RuntimeEnvironmentServiceDisconnect)
            }
            MethodId::AgentStartRuntimeV1RuntimeEnvironmentServiceGetStatus => {
                Self::Runtime(runtime::Method::RuntimeEnvironmentServiceGetStatus)
            }
            MethodId::AgentStartRuntimeV1RuntimeEnvironmentServiceImport => {
                Self::Runtime(runtime::Method::RuntimeEnvironmentServiceImport)
            }
            MethodId::AgentStartRuntimeV1RuntimeEnvironmentServiceList => {
                Self::Runtime(runtime::Method::RuntimeEnvironmentServiceList)
            }
            MethodId::AgentStartRuntimeV1RuntimeEnvironmentServiceListPeers => {
                Self::Runtime(runtime::Method::RuntimeEnvironmentServiceListPeers)
            }
            MethodId::AgentStartRuntimeV1RuntimeEnvironmentServiceRemove => {
                Self::Runtime(runtime::Method::RuntimeEnvironmentServiceRemove)
            }
            MethodId::AgentStartRuntimeV1RuntimeEnvironmentServiceRevokePeer => {
                Self::Runtime(runtime::Method::RuntimeEnvironmentServiceRevokePeer)
            }
            MethodId::AgentStartRuntimeV1StatusServiceGetStatus => {
                Self::Runtime(runtime::Method::StatusServiceGetStatus)
            }
            MethodId::AgentStartRuntimeV1UpdaterServiceCheck => {
                Self::Runtime(runtime::Method::UpdaterServiceCheck)
            }
            MethodId::AgentStartRuntimeV1UpdaterServiceDownload => {
                Self::Runtime(runtime::Method::UpdaterServiceDownload)
            }
            MethodId::AgentStartRuntimeV1UpdaterServiceGetStatus => {
                Self::Runtime(runtime::Method::UpdaterServiceGetStatus)
            }
            MethodId::AgentStartRuntimeV1UpdaterServiceGetVersion => {
                Self::Runtime(runtime::Method::UpdaterServiceGetVersion)
            }
            MethodId::AgentStartRuntimeV1UpdaterServiceInstall => {
                Self::Runtime(runtime::Method::UpdaterServiceInstall)
            }
            MethodId::AgentStartRuntimeV1UpdaterServiceSubscribeStatus => {
                Self::Runtime(runtime::Method::UpdaterServiceSubscribeStatus)
            }
            MethodId::AgentStartRuntimeV1ShellPlatformServiceOpenPath => {
                Self::Runtime(runtime::Method::ShellPlatformServiceOpenPath)
            }
            MethodId::AgentStartRuntimeV1ShellPlatformServiceGetSystemAccentColor => {
                Self::Runtime(runtime::Method::ShellPlatformServiceGetSystemAccentColor)
            }
            MethodId::AgentStartRuntimeV1ShellPlatformServiceOpenFileUri => {
                Self::Runtime(runtime::Method::ShellPlatformServiceOpenFileUri)
            }
            MethodId::AgentStartRuntimeV1ShellPlatformServiceOpenInExternalEditor => {
                Self::Runtime(runtime::Method::ShellPlatformServiceOpenInExternalEditor)
            }
            MethodId::AgentStartRuntimeV1ShellPlatformServiceOpenInFileManager => {
                Self::Runtime(runtime::Method::ShellPlatformServiceOpenInFileManager)
            }
            MethodId::AgentStartRuntimeV1ShellPlatformServiceOpenFilePath => {
                Self::Runtime(runtime::Method::ShellPlatformServiceOpenFilePath)
            }
            MethodId::AgentStartRuntimeV1ShellPlatformServicePathExists => {
                Self::Runtime(runtime::Method::ShellPlatformServicePathExists)
            }
            MethodId::AgentStartRuntimeV1ShellPlatformServicePickAttachment => {
                Self::Runtime(runtime::Method::ShellPlatformServicePickAttachment)
            }
            MethodId::AgentStartRuntimeV1ShellPlatformServicePickImage => {
                Self::Runtime(runtime::Method::ShellPlatformServicePickImage)
            }
            MethodId::AgentStartRuntimeV1ShellPlatformServicePickAudio => {
                Self::Runtime(runtime::Method::ShellPlatformServicePickAudio)
            }
            MethodId::AgentStartRuntimeV1ShellPlatformServicePickDirectory => {
                Self::Runtime(runtime::Method::ShellPlatformServicePickDirectory)
            }
            MethodId::AgentStartRuntimeV1PreflightServiceCheck => {
                Self::Runtime(runtime::Method::PreflightServiceCheck)
            }
            MethodId::AgentStartRuntimeV1PreflightServiceDetectAgents => {
                Self::Runtime(runtime::Method::PreflightServiceDetectAgents)
            }
            MethodId::AgentStartRuntimeV1PreflightServiceDetectRemoteAgents => {
                Self::Runtime(runtime::Method::PreflightServiceDetectRemoteAgents)
            }
            MethodId::AgentStartRuntimeV1PreflightServiceRefreshAgents => {
                Self::Runtime(runtime::Method::PreflightServiceRefreshAgents)
            }
            MethodId::AgentStartRuntimeV1DiagnosticsServiceGetMemorySnapshot => {
                Self::Support(support::Method::DiagnosticsServiceGetMemorySnapshot)
            }
            MethodId::AgentStartRuntimeV1DiagnosticsServiceGetStatus => {
                Self::Support(support::Method::DiagnosticsServiceGetStatus)
            }
            MethodId::AgentStartRuntimeV1DiagnosticsServiceCollectBundle => {
                Self::Support(support::Method::DiagnosticsServiceCollectBundle)
            }
            MethodId::AgentStartRuntimeV1DiagnosticsServiceOpenBundlePreview => {
                Self::Support(support::Method::DiagnosticsServiceOpenBundlePreview)
            }
            MethodId::AgentStartRuntimeV1DiagnosticsServiceDiscardBundlePreview => {
                Self::Support(support::Method::DiagnosticsServiceDiscardBundlePreview)
            }
            MethodId::AgentStartRuntimeV1DiagnosticsServiceUploadBundle => {
                Self::Support(support::Method::DiagnosticsServiceUploadBundle)
            }
            MethodId::AgentStartRuntimeV1NotificationsServiceDismiss => {
                Self::Support(support::Method::NotificationsServiceDismiss)
            }
            MethodId::AgentStartRuntimeV1NotificationsServiceReport => {
                Self::Support(support::Method::NotificationsServiceReport)
            }
            MethodId::AgentStartRuntimeV1NotificationsServiceGetMissedSince => {
                Self::Support(support::Method::NotificationsServiceGetMissedSince)
            }
            MethodId::AgentStartRuntimeV1NotificationsServiceLoadCustomSound => {
                Self::Support(support::Method::NotificationsServiceLoadCustomSound)
            }
            MethodId::AgentStartRuntimeV1NotificationsServiceSubscribe => {
                Self::Support(support::Method::NotificationsServiceSubscribe)
            }
            MethodId::AgentStartRuntimeV1StarNagShellServiceDismiss => {
                Self::Support(support::Method::StarNagShellServiceDismiss)
            }
            MethodId::AgentStartRuntimeV1StarNagShellServiceLater => {
                Self::Support(support::Method::StarNagShellServiceLater)
            }
            MethodId::AgentStartRuntimeV1StarNagShellServiceComplete => {
                Self::Support(support::Method::StarNagShellServiceComplete)
            }
            MethodId::AgentStartRuntimeV1StarNagShellServiceOpenWeb => {
                Self::Support(support::Method::StarNagShellServiceOpenWeb)
            }
            MethodId::AgentStartRuntimeV1StarNagShellServiceStarAgentStart => {
                Self::Support(support::Method::StarNagShellServiceStarAgentStart)
            }
            MethodId::AgentStartRuntimeV1StarNagShellServiceAgentValueMoment => {
                Self::Support(support::Method::StarNagShellServiceAgentValueMoment)
            }
            MethodId::AgentStartRuntimeV1StarNagShellServiceShowAgentValueMoment => {
                Self::Support(support::Method::StarNagShellServiceShowAgentValueMoment)
            }
            MethodId::AgentStartRuntimeV1StarNagShellServiceOnboardingCompleted => {
                Self::Support(support::Method::StarNagShellServiceOnboardingCompleted)
            }
            MethodId::AgentStartRuntimeV1FeedbackServiceSubmit => {
                Self::Support(support::Method::FeedbackServiceSubmit)
            }
            MethodId::AgentStartRuntimeV1CrashReportsServiceGetLatestPending => {
                Self::Support(support::Method::CrashReportsServiceGetLatestPending)
            }
            MethodId::AgentStartRuntimeV1CrashReportsServiceGetLatestReport => {
                Self::Support(support::Method::CrashReportsServiceGetLatestReport)
            }
            MethodId::AgentStartRuntimeV1CrashReportsServiceDismiss => {
                Self::Support(support::Method::CrashReportsServiceDismiss)
            }
            MethodId::AgentStartRuntimeV1CrashReportsServiceRecordRendererError => {
                Self::Support(support::Method::CrashReportsServiceRecordRendererError)
            }
            MethodId::AgentStartRuntimeV1CrashReportsServiceSubmit => {
                Self::Support(support::Method::CrashReportsServiceSubmit)
            }
            MethodId::AgentStartRuntimeV1CrashReportsServiceCopyLatestDiagnostics => {
                Self::Support(support::Method::CrashReportsServiceCopyLatestDiagnostics)
            }
            MethodId::AgentStartRuntimeV1CrashReportsServiceRecordBreadcrumb => {
                Self::Support(support::Method::CrashReportsServiceRecordBreadcrumb)
            }
            MethodId::AgentStartRuntimeV1ShellTelemetryServiceTrack => {
                Self::Support(support::Method::ShellTelemetryServiceTrack)
            }
            MethodId::AgentStartRuntimeV1ShellTelemetryServiceGetConsentState => {
                Self::Support(support::Method::ShellTelemetryServiceGetConsentState)
            }
            MethodId::AgentStartRuntimeV1ShellTelemetryServiceSetOptIn => {
                Self::Support(support::Method::ShellTelemetryServiceSetOptIn)
            }
            MethodId::AgentStartRuntimeV1ShellTelemetryServiceAcknowledgeBanner => {
                Self::Support(support::Method::ShellTelemetryServiceAcknowledgeBanner)
            }
            MethodId::AgentStartRuntimeV1TerminalFitServiceGetDrivers => {
                Self::Terminal(terminal::Method::TerminalFitServiceGetDrivers)
            }
            MethodId::AgentStartRuntimeV1TerminalFitServiceGetOverrides => {
                Self::Terminal(terminal::Method::TerminalFitServiceGetOverrides)
            }
            MethodId::AgentStartRuntimeV1TerminalFitServiceRestore => {
                Self::Terminal(terminal::Method::TerminalFitServiceRestore)
            }
            MethodId::AgentStartRuntimeV1TerminalPreferencesServiceGetAutoRestoreFit => {
                Self::Terminal(terminal::Method::TerminalPreferencesServiceGetAutoRestoreFit)
            }
            MethodId::AgentStartRuntimeV1TerminalPreferencesServiceSetAutoRestoreFit => {
                Self::Terminal(terminal::Method::TerminalPreferencesServiceSetAutoRestoreFit)
            }
            MethodId::AgentStartRuntimeV1TerminalServiceList => {
                Self::Terminal(terminal::Method::TerminalServiceList)
            }
            MethodId::AgentStartRuntimeV1TerminalServiceCreate => {
                Self::Terminal(terminal::Method::TerminalServiceCreate)
            }
            MethodId::AgentStartRuntimeV1TerminalServiceRead => {
                Self::Terminal(terminal::Method::TerminalServiceRead)
            }
            MethodId::AgentStartRuntimeV1TerminalServiceSend => {
                Self::Terminal(terminal::Method::TerminalServiceSend)
            }
            MethodId::AgentStartRuntimeV1TerminalServiceClose => {
                Self::Terminal(terminal::Method::TerminalServiceClose)
            }
            MethodId::AgentStartRuntimeV1TerminalServiceFocus => {
                Self::Terminal(terminal::Method::TerminalServiceFocus)
            }
            MethodId::AgentStartRuntimeV1LayoutServiceList => {
                Self::Terminal(terminal::Method::LayoutServiceList)
            }
            MethodId::AgentStartRuntimeV1LayoutServiceApply => {
                Self::Terminal(terminal::Method::LayoutServiceApply)
            }
            MethodId::AgentStartRuntimeV1SessionTabsServiceActivate => {
                Self::Terminal(terminal::Method::SessionTabsServiceActivate)
            }
            MethodId::AgentStartRuntimeV1SessionTabsServiceClose => {
                Self::Terminal(terminal::Method::SessionTabsServiceClose)
            }
            MethodId::AgentStartRuntimeV1SessionTabsServiceCreateTerminal => {
                Self::Terminal(terminal::Method::SessionTabsServiceCreateTerminal)
            }
            MethodId::AgentStartRuntimeV1SessionTabsServiceList => {
                Self::Terminal(terminal::Method::SessionTabsServiceList)
            }
            MethodId::AgentStartRuntimeV1SessionTabsServiceListAll => {
                Self::Terminal(terminal::Method::SessionTabsServiceListAll)
            }
            MethodId::AgentStartRuntimeV1SessionTabsServiceMove => {
                Self::Terminal(terminal::Method::SessionTabsServiceMove)
            }
            MethodId::AgentStartRuntimeV1SessionTabsServiceSetTabProps => {
                Self::Terminal(terminal::Method::SessionTabsServiceSetTabProps)
            }
            MethodId::AgentStartRuntimeV1SessionTabsServiceUpdatePaneLayout => {
                Self::Terminal(terminal::Method::SessionTabsServiceUpdatePaneLayout)
            }
            MethodId::AgentStartRuntimeV1SessionTabsServiceSubscribe => {
                Self::Terminal(terminal::Method::SessionTabsServiceSubscribe)
            }
            MethodId::AgentStartRuntimeV1SessionTabsServiceSubscribeAll => {
                Self::Terminal(terminal::Method::SessionTabsServiceSubscribeAll)
            }
            MethodId::AgentStartRuntimeV1SessionTabsServiceUnsubscribe => {
                Self::Terminal(terminal::Method::SessionTabsServiceUnsubscribe)
            }
            MethodId::AgentStartRuntimeV1SessionTabsServiceUnsubscribeAll => {
                Self::Terminal(terminal::Method::SessionTabsServiceUnsubscribeAll)
            }
            MethodId::AgentStartRuntimeV1TerminalServiceClearBuffer => {
                Self::Terminal(terminal::Method::TerminalServiceClearBuffer)
            }
            MethodId::AgentStartRuntimeV1TerminalServiceCloseTab => {
                Self::Terminal(terminal::Method::TerminalServiceCloseTab)
            }
            MethodId::AgentStartRuntimeV1TerminalServiceGetDisplayMode => {
                Self::Terminal(terminal::Method::TerminalServiceGetDisplayMode)
            }
            MethodId::AgentStartRuntimeV1TerminalServiceSetDisplayMode => {
                Self::Terminal(terminal::Method::TerminalServiceSetDisplayMode)
            }
            MethodId::AgentStartRuntimeV1TerminalServiceInspectProcess => {
                Self::Terminal(terminal::Method::TerminalServiceInspectProcess)
            }
            MethodId::AgentStartRuntimeV1TerminalServiceIsRunningAgent => {
                Self::Terminal(terminal::Method::TerminalServiceIsRunningAgent)
            }
            MethodId::AgentStartRuntimeV1TerminalServiceGetAgentStatus => {
                Self::Terminal(terminal::Method::TerminalServiceGetAgentStatus)
            }
            MethodId::AgentStartRuntimeV1TerminalServiceListManagedSessions => {
                Self::Terminal(terminal::Method::TerminalServiceListManagedSessions)
            }
            MethodId::AgentStartRuntimeV1TerminalServiceKillAllManaged => {
                Self::Terminal(terminal::Method::TerminalServiceKillAllManaged)
            }
            MethodId::AgentStartRuntimeV1TerminalServiceKillManaged => {
                Self::Terminal(terminal::Method::TerminalServiceKillManaged)
            }
            MethodId::AgentStartRuntimeV1TerminalServiceRestartManaged => {
                Self::Terminal(terminal::Method::TerminalServiceRestartManaged)
            }
            MethodId::AgentStartRuntimeV1TerminalServiceRename => {
                Self::Terminal(terminal::Method::TerminalServiceRename)
            }
            MethodId::AgentStartRuntimeV1TerminalServiceShow => {
                Self::Terminal(terminal::Method::TerminalServiceShow)
            }
            MethodId::AgentStartRuntimeV1TerminalServiceResizeForClient => {
                Self::Terminal(terminal::Method::TerminalServiceResizeForClient)
            }
            MethodId::AgentStartRuntimeV1TerminalServiceResolveActive => {
                Self::Terminal(terminal::Method::TerminalServiceResolveActive)
            }
            MethodId::AgentStartRuntimeV1TerminalServiceResolvePane => {
                Self::Terminal(terminal::Method::TerminalServiceResolvePane)
            }
            MethodId::AgentStartRuntimeV1TerminalServiceSplit => {
                Self::Terminal(terminal::Method::TerminalServiceSplit)
            }
            MethodId::AgentStartRuntimeV1TerminalServiceStop => {
                Self::Terminal(terminal::Method::TerminalServiceStop)
            }
            MethodId::AgentStartRuntimeV1TerminalServiceStopExact => {
                Self::Terminal(terminal::Method::TerminalServiceStopExact)
            }
            MethodId::AgentStartRuntimeV1TerminalServiceUnsubscribe => {
                Self::Terminal(terminal::Method::TerminalServiceUnsubscribe)
            }
            MethodId::AgentStartRuntimeV1TerminalServiceUpdateViewAttributes => {
                Self::Terminal(terminal::Method::TerminalServiceUpdateViewAttributes)
            }
            MethodId::AgentStartRuntimeV1TerminalServiceUpdateViewport => {
                Self::Terminal(terminal::Method::TerminalServiceUpdateViewport)
            }
            MethodId::AgentStartRuntimeV1TerminalServiceRestoreDesktopFit => {
                Self::Terminal(terminal::Method::TerminalServiceRestoreDesktopFit)
            }
            MethodId::AgentStartRuntimeV1TerminalServiceWait => {
                Self::Terminal(terminal::Method::TerminalServiceWait)
            }
            MethodId::AgentStartRuntimeV1TerminalServiceApprove => {
                Self::Terminal(terminal::Method::TerminalServiceApprove)
            }
            MethodId::AgentStartRuntimeV1TerminalServiceMultiplex => {
                Self::Terminal(terminal::Method::TerminalServiceMultiplex)
            }
            MethodId::AgentStartRuntimeV1TerminalServiceOpenMultiplex => {
                Self::Terminal(terminal::Method::TerminalServiceOpenMultiplex)
            }
            MethodId::AgentStartRuntimeV1DriverEventsServiceSubscribe => {
                Self::Terminal(terminal::Method::DriverEventsServiceSubscribe)
            }
            MethodId::AgentStartRuntimeV1WorktreeLabelsServiceRegister => {
                Self::Workspaces(workspaces::Method::WorktreeLabelsServiceRegister)
            }
            MethodId::AgentStartRuntimeV1WorktreeServicePs => {
                Self::Workspaces(workspaces::Method::WorktreeServicePs)
            }
            MethodId::AgentStartRuntimeV1WorktreeServiceShow => {
                Self::Workspaces(workspaces::Method::WorktreeServiceShow)
            }
            MethodId::AgentStartRuntimeV1WorktreeServiceSleep => {
                Self::Workspaces(workspaces::Method::WorktreeServiceSleep)
            }
            MethodId::AgentStartRuntimeV1WorktreeServiceActivate => {
                Self::Workspaces(workspaces::Method::WorktreeServiceActivate)
            }
            MethodId::AgentStartRuntimeV1WorktreeServicePrefetchCreateBase => {
                Self::Workspaces(workspaces::Method::WorktreeServicePrefetchCreateBase)
            }
            MethodId::AgentStartRuntimeV1WorktreeServiceResolvePrBase => {
                Self::Workspaces(workspaces::Method::WorktreeServiceResolvePrBase)
            }
            MethodId::AgentStartRuntimeV1WorktreeServiceRemove => {
                Self::Workspaces(workspaces::Method::WorktreeServiceRemove)
            }
            MethodId::AgentStartRuntimeV1WorktreeServiceForceDeleteBranch => {
                Self::Workspaces(workspaces::Method::WorktreeServiceForceDeleteBranch)
            }
            MethodId::AgentStartRuntimeV1WorktreeServiceSet => {
                Self::Workspaces(workspaces::Method::WorktreeServiceSet)
            }
            MethodId::AgentStartRuntimeV1WorktreeServicePersistSortOrder => {
                Self::Workspaces(workspaces::Method::WorktreeServicePersistSortOrder)
            }
            MethodId::AgentStartRuntimeV1WorktreeServiceDetectedList => {
                Self::Workspaces(workspaces::Method::WorktreeServiceDetectedList)
            }
            MethodId::AgentStartRuntimeV1WorktreeServiceLineageList => {
                Self::Workspaces(workspaces::Method::WorktreeServiceLineageList)
            }
            MethodId::AgentStartRuntimeV1WorktreeServiceBranchRenameFailureOutput => {
                Self::Workspaces(workspaces::Method::WorktreeServiceBranchRenameFailureOutput)
            }
            MethodId::AgentStartRuntimeV1WorktreeServiceSubscribeStateEvents => {
                Self::Workspaces(workspaces::Method::WorktreeServiceSubscribeStateEvents)
            }
            MethodId::AgentStartRuntimeV1WorkspaceEventsServiceAppendConsole => {
                Self::Workspaces(workspaces::Method::WorkspaceEventsServiceAppendConsole)
            }
            MethodId::AgentStartRuntimeV1WorkspaceEventsServiceAppendPerformance => {
                Self::Workspaces(workspaces::Method::WorkspaceEventsServiceAppendPerformance)
            }
            MethodId::AgentStartRuntimeV1WorkspaceEventsServiceList => {
                Self::Workspaces(workspaces::Method::WorkspaceEventsServiceList)
            }
            MethodId::AgentStartRuntimeV1WorkspaceEventsServiceWatch => {
                Self::Workspaces(workspaces::Method::WorkspaceEventsServiceWatch)
            }
            MethodId::AgentStartRuntimeV1WorkspaceEventsServiceGetProjectRevision => {
                Self::Workspaces(workspaces::Method::WorkspaceEventsServiceGetProjectRevision)
            }
            MethodId::AgentStartRuntimeV1WorktreeServiceArchive => {
                Self::Workspaces(workspaces::Method::WorktreeServiceArchive)
            }
            MethodId::AgentStartRuntimeV1WorktreeServiceList => {
                Self::Workspaces(workspaces::Method::WorktreeServiceList)
            }
            MethodId::AgentStartRuntimeV1WorktreeServiceCreate => {
                Self::Workspaces(workspaces::Method::WorktreeServiceCreate)
            }
            MethodId::AgentStartRuntimeV1WorktreeServiceListArchives => {
                Self::Workspaces(workspaces::Method::WorktreeServiceListArchives)
            }
            MethodId::AgentStartRuntimeV1WorktreeServiceRestore => {
                Self::Workspaces(workspaces::Method::WorktreeServiceRestore)
            }
            MethodId::AgentStartRuntimeV1WorkspaceCleanupServiceScan => {
                Self::Workspaces(workspaces::Method::WorkspaceCleanupServiceScan)
            }
            MethodId::AgentStartRuntimeV1WorkspaceCleanupServiceDismiss => {
                Self::Workspaces(workspaces::Method::WorkspaceCleanupServiceDismiss)
            }
            MethodId::AgentStartRuntimeV1WorkspaceCleanupServiceClearDismissals => {
                Self::Workspaces(workspaces::Method::WorkspaceCleanupServiceClearDismissals)
            }
            MethodId::AgentStartRuntimeV1WorkspaceCleanupServiceSubscribeEvents => {
                Self::Workspaces(workspaces::Method::WorkspaceCleanupServiceSubscribeEvents)
            }
            MethodId::AgentStartRuntimeV1ShellSessionServiceWatch => {
                Self::Workspaces(workspaces::Method::ShellSessionServiceWatch)
            }
            MethodId::AgentStartRuntimeV1ShellSessionServiceGet => {
                Self::Workspaces(workspaces::Method::ShellSessionServiceGet)
            }
            MethodId::AgentStartRuntimeV1ShellSessionServiceSet => {
                Self::Workspaces(workspaces::Method::ShellSessionServiceSet)
            }
            MethodId::AgentStartRuntimeV1ShellSessionServicePatch => {
                Self::Workspaces(workspaces::Method::ShellSessionServicePatch)
            }
            MethodId::AgentStartRuntimeV1ShellSessionServiceFlush => {
                Self::Workspaces(workspaces::Method::ShellSessionServiceFlush)
            }
            MethodId::AgentStartRuntimeV1RitualServiceGetSchedule => {
                Self::Workspaces(workspaces::Method::RitualServiceGetSchedule)
            }
            MethodId::AgentStartRuntimeV1RitualServiceSetSchedule => {
                Self::Workspaces(workspaces::Method::RitualServiceSetSchedule)
            }
            MethodId::AgentStartRuntimeV1RitualServiceRun => {
                Self::Workspaces(workspaces::Method::RitualServiceRun)
            }
            MethodId::AgentStartRuntimeV1WorkspacePortsServiceScan => {
                Self::Workspaces(workspaces::Method::WorkspacePortsServiceScan)
            }
            MethodId::AgentStartRuntimeV1WorkspacePortsServiceKill => {
                Self::Workspaces(workspaces::Method::WorkspacePortsServiceKill)
            }
            MethodId::AgentStartRuntimeV1WorkspacePortsServiceSubscribeEvents => {
                Self::Workspaces(workspaces::Method::WorkspacePortsServiceSubscribeEvents)
            }
            MethodId::AgentStartRuntimeV1WorkspaceSpaceServiceAnalyze => {
                Self::Workspaces(workspaces::Method::WorkspaceSpaceServiceAnalyze)
            }
            MethodId::AgentStartRuntimeV1WorkspaceSpaceServiceCancel => {
                Self::Workspaces(workspaces::Method::WorkspaceSpaceServiceCancel)
            }
            MethodId::AgentStartRuntimeV1ShellRuntimeServiceSyncWindowGraph => {
                Self::Workspaces(workspaces::Method::ShellRuntimeServiceSyncWindowGraph)
            }
        }
    }
}
