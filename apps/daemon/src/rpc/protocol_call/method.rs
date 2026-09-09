use yiru_protocol::method_metadata::MethodId;

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
            MethodId::YiruRuntimeV1ShellHostServiceRegister => {
                Self::Runtime(runtime::Method::ShellHostServiceRegister)
            }
            MethodId::YiruRuntimeV1ShellHostServiceExecute => {
                Self::Runtime(runtime::Method::ShellHostServiceExecute)
            }
            MethodId::YiruRuntimeV1AccountsServiceAdd => {
                Self::Agents(agents::Method::AccountsServiceAdd)
            }
            MethodId::YiruRuntimeV1AccountsServiceCancelPendingLogin => {
                Self::Agents(agents::Method::AccountsServiceCancelPendingLogin)
            }
            MethodId::YiruRuntimeV1AccountsServiceClearMiniMaxCookie => {
                Self::Agents(agents::Method::AccountsServiceClearMiniMaxCookie)
            }
            MethodId::YiruRuntimeV1AccountsServiceGetMiniMaxCredentials => {
                Self::Agents(agents::Method::AccountsServiceGetMiniMaxCredentials)
            }
            MethodId::YiruRuntimeV1AgentSessionServiceProviders => {
                Self::Agents(agents::Method::AgentSessionServiceProviders)
            }
            MethodId::YiruRuntimeV1AgentSessionServiceList => {
                Self::Agents(agents::Method::AgentSessionServiceList)
            }
            MethodId::YiruRuntimeV1AgentSessionServiceStart => {
                Self::Agents(agents::Method::AgentSessionServiceStart)
            }
            MethodId::YiruRuntimeV1AgentSessionServiceStop => {
                Self::Agents(agents::Method::AgentSessionServiceStop)
            }
            MethodId::YiruRuntimeV1AgentSessionServiceFollowup => {
                Self::Agents(agents::Method::AgentSessionServiceFollowup)
            }
            MethodId::YiruRuntimeV1AgentStatusServiceInferInterrupt => {
                Self::Agents(agents::Method::AgentStatusServiceInferInterrupt)
            }
            MethodId::YiruRuntimeV1AgentStatusServiceGetSnapshot => {
                Self::Agents(agents::Method::AgentStatusServiceGetSnapshot)
            }
            MethodId::YiruRuntimeV1AgentStatusServiceGetMigrationUnsupportedSnapshot => {
                Self::Agents(agents::Method::AgentStatusServiceGetMigrationUnsupportedSnapshot)
            }
            MethodId::YiruRuntimeV1AgentStatusServiceSubscribe => {
                Self::Agents(agents::Method::AgentStatusServiceSubscribe)
            }
            MethodId::YiruRuntimeV1AgentStatusServiceDrop => {
                Self::Agents(agents::Method::AgentStatusServiceDrop)
            }
            MethodId::YiruRuntimeV1AgentStatusServiceDropByTabPrefix => {
                Self::Agents(agents::Method::AgentStatusServiceDropByTabPrefix)
            }
            MethodId::YiruRuntimeV1AgentStatusServiceRetirePaneAuthority => {
                Self::Agents(agents::Method::AgentStatusServiceRetirePaneAuthority)
            }
            MethodId::YiruRuntimeV1AgentStatusServiceTransferPaneAuthority => {
                Self::Agents(agents::Method::AgentStatusServiceTransferPaneAuthority)
            }
            MethodId::YiruRuntimeV1AiVaultServiceListSessions => {
                Self::Agents(agents::Method::AiVaultServiceListSessions)
            }
            MethodId::YiruRuntimeV1AiVaultServiceListSubagentSessions => {
                Self::Agents(agents::Method::AiVaultServiceListSubagentSessions)
            }
            MethodId::YiruRuntimeV1AccountsServiceList => {
                Self::Agents(agents::Method::AccountsServiceList)
            }
            MethodId::YiruRuntimeV1AccountsServiceListCachedClaude => {
                Self::Agents(agents::Method::AccountsServiceListCachedClaude)
            }
            MethodId::YiruRuntimeV1AccountsServiceListCachedCodex => {
                Self::Agents(agents::Method::AccountsServiceListCachedCodex)
            }
            MethodId::YiruRuntimeV1AccountsServiceRemove => {
                Self::Agents(agents::Method::AccountsServiceRemove)
            }
            MethodId::YiruRuntimeV1AccountsServiceUnsubscribe => {
                Self::Agents(agents::Method::AccountsServiceUnsubscribe)
            }
            MethodId::YiruRuntimeV1AccountsServiceRefreshRateLimits => {
                Self::Agents(agents::Method::AccountsServiceRefreshRateLimits)
            }
            MethodId::YiruRuntimeV1AccountsServiceRefreshRateLimitsForTarget => {
                Self::Agents(agents::Method::AccountsServiceRefreshRateLimitsForTarget)
            }
            MethodId::YiruRuntimeV1AccountsServiceConsumeCodexResetCredit => {
                Self::Agents(agents::Method::AccountsServiceConsumeCodexResetCredit)
            }
            MethodId::YiruRuntimeV1AccountsServiceRefreshInactiveAccounts => {
                Self::Agents(agents::Method::AccountsServiceRefreshInactiveAccounts)
            }
            MethodId::YiruRuntimeV1AccountsServiceRefreshGrokRateLimits => {
                Self::Agents(agents::Method::AccountsServiceRefreshGrokRateLimits)
            }
            MethodId::YiruRuntimeV1AccountsServiceGetGrokStatus => {
                Self::Agents(agents::Method::AccountsServiceGetGrokStatus)
            }
            MethodId::YiruRuntimeV1AccountsServiceSelect => {
                Self::Agents(agents::Method::AccountsServiceSelect)
            }
            MethodId::YiruRuntimeV1AccountsServiceReauthenticate => {
                Self::Agents(agents::Method::AccountsServiceReauthenticate)
            }
            MethodId::YiruRuntimeV1AccountsServiceSaveMiniMaxCookie => {
                Self::Agents(agents::Method::AccountsServiceSaveMiniMaxCookie)
            }
            MethodId::YiruRuntimeV1AccountsServiceSubscribe => {
                Self::Agents(agents::Method::AccountsServiceSubscribe)
            }
            MethodId::YiruRuntimeV1StatsServiceGetSummary => {
                Self::Agents(agents::Method::StatsServiceGetSummary)
            }
            MethodId::YiruRuntimeV1ProviderUsageServiceGetScanState => {
                Self::Agents(agents::Method::ProviderUsageServiceGetScanState)
            }
            MethodId::YiruRuntimeV1ProviderUsageServiceSetEnabled => {
                Self::Agents(agents::Method::ProviderUsageServiceSetEnabled)
            }
            MethodId::YiruRuntimeV1ProviderUsageServiceRefresh => {
                Self::Agents(agents::Method::ProviderUsageServiceRefresh)
            }
            MethodId::YiruRuntimeV1ProviderUsageServiceGetSnapshot => {
                Self::Agents(agents::Method::ProviderUsageServiceGetSnapshot)
            }
            MethodId::YiruRuntimeV1RateLimitResumeServiceInspectCodex => {
                Self::Agents(agents::Method::RateLimitResumeServiceInspectCodex)
            }
            MethodId::YiruRuntimeV1RateLimitResumeServiceList => {
                Self::Agents(agents::Method::RateLimitResumeServiceList)
            }
            MethodId::YiruRuntimeV1RateLimitResumeServiceSchedule => {
                Self::Agents(agents::Method::RateLimitResumeServiceSchedule)
            }
            MethodId::YiruRuntimeV1RateLimitResumeServiceCancel => {
                Self::Agents(agents::Method::RateLimitResumeServiceCancel)
            }
            MethodId::YiruRuntimeV1RateLimitResumeServiceRunNow => {
                Self::Agents(agents::Method::RateLimitResumeServiceRunNow)
            }
            MethodId::YiruRuntimeV1RateLimitResumeServiceMarkFired => {
                Self::Agents(agents::Method::RateLimitResumeServiceMarkFired)
            }
            MethodId::YiruRuntimeV1RateLimitResumeServiceMarkFailed => {
                Self::Agents(agents::Method::RateLimitResumeServiceMarkFailed)
            }
            MethodId::YiruRuntimeV1RateLimitResumeServiceMarkStale => {
                Self::Agents(agents::Method::RateLimitResumeServiceMarkStale)
            }
            MethodId::YiruRuntimeV1RateLimitResumeServiceRendererReady => {
                Self::Agents(agents::Method::RateLimitResumeServiceRendererReady)
            }
            MethodId::YiruRuntimeV1SkillsServiceDiscover => {
                Self::Agents(agents::Method::SkillsServiceDiscover)
            }
            MethodId::YiruRuntimeV1SkillsServiceManageFreshnessInventory => {
                Self::Agents(agents::Method::SkillsServiceManageFreshnessInventory)
            }
            MethodId::YiruRuntimeV1SkillsServiceManageStartUpdateRun => {
                Self::Agents(agents::Method::SkillsServiceManageStartUpdateRun)
            }
            MethodId::YiruRuntimeV1SkillsServiceManageStartInstallRun => {
                Self::Agents(agents::Method::SkillsServiceManageStartInstallRun)
            }
            MethodId::YiruRuntimeV1SkillsServiceManageStartRemoveRun => {
                Self::Agents(agents::Method::SkillsServiceManageStartRemoveRun)
            }
            MethodId::YiruRuntimeV1SkillsServiceManageListSkillFiles => {
                Self::Agents(agents::Method::SkillsServiceManageListSkillFiles)
            }
            MethodId::YiruRuntimeV1SkillsServiceManageReadSkillDirFile => {
                Self::Agents(agents::Method::SkillsServiceManageReadSkillDirFile)
            }
            MethodId::YiruRuntimeV1SkillsServiceManageCancelUpdateRun => {
                Self::Agents(agents::Method::SkillsServiceManageCancelUpdateRun)
            }
            MethodId::YiruRuntimeV1SkillsServiceManageAcknowledgeUpdateRun => {
                Self::Agents(agents::Method::SkillsServiceManageAcknowledgeUpdateRun)
            }
            MethodId::YiruRuntimeV1SkillsServiceManageGetUpdateRun => {
                Self::Agents(agents::Method::SkillsServiceManageGetUpdateRun)
            }
            MethodId::YiruRuntimeV1SkillsServiceManageEventsSubscribe => {
                Self::Agents(agents::Method::SkillsServiceManageEventsSubscribe)
            }
            MethodId::YiruRuntimeV1BrowserCliServiceResolveTarget => {
                Self::Browser(browser::Method::BrowserCliServiceResolveTarget)
            }
            MethodId::YiruRuntimeV1BrowserCliServiceResolveUpload => {
                Self::Browser(browser::Method::BrowserCliServiceResolveUpload)
            }
            MethodId::YiruRuntimeV1BrowserRuntimeServiceCreateTab => {
                Self::Browser(browser::Method::BrowserRuntimeServiceCreateTab)
            }
            MethodId::YiruRuntimeV1BrowserHostServiceExecute => {
                Self::Browser(browser::Method::BrowserHostServiceExecute)
            }
            MethodId::YiruRuntimeV1BrowserHostServiceDownload => {
                Self::Browser(browser::Method::BrowserHostServiceDownload)
            }
            MethodId::YiruRuntimeV1LocalDownloadServiceAppendFileChunk => {
                Self::Browser(browser::Method::LocalDownloadServiceAppendFileChunk)
            }
            MethodId::YiruRuntimeV1LocalDownloadServiceAppendFolderFileChunk => {
                Self::Browser(browser::Method::LocalDownloadServiceAppendFolderFileChunk)
            }
            MethodId::YiruRuntimeV1LocalDownloadServiceCancelFile => {
                Self::Browser(browser::Method::LocalDownloadServiceCancelFile)
            }
            MethodId::YiruRuntimeV1LocalDownloadServiceCancelFolder => {
                Self::Browser(browser::Method::LocalDownloadServiceCancelFolder)
            }
            MethodId::YiruRuntimeV1LocalDownloadServiceCreateFolderDirectory => {
                Self::Browser(browser::Method::LocalDownloadServiceCreateFolderDirectory)
            }
            MethodId::YiruRuntimeV1LocalDownloadServiceFinishFile => {
                Self::Browser(browser::Method::LocalDownloadServiceFinishFile)
            }
            MethodId::YiruRuntimeV1LocalDownloadServiceFinishFolder => {
                Self::Browser(browser::Method::LocalDownloadServiceFinishFolder)
            }
            MethodId::YiruRuntimeV1LocalDownloadServiceStartFile => {
                Self::Browser(browser::Method::LocalDownloadServiceStartFile)
            }
            MethodId::YiruRuntimeV1LocalDownloadServiceStartFolder => {
                Self::Browser(browser::Method::LocalDownloadServiceStartFolder)
            }
            MethodId::YiruRuntimeV1BrowserHostServiceExecuteMobile => {
                Self::Browser(browser::Method::BrowserHostServiceExecuteMobile)
            }
            MethodId::YiruRuntimeV1BrowserScreencastServiceSubscribe => {
                Self::Browser(browser::Method::BrowserScreencastServiceSubscribe)
            }
            MethodId::YiruRuntimeV1BrowserCommandServiceOpen => {
                Self::Browser(browser::Method::BrowserCommandServiceOpen)
            }
            MethodId::YiruRuntimeV1BrowserReplayServiceList => {
                Self::Browser(browser::Method::BrowserReplayServiceList)
            }
            MethodId::YiruRuntimeV1BrowserReplayServiceRecordResult => {
                Self::Browser(browser::Method::BrowserReplayServiceRecordResult)
            }
            MethodId::YiruRuntimeV1BrowserReplayServiceSave => {
                Self::Browser(browser::Method::BrowserReplayServiceSave)
            }
            MethodId::YiruRuntimeV1BrowserWritebackServiceApplyColor => {
                Self::Browser(browser::Method::BrowserWritebackServiceApplyColor)
            }
            MethodId::YiruRuntimeV1BrowserWritebackServiceApplyCss => {
                Self::Browser(browser::Method::BrowserWritebackServiceApplyCss)
            }
            MethodId::YiruRuntimeV1BrowserWritebackServiceLocateElement => {
                Self::Browser(browser::Method::BrowserWritebackServiceLocateElement)
            }
            MethodId::YiruRuntimeV1BrowserWritebackServiceRecordVerification => {
                Self::Browser(browser::Method::BrowserWritebackServiceRecordVerification)
            }
            MethodId::YiruRuntimeV1VisualRegressionServiceLatest => {
                Self::Browser(browser::Method::VisualRegressionServiceLatest)
            }
            MethodId::YiruRuntimeV1VisualRegressionServiceSave => {
                Self::Browser(browser::Method::VisualRegressionServiceSave)
            }
            MethodId::YiruRuntimeV1ComputerServiceCapabilities => {
                Self::Computer(computer::Method::ComputerServiceCapabilities)
            }
            MethodId::YiruRuntimeV1ComputerServiceListApps => {
                Self::Computer(computer::Method::ComputerServiceListApps)
            }
            MethodId::YiruRuntimeV1ComputerServicePermissions => {
                Self::Computer(computer::Method::ComputerServicePermissions)
            }
            MethodId::YiruRuntimeV1ComputerServicePermissionsStatus => {
                Self::Computer(computer::Method::ComputerServicePermissionsStatus)
            }
            MethodId::YiruRuntimeV1ComputerServicePermissionsReset => {
                Self::Computer(computer::Method::ComputerServicePermissionsReset)
            }
            MethodId::YiruRuntimeV1ComputerServiceListWindows => {
                Self::Computer(computer::Method::ComputerServiceListWindows)
            }
            MethodId::YiruRuntimeV1ComputerServiceGetAppState => {
                Self::Computer(computer::Method::ComputerServiceGetAppState)
            }
            MethodId::YiruRuntimeV1ComputerServiceClick => {
                Self::Computer(computer::Method::ComputerServiceClick)
            }
            MethodId::YiruRuntimeV1ComputerServicePerformSecondaryAction => {
                Self::Computer(computer::Method::ComputerServicePerformSecondaryAction)
            }
            MethodId::YiruRuntimeV1ComputerServiceScroll => {
                Self::Computer(computer::Method::ComputerServiceScroll)
            }
            MethodId::YiruRuntimeV1ComputerServiceDrag => {
                Self::Computer(computer::Method::ComputerServiceDrag)
            }
            MethodId::YiruRuntimeV1ComputerServiceTypeText => {
                Self::Computer(computer::Method::ComputerServiceTypeText)
            }
            MethodId::YiruRuntimeV1ComputerServicePressKey => {
                Self::Computer(computer::Method::ComputerServicePressKey)
            }
            MethodId::YiruRuntimeV1ComputerServiceHotkey => {
                Self::Computer(computer::Method::ComputerServiceHotkey)
            }
            MethodId::YiruRuntimeV1ComputerServicePasteText => {
                Self::Computer(computer::Method::ComputerServicePasteText)
            }
            MethodId::YiruRuntimeV1ComputerServiceSetValue => {
                Self::Computer(computer::Method::ComputerServiceSetValue)
            }
            MethodId::YiruRuntimeV1EmulatorServiceList => {
                Self::Computer(computer::Method::EmulatorServiceList)
            }
            MethodId::YiruRuntimeV1EmulatorServiceAttach => {
                Self::Computer(computer::Method::EmulatorServiceAttach)
            }
            MethodId::YiruRuntimeV1EmulatorServiceTap => {
                Self::Computer(computer::Method::EmulatorServiceTap)
            }
            MethodId::YiruRuntimeV1EmulatorServiceGesture => {
                Self::Computer(computer::Method::EmulatorServiceGesture)
            }
            MethodId::YiruRuntimeV1EmulatorServiceTypeText => {
                Self::Computer(computer::Method::EmulatorServiceTypeText)
            }
            MethodId::YiruRuntimeV1EmulatorServiceButton => {
                Self::Computer(computer::Method::EmulatorServiceButton)
            }
            MethodId::YiruRuntimeV1EmulatorServiceRotate => {
                Self::Computer(computer::Method::EmulatorServiceRotate)
            }
            MethodId::YiruRuntimeV1EmulatorServiceExec => {
                Self::Computer(computer::Method::EmulatorServiceExec)
            }
            MethodId::YiruRuntimeV1EmulatorServiceKill => {
                Self::Computer(computer::Method::EmulatorServiceKill)
            }
            MethodId::YiruRuntimeV1EmulatorServiceShutdown => {
                Self::Computer(computer::Method::EmulatorServiceShutdown)
            }
            MethodId::YiruRuntimeV1EmulatorServiceListSimulators => {
                Self::Computer(computer::Method::EmulatorServiceListSimulators)
            }
            MethodId::YiruRuntimeV1EmulatorServiceAvailability => {
                Self::Computer(computer::Method::EmulatorServiceAvailability)
            }
            MethodId::YiruRuntimeV1EmulatorServiceUnregisterActive => {
                Self::Computer(computer::Method::EmulatorServiceUnregisterActive)
            }
            MethodId::YiruRuntimeV1EmulatorServiceStreamFrames => {
                Self::Computer(computer::Method::EmulatorServiceStreamFrames)
            }
            MethodId::YiruRuntimeV1DangerousApprovalServiceStatus => {
                Self::Computer(computer::Method::DangerousApprovalServiceStatus)
            }
            MethodId::YiruRuntimeV1DangerousApprovalServiceBeginRegistration => {
                Self::Computer(computer::Method::DangerousApprovalServiceBeginRegistration)
            }
            MethodId::YiruRuntimeV1DangerousApprovalServiceFinishRegistration => {
                Self::Computer(computer::Method::DangerousApprovalServiceFinishRegistration)
            }
            MethodId::YiruRuntimeV1DangerousApprovalServiceBeginApproval => {
                Self::Computer(computer::Method::DangerousApprovalServiceBeginApproval)
            }
            MethodId::YiruRuntimeV1DangerousApprovalServiceFinishApproval => {
                Self::Computer(computer::Method::DangerousApprovalServiceFinishApproval)
            }
            MethodId::YiruRuntimeV1DangerousApprovalServiceRemove => {
                Self::Computer(computer::Method::DangerousApprovalServiceRemove)
            }
            MethodId::YiruRuntimeV1FilesServiceBrowseServerDirectory => {
                Self::Files(files::Method::FilesServiceBrowseServerDirectory)
            }
            MethodId::YiruRuntimeV1FilesServiceList => Self::Files(files::Method::FilesServiceList),
            MethodId::YiruRuntimeV1FilesServiceSearchPaths => {
                Self::Files(files::Method::FilesServiceSearchPaths)
            }
            MethodId::YiruRuntimeV1FilesServiceListAll => {
                Self::Files(files::Method::FilesServiceListAll)
            }
            MethodId::YiruRuntimeV1FilesServiceListMarkdownDocuments => {
                Self::Files(files::Method::FilesServiceListMarkdownDocuments)
            }
            MethodId::YiruRuntimeV1FilesServiceOpen => Self::Files(files::Method::FilesServiceOpen),
            MethodId::YiruRuntimeV1FilesServiceOpenDiff => {
                Self::Files(files::Method::FilesServiceOpenDiff)
            }
            MethodId::YiruRuntimeV1FilesServiceRead => Self::Files(files::Method::FilesServiceRead),
            MethodId::YiruRuntimeV1FilesServiceReadChunk => {
                Self::Files(files::Method::FilesServiceReadChunk)
            }
            MethodId::YiruRuntimeV1FilesServiceReadDirectory => {
                Self::Files(files::Method::FilesServiceReadDirectory)
            }
            MethodId::YiruRuntimeV1FilesServiceReadPreview => {
                Self::Files(files::Method::FilesServiceReadPreview)
            }
            MethodId::YiruRuntimeV1FilesServiceStat => Self::Files(files::Method::FilesServiceStat),
            MethodId::YiruRuntimeV1FilesServiceSearch => {
                Self::Files(files::Method::FilesServiceSearch)
            }
            MethodId::YiruRuntimeV1FilesServiceWrite => {
                Self::Files(files::Method::FilesServiceWrite)
            }
            MethodId::YiruRuntimeV1FilesServiceWriteBase64 => {
                Self::Files(files::Method::FilesServiceWriteBase64)
            }
            MethodId::YiruRuntimeV1FilesServiceWriteBase64Chunk => {
                Self::Files(files::Method::FilesServiceWriteBase64Chunk)
            }
            MethodId::YiruRuntimeV1FilesServiceCreateFile => {
                Self::Files(files::Method::FilesServiceCreateFile)
            }
            MethodId::YiruRuntimeV1FilesServiceCreateDirectory => {
                Self::Files(files::Method::FilesServiceCreateDirectory)
            }
            MethodId::YiruRuntimeV1FilesServiceCreateDirectoryNoClobber => {
                Self::Files(files::Method::FilesServiceCreateDirectoryNoClobber)
            }
            MethodId::YiruRuntimeV1FilesServiceCommitUpload => {
                Self::Files(files::Method::FilesServiceCommitUpload)
            }
            MethodId::YiruRuntimeV1FilesServiceRename => {
                Self::Files(files::Method::FilesServiceRename)
            }
            MethodId::YiruRuntimeV1FilesServiceCopy => Self::Files(files::Method::FilesServiceCopy),
            MethodId::YiruRuntimeV1FilesServiceDelete => {
                Self::Files(files::Method::FilesServiceDelete)
            }
            MethodId::YiruRuntimeV1FilesServiceReadLogTail => {
                Self::Files(files::Method::FilesServiceReadLogTail)
            }
            MethodId::YiruRuntimeV1FilesServiceResolveTerminalPath => {
                Self::Files(files::Method::FilesServiceResolveTerminalPath)
            }
            MethodId::YiruRuntimeV1FilesServiceReadTerminalArtifact => {
                Self::Files(files::Method::FilesServiceReadTerminalArtifact)
            }
            MethodId::YiruRuntimeV1FilesServiceReadTerminalArtifactPreview => {
                Self::Files(files::Method::FilesServiceReadTerminalArtifactPreview)
            }
            MethodId::YiruRuntimeV1FilesServiceWriteTerminalArtifact => {
                Self::Files(files::Method::FilesServiceWriteTerminalArtifact)
            }
            MethodId::YiruRuntimeV1FilesServiceWatch => {
                Self::Files(files::Method::FilesServiceWatch)
            }
            MethodId::YiruRuntimeV1FilesServiceWatchLogTail => {
                Self::Files(files::Method::FilesServiceWatchLogTail)
            }
            MethodId::YiruRuntimeV1ShellFilesServiceAuthorizeExternalPath => {
                Self::Files(files::Method::ShellFilesServiceAuthorizeExternalPath)
            }
            MethodId::YiruRuntimeV1ShellFilesServiceCopy => {
                Self::Files(files::Method::ShellFilesServiceCopy)
            }
            MethodId::YiruRuntimeV1ShellFilesServiceCreateDirectory => {
                Self::Files(files::Method::ShellFilesServiceCreateDirectory)
            }
            MethodId::YiruRuntimeV1ShellFilesServiceCreateFile => {
                Self::Files(files::Method::ShellFilesServiceCreateFile)
            }
            MethodId::YiruRuntimeV1ShellFilesServiceDelete => {
                Self::Files(files::Method::ShellFilesServiceDelete)
            }
            MethodId::YiruRuntimeV1ShellFilesServicePathExists => {
                Self::Files(files::Method::ShellFilesServicePathExists)
            }
            MethodId::YiruRuntimeV1ShellFilesServiceRead => {
                Self::Files(files::Method::ShellFilesServiceRead)
            }
            MethodId::YiruRuntimeV1ShellFilesServiceReadChunk => {
                Self::Files(files::Method::ShellFilesServiceReadChunk)
            }
            MethodId::YiruRuntimeV1ShellFilesServiceRename => {
                Self::Files(files::Method::ShellFilesServiceRename)
            }
            MethodId::YiruRuntimeV1ShellFilesServiceResolveDroppedPathsForAgent => {
                Self::Files(files::Method::ShellFilesServiceResolveDroppedPathsForAgent)
            }
            MethodId::YiruRuntimeV1ShellFilesServiceStageExternalPathsForRuntimeUpload => {
                Self::Files(files::Method::ShellFilesServiceStageExternalPathsForRuntimeUpload)
            }
            MethodId::YiruRuntimeV1ShellFilesServiceStat => {
                Self::Files(files::Method::ShellFilesServiceStat)
            }
            MethodId::YiruRuntimeV1ShellFilesServiceWrite => {
                Self::Files(files::Method::ShellFilesServiceWrite)
            }
            MethodId::YiruRuntimeV1MarkdownServiceReadTab => {
                Self::Files(files::Method::MarkdownServiceReadTab)
            }
            MethodId::YiruRuntimeV1MarkdownServiceSaveTab => {
                Self::Files(files::Method::MarkdownServiceSaveTab)
            }
            MethodId::YiruRuntimeV1ArtifactServiceBegin => {
                Self::Files(files::Method::ArtifactServiceBegin)
            }
            MethodId::YiruRuntimeV1ArtifactServiceAppend => {
                Self::Files(files::Method::ArtifactServiceAppend)
            }
            MethodId::YiruRuntimeV1ArtifactServiceComplete => {
                Self::Files(files::Method::ArtifactServiceComplete)
            }
            MethodId::YiruRuntimeV1ArtifactServiceAbort => {
                Self::Files(files::Method::ArtifactServiceAbort)
            }
            MethodId::YiruRuntimeV1ArtifactServiceDownloadTicket => {
                Self::Files(files::Method::ArtifactServiceDownloadTicket)
            }
            MethodId::YiruRuntimeV1ArtifactServiceRead => {
                Self::Files(files::Method::ArtifactServiceRead)
            }
            MethodId::YiruRuntimeV1ClipboardServiceStartImageUpload => {
                Self::Files(files::Method::ClipboardServiceStartImageUpload)
            }
            MethodId::YiruRuntimeV1ClipboardServiceAppendImageUploadChunk => {
                Self::Files(files::Method::ClipboardServiceAppendImageUploadChunk)
            }
            MethodId::YiruRuntimeV1ClipboardServiceCommitImageUpload => {
                Self::Files(files::Method::ClipboardServiceCommitImageUpload)
            }
            MethodId::YiruRuntimeV1ClipboardServiceAbortImageUpload => {
                Self::Files(files::Method::ClipboardServiceAbortImageUpload)
            }
            MethodId::YiruRuntimeV1ClipboardServiceSaveImageAsTempFile => {
                Self::Files(files::Method::ClipboardServiceSaveImageAsTempFile)
            }
            MethodId::YiruRuntimeV1NotebookServiceRunPythonCell => {
                Self::Files(files::Method::NotebookServiceRunPythonCell)
            }
            MethodId::YiruRuntimeV1ExternalEditorServiceOpenRemoteSsh => {
                Self::Files(files::Method::ExternalEditorServiceOpenRemoteSsh)
            }
            MethodId::YiruRuntimeV1GitStatusServiceStatus => {
                Self::Git(git::Method::StatusServiceStatus)
            }
            MethodId::YiruRuntimeV1GitStatusServiceDiff => {
                Self::Git(git::Method::StatusServiceDiff)
            }
            MethodId::YiruRuntimeV1GitStatusServiceSubmoduleStatus => {
                Self::Git(git::Method::StatusServiceSubmoduleStatus)
            }
            MethodId::YiruRuntimeV1GitStatusServiceCheckIgnored => {
                Self::Git(git::Method::StatusServiceCheckIgnored)
            }
            MethodId::YiruRuntimeV1GitStatusServiceFindHugeFoldersToIgnore => {
                Self::Git(git::Method::StatusServiceFindHugeFoldersToIgnore)
            }
            MethodId::YiruRuntimeV1GitStatusServiceLocalBranches => {
                Self::Git(git::Method::StatusServiceLocalBranches)
            }
            MethodId::YiruRuntimeV1GitStatusServiceUpstreamStatus => {
                Self::Git(git::Method::StatusServiceUpstreamStatus)
            }
            MethodId::YiruRuntimeV1GitStatusServiceRemoteCommitUrl => {
                Self::Git(git::Method::StatusServiceRemoteCommitUrl)
            }
            MethodId::YiruRuntimeV1GitStagingServiceStage => {
                Self::Git(git::Method::StagingServiceStage)
            }
            MethodId::YiruRuntimeV1GitStagingServiceUnstage => {
                Self::Git(git::Method::StagingServiceUnstage)
            }
            MethodId::YiruRuntimeV1GitStagingServiceDiscard => {
                Self::Git(git::Method::StagingServiceDiscard)
            }
            MethodId::YiruRuntimeV1GitStagingServiceBulkStage => {
                Self::Git(git::Method::StagingServiceBulkStage)
            }
            MethodId::YiruRuntimeV1GitStagingServiceBulkUnstage => {
                Self::Git(git::Method::StagingServiceBulkUnstage)
            }
            MethodId::YiruRuntimeV1GitStagingServiceBulkDiscard => {
                Self::Git(git::Method::StagingServiceBulkDiscard)
            }
            MethodId::YiruRuntimeV1GitStagingServiceCommit => {
                Self::Git(git::Method::StagingServiceCommit)
            }
            MethodId::YiruRuntimeV1GitStagingServiceAppendGitignore => {
                Self::Git(git::Method::StagingServiceAppendGitignore)
            }
            MethodId::YiruRuntimeV1GitBranchServiceCheckout => {
                Self::Git(git::Method::BranchServiceCheckout)
            }
            MethodId::YiruRuntimeV1GitBranchServiceCheckoutCommit => {
                Self::Git(git::Method::BranchServiceCheckoutCommit)
            }
            MethodId::YiruRuntimeV1GitBranchServiceCreateBranch => {
                Self::Git(git::Method::BranchServiceCreateBranch)
            }
            MethodId::YiruRuntimeV1GitBranchServiceAddTag => {
                Self::Git(git::Method::BranchServiceAddTag)
            }
            MethodId::YiruRuntimeV1GitHistoryRewriteServiceConflictOperation => {
                Self::Git(git::Method::HistoryRewriteServiceConflictOperation)
            }
            MethodId::YiruRuntimeV1GitHistoryRewriteServiceAbortMerge => {
                Self::Git(git::Method::HistoryRewriteServiceAbortMerge)
            }
            MethodId::YiruRuntimeV1GitHistoryRewriteServiceAbortRebase => {
                Self::Git(git::Method::HistoryRewriteServiceAbortRebase)
            }
            MethodId::YiruRuntimeV1GitHistoryRewriteServiceAbortRevert => {
                Self::Git(git::Method::HistoryRewriteServiceAbortRevert)
            }
            MethodId::YiruRuntimeV1GitHistoryRewriteServiceCherryPick => {
                Self::Git(git::Method::HistoryRewriteServiceCherryPick)
            }
            MethodId::YiruRuntimeV1GitHistoryRewriteServiceRevertCommit => {
                Self::Git(git::Method::HistoryRewriteServiceRevertCommit)
            }
            MethodId::YiruRuntimeV1GitHistoryRewriteServiceDropCommit => {
                Self::Git(git::Method::HistoryRewriteServiceDropCommit)
            }
            MethodId::YiruRuntimeV1GitHistoryRewriteServiceResetToCommit => {
                Self::Git(git::Method::HistoryRewriteServiceResetToCommit)
            }
            MethodId::YiruRuntimeV1GitHistoryRewriteServiceRebaseFromBase => {
                Self::Git(git::Method::HistoryRewriteServiceRebaseFromBase)
            }
            MethodId::YiruRuntimeV1GitHistoryRewriteServiceRebaseOntoCommit => {
                Self::Git(git::Method::HistoryRewriteServiceRebaseOntoCommit)
            }
            MethodId::YiruRuntimeV1GitHistoryRewriteServiceMergeCommit => {
                Self::Git(git::Method::HistoryRewriteServiceMergeCommit)
            }
            MethodId::YiruRuntimeV1GitHistoryServiceHistory => {
                Self::Git(git::Method::HistoryServiceHistory)
            }
            MethodId::YiruRuntimeV1GitHistoryServiceBranchCompare => {
                Self::Git(git::Method::HistoryServiceBranchCompare)
            }
            MethodId::YiruRuntimeV1GitHistoryServiceBranchDiff => {
                Self::Git(git::Method::HistoryServiceBranchDiff)
            }
            MethodId::YiruRuntimeV1GitHistoryServiceCommitCompare => {
                Self::Git(git::Method::HistoryServiceCommitCompare)
            }
            MethodId::YiruRuntimeV1GitHistoryServiceCommitDiff => {
                Self::Git(git::Method::HistoryServiceCommitDiff)
            }
            MethodId::YiruRuntimeV1GitRemoteServiceFetch => {
                Self::Git(git::Method::RemoteServiceFetch)
            }
            MethodId::YiruRuntimeV1GitRemoteServicePull => {
                Self::Git(git::Method::RemoteServicePull)
            }
            MethodId::YiruRuntimeV1GitRemoteServiceFastForward => {
                Self::Git(git::Method::RemoteServiceFastForward)
            }
            MethodId::YiruRuntimeV1GitRemoteServicePush => {
                Self::Git(git::Method::RemoteServicePush)
            }
            MethodId::YiruRuntimeV1GitRemoteServiceForkSync => {
                Self::Git(git::Method::RemoteServiceForkSync)
            }
            MethodId::YiruRuntimeV1GitGenerationServiceGenerateCommitMessage => {
                Self::Git(git::Method::GenerationServiceGenerateCommitMessage)
            }
            MethodId::YiruRuntimeV1GitGenerationServiceCancelGenerateCommitMessage => {
                Self::Git(git::Method::GenerationServiceCancelGenerateCommitMessage)
            }
            MethodId::YiruRuntimeV1GitGenerationServiceGeneratePullRequestFields => {
                Self::Git(git::Method::GenerationServiceGeneratePullRequestFields)
            }
            MethodId::YiruRuntimeV1GitGenerationServiceCancelGeneratePullRequestFields => {
                Self::Git(git::Method::GenerationServiceCancelGeneratePullRequestFields)
            }
            MethodId::YiruRuntimeV1GitHubShellServiceGetViewer => {
                Self::Github(github::Method::ShellServiceGetViewer)
            }
            MethodId::YiruRuntimeV1GitHubShellServiceEnqueuePrRefresh => {
                Self::Github(github::Method::ShellServiceEnqueuePrRefresh)
            }
            MethodId::YiruRuntimeV1GitHubShellServiceReportVisiblePrRefreshCandidates => {
                Self::Github(github::Method::ShellServiceReportVisiblePrRefreshCandidates)
            }
            MethodId::YiruRuntimeV1GitHubShellServiceCheckYiruStarred => {
                Self::Github(github::Method::ShellServiceCheckYiruStarred)
            }
            MethodId::YiruRuntimeV1GitHubShellServiceStarYiru => {
                Self::Github(github::Method::ShellServiceStarYiru)
            }
            MethodId::YiruRuntimeV1GitHubServiceGetRepoSlug => {
                Self::Github(github::Method::ServiceGetRepoSlug)
            }
            MethodId::YiruRuntimeV1GitHubServiceGetRepoUpstream => {
                Self::Github(github::Method::ServiceGetRepoUpstream)
            }
            MethodId::YiruRuntimeV1GitHubServiceGetRateLimit => {
                Self::Github(github::Method::ServiceGetRateLimit)
            }
            MethodId::YiruRuntimeV1GitHubServiceListWorkItems => {
                Self::Github(github::Method::ServiceListWorkItems)
            }
            MethodId::YiruRuntimeV1GitHubServiceListLabels => {
                Self::Github(github::Method::ServiceListLabels)
            }
            MethodId::YiruRuntimeV1GitHubServiceListAssignableUsers => {
                Self::Github(github::Method::ServiceListAssignableUsers)
            }
            MethodId::YiruRuntimeV1GitHubServiceGetWorkItem => {
                Self::Github(github::Method::ServiceGetWorkItem)
            }
            MethodId::YiruRuntimeV1GitHubServiceGetWorkItemByOwnerRepo => {
                Self::Github(github::Method::ServiceGetWorkItemByOwnerRepo)
            }
            MethodId::YiruRuntimeV1GitHubServiceGetWorkItemDetails => {
                Self::Github(github::Method::ServiceGetWorkItemDetails)
            }
            MethodId::YiruRuntimeV1GitHubServiceGetPrForBranch => {
                Self::Github(github::Method::ServiceGetPrForBranch)
            }
            MethodId::YiruRuntimeV1GitHubServiceRefreshPrForBranch => {
                Self::Github(github::Method::ServiceRefreshPrForBranch)
            }
            MethodId::YiruRuntimeV1GitHubServiceGetPrChecks => {
                Self::Github(github::Method::ServiceGetPrChecks)
            }
            MethodId::YiruRuntimeV1GitHubServiceGetPrCheckDetails => {
                Self::Github(github::Method::ServiceGetPrCheckDetails)
            }
            MethodId::YiruRuntimeV1GitHubServiceRerunPrChecks => {
                Self::Github(github::Method::ServiceRerunPrChecks)
            }
            MethodId::YiruRuntimeV1GitHubServiceGetPrComments => {
                Self::Github(github::Method::ServiceGetPrComments)
            }
            MethodId::YiruRuntimeV1GitHubServiceGetPrFileContents => {
                Self::Github(github::Method::ServiceGetPrFileContents)
            }
            MethodId::YiruRuntimeV1GitHubServiceResolveReviewThread => {
                Self::Github(github::Method::ServiceResolveReviewThread)
            }
            MethodId::YiruRuntimeV1GitHubServiceSetPrFileViewed => {
                Self::Github(github::Method::ServiceSetPrFileViewed)
            }
            MethodId::YiruRuntimeV1GitHubServiceUpdatePrTitle => {
                Self::Github(github::Method::ServiceUpdatePrTitle)
            }
            MethodId::YiruRuntimeV1GitHubServiceUpdatePr => {
                Self::Github(github::Method::ServiceUpdatePr)
            }
            MethodId::YiruRuntimeV1GitHubServiceUpdatePrState => {
                Self::Github(github::Method::ServiceUpdatePrState)
            }
            MethodId::YiruRuntimeV1GitHubServiceMergePr => {
                Self::Github(github::Method::ServiceMergePr)
            }
            MethodId::YiruRuntimeV1GitHubServiceSetPrAutoMerge => {
                Self::Github(github::Method::ServiceSetPrAutoMerge)
            }
            MethodId::YiruRuntimeV1GitHubServiceRequestPrReviewers => {
                Self::Github(github::Method::ServiceRequestPrReviewers)
            }
            MethodId::YiruRuntimeV1GitHubServiceRemovePrReviewers => {
                Self::Github(github::Method::ServiceRemovePrReviewers)
            }
            MethodId::YiruRuntimeV1GitHubServiceAddPrComment => {
                Self::Github(github::Method::ServiceAddPrComment)
            }
            MethodId::YiruRuntimeV1GitHubServiceAddPrReviewComment => {
                Self::Github(github::Method::ServiceAddPrReviewComment)
            }
            MethodId::YiruRuntimeV1GitHubServiceAddPrReviewCommentReply => {
                Self::Github(github::Method::ServiceAddPrReviewCommentReply)
            }
            MethodId::YiruRuntimeV1GitHubServiceCreateCommentDraft => {
                Self::Github(github::Method::ServiceCreateCommentDraft)
            }
            MethodId::YiruRuntimeV1GitHubServiceGetHostedReviewForBranch => {
                Self::Github(github::Method::ServiceGetHostedReviewForBranch)
            }
            MethodId::YiruRuntimeV1GitHubServiceGetHostedReviewCreationEligibility => {
                Self::Github(github::Method::ServiceGetHostedReviewCreationEligibility)
            }
            MethodId::YiruRuntimeV1GitHubServiceCreateHostedReview => {
                Self::Github(github::Method::ServiceCreateHostedReview)
            }
            MethodId::YiruRuntimeV1GitHubServiceSubscribeEvents => {
                Self::Github(github::Method::ServiceSubscribeEvents)
            }
            MethodId::YiruRuntimeV1OrchestrationServiceRunCreate => {
                Self::Orchestration(orchestration::Method::RunCreate)
            }
            MethodId::YiruRuntimeV1OrchestrationServiceRunUse => {
                Self::Orchestration(orchestration::Method::RunUse)
            }
            MethodId::YiruRuntimeV1OrchestrationServiceRunCurrent => {
                Self::Orchestration(orchestration::Method::RunCurrent)
            }
            MethodId::YiruRuntimeV1OrchestrationServiceRunList => {
                Self::Orchestration(orchestration::Method::RunList)
            }
            MethodId::YiruRuntimeV1OrchestrationServiceRunShow => {
                Self::Orchestration(orchestration::Method::RunShow)
            }
            MethodId::YiruRuntimeV1OrchestrationServiceTaskCreate => {
                Self::Orchestration(orchestration::Method::TaskCreate)
            }
            MethodId::YiruRuntimeV1OrchestrationServiceTaskList => {
                Self::Orchestration(orchestration::Method::TaskList)
            }
            MethodId::YiruRuntimeV1OrchestrationServiceTaskUpdate => {
                Self::Orchestration(orchestration::Method::TaskUpdate)
            }
            MethodId::YiruRuntimeV1OrchestrationServiceDispatch => {
                Self::Orchestration(orchestration::Method::Dispatch)
            }
            MethodId::YiruRuntimeV1OrchestrationServiceDispatchShow => {
                Self::Orchestration(orchestration::Method::DispatchShow)
            }
            MethodId::YiruRuntimeV1OrchestrationServiceSend => {
                Self::Orchestration(orchestration::Method::Send)
            }
            MethodId::YiruRuntimeV1OrchestrationServiceCheck => {
                Self::Orchestration(orchestration::Method::Check)
            }
            MethodId::YiruRuntimeV1OrchestrationServiceReply => {
                Self::Orchestration(orchestration::Method::Reply)
            }
            MethodId::YiruRuntimeV1OrchestrationServiceInbox => {
                Self::Orchestration(orchestration::Method::Inbox)
            }
            MethodId::YiruRuntimeV1OrchestrationServiceAsk => {
                Self::Orchestration(orchestration::Method::Ask)
            }
            MethodId::YiruRuntimeV1OrchestrationServiceRun => {
                Self::Orchestration(orchestration::Method::Run)
            }
            MethodId::YiruRuntimeV1OrchestrationServiceRunStop => {
                Self::Orchestration(orchestration::Method::RunStop)
            }
            MethodId::YiruRuntimeV1OrchestrationServiceGateCreate => {
                Self::Orchestration(orchestration::Method::GateCreate)
            }
            MethodId::YiruRuntimeV1OrchestrationServiceGateResolve => {
                Self::Orchestration(orchestration::Method::GateResolve)
            }
            MethodId::YiruRuntimeV1OrchestrationServiceGateList => {
                Self::Orchestration(orchestration::Method::GateList)
            }
            MethodId::YiruRuntimeV1OrchestrationServiceReset => {
                Self::Orchestration(orchestration::Method::Reset)
            }
            MethodId::YiruRuntimeV1OrchestrationServiceWorkerStart => {
                Self::Orchestration(orchestration::Method::WorkerStart)
            }
            MethodId::YiruRuntimeV1OrchestrationServiceWorkerShow => {
                Self::Orchestration(orchestration::Method::WorkerShow)
            }
            MethodId::YiruRuntimeV1OrchestrationServiceWorkerRead => {
                Self::Orchestration(orchestration::Method::WorkerRead)
            }
            MethodId::YiruRuntimeV1OrchestrationServiceWorkerStop => {
                Self::Orchestration(orchestration::Method::WorkerStop)
            }
            MethodId::YiruRuntimeV1OrchestrationServiceWorkerAbandon => {
                Self::Orchestration(orchestration::Method::WorkerAbandon)
            }
            MethodId::YiruRuntimeV1OrchestrationServiceFederationAttachStart => {
                Self::Orchestration(orchestration::Method::FederationAttachStart)
            }
            MethodId::YiruRuntimeV1OrchestrationServiceFederationPull => {
                Self::Orchestration(orchestration::Method::FederationPull)
            }
            MethodId::YiruRuntimeV1OrchestrationServiceFederationAck => {
                Self::Orchestration(orchestration::Method::FederationAck)
            }
            MethodId::YiruRuntimeV1OrchestrationServiceFederationImport => {
                Self::Orchestration(orchestration::Method::FederationImport)
            }
            MethodId::YiruRuntimeV1OrchestrationServiceFederationShow => {
                Self::Orchestration(orchestration::Method::FederationShow)
            }
            MethodId::YiruRuntimeV1OrchestrationServiceFederationRead => {
                Self::Orchestration(orchestration::Method::FederationRead)
            }
            MethodId::YiruRuntimeV1OrchestrationServiceFederationReadOutput => {
                Self::Orchestration(orchestration::Method::FederationReadOutput)
            }
            MethodId::YiruRuntimeV1OrchestrationServiceFederationStop => {
                Self::Orchestration(orchestration::Method::FederationStop)
            }
            MethodId::YiruRuntimeV1SettingsServiceGetDocument => {
                Self::Preferences(preferences::Method::SettingsServiceGetDocument)
            }
            MethodId::YiruRuntimeV1SettingsServiceSetDocument => {
                Self::Preferences(preferences::Method::SettingsServiceSetDocument)
            }
            MethodId::YiruRuntimeV1SettingsServiceGet => {
                Self::Preferences(preferences::Method::SettingsServiceGet)
            }
            MethodId::YiruRuntimeV1SettingsServiceUpdate => {
                Self::Preferences(preferences::Method::SettingsServiceUpdate)
            }
            MethodId::YiruRuntimeV1SettingsServiceGetTerminalQuickCommands => {
                Self::Preferences(preferences::Method::SettingsServiceGetTerminalQuickCommands)
            }
            MethodId::YiruRuntimeV1SettingsServiceUpdateTerminalQuickCommands => {
                Self::Preferences(preferences::Method::SettingsServiceUpdateTerminalQuickCommands)
            }
            MethodId::YiruRuntimeV1SettingsServiceUpdatePrBotAuthorOverride => {
                Self::Preferences(preferences::Method::SettingsServiceUpdatePrBotAuthorOverride)
            }
            MethodId::YiruRuntimeV1SettingsServiceListFonts => {
                Self::Preferences(preferences::Method::SettingsServiceListFonts)
            }
            MethodId::YiruRuntimeV1SettingsServicePreviewGhosttyImport => {
                Self::Preferences(preferences::Method::SettingsServicePreviewGhosttyImport)
            }
            MethodId::YiruRuntimeV1SettingsServicePreviewWarpThemeImport => {
                Self::Preferences(preferences::Method::SettingsServicePreviewWarpThemeImport)
            }
            MethodId::YiruRuntimeV1UiServiceGet => {
                Self::Preferences(preferences::Method::UiServiceGet)
            }
            MethodId::YiruRuntimeV1UiServiceSet => {
                Self::Preferences(preferences::Method::UiServiceSet)
            }
            MethodId::YiruRuntimeV1UiServiceRecordFeatureInteraction => {
                Self::Preferences(preferences::Method::UiServiceRecordFeatureInteraction)
            }
            MethodId::YiruRuntimeV1ShellKeybindingsServiceGet => {
                Self::Preferences(preferences::Method::ShellKeybindingsServiceGet)
            }
            MethodId::YiruRuntimeV1ShellKeybindingsServiceEnsureFile => {
                Self::Preferences(preferences::Method::ShellKeybindingsServiceEnsureFile)
            }
            MethodId::YiruRuntimeV1ShellKeybindingsServiceReload => {
                Self::Preferences(preferences::Method::ShellKeybindingsServiceReload)
            }
            MethodId::YiruRuntimeV1ShellKeybindingsServiceOpenFile => {
                Self::Preferences(preferences::Method::ShellKeybindingsServiceOpenFile)
            }
            MethodId::YiruRuntimeV1ShellKeybindingsServiceRevealFile => {
                Self::Preferences(preferences::Method::ShellKeybindingsServiceRevealFile)
            }
            MethodId::YiruRuntimeV1ShellKeybindingsServiceSetAction => {
                Self::Preferences(preferences::Method::ShellKeybindingsServiceSetAction)
            }
            MethodId::YiruRuntimeV1ShellYiruProfilesServiceList => {
                Self::Preferences(preferences::Method::ShellYiruProfilesServiceList)
            }
            MethodId::YiruRuntimeV1ShellYiruProfilesServiceCreateLocal => {
                Self::Preferences(preferences::Method::ShellYiruProfilesServiceCreateLocal)
            }
            MethodId::YiruRuntimeV1ShellYiruProfilesServiceSwitchProfile => {
                Self::Preferences(preferences::Method::ShellYiruProfilesServiceSwitchProfile)
            }
            MethodId::YiruRuntimeV1ShellYiruProfilesServiceTransferProject => {
                Self::Preferences(preferences::Method::ShellYiruProfilesServiceTransferProject)
            }
            MethodId::YiruRuntimeV1ShellYiruProfilesServiceFindProjectProfiles => {
                Self::Preferences(preferences::Method::ShellYiruProfilesServiceFindProjectProfiles)
            }
            MethodId::YiruRuntimeV1ShellCacheServiceGetGitHub => {
                Self::Preferences(preferences::Method::ShellCacheServiceGetGitHub)
            }
            MethodId::YiruRuntimeV1ShellCacheServiceSetGitHub => {
                Self::Preferences(preferences::Method::ShellCacheServiceSetGitHub)
            }
            MethodId::YiruRuntimeV1ShellOnboardingServiceGet => {
                Self::Preferences(preferences::Method::ShellOnboardingServiceGet)
            }
            MethodId::YiruRuntimeV1ShellOnboardingServiceUpdate => {
                Self::Preferences(preferences::Method::ShellOnboardingServiceUpdate)
            }
            MethodId::YiruRuntimeV1ClientEventsServiceUnsubscribe => {
                Self::Preferences(preferences::Method::ClientEventsServiceUnsubscribe)
            }
            MethodId::YiruRuntimeV1ClientEventsServiceSubscribe => {
                Self::Preferences(preferences::Method::ClientEventsServiceSubscribe)
            }
            MethodId::YiruRuntimeV1ShellEventsServiceSubscribe => {
                Self::Preferences(preferences::Method::ShellEventsServiceSubscribe)
            }
            MethodId::YiruRuntimeV1ProgressEventsServiceSubscribe => {
                Self::Preferences(preferences::Method::ProgressEventsServiceSubscribe)
            }
            MethodId::YiruRuntimeV1RepoServiceGetHooks => {
                Self::Projects(projects::Method::RepoServiceGetHooks)
            }
            MethodId::YiruRuntimeV1RepoServiceList => {
                Self::Projects(projects::Method::RepoServiceList)
            }
            MethodId::YiruRuntimeV1RepoServiceAdd => {
                Self::Projects(projects::Method::RepoServiceAdd)
            }
            MethodId::YiruRuntimeV1RepoServiceBaseRefDefault => {
                Self::Projects(projects::Method::RepoServiceBaseRefDefault)
            }
            MethodId::YiruRuntimeV1RepoServiceSearchRefs => {
                Self::Projects(projects::Method::RepoServiceSearchRefs)
            }
            MethodId::YiruRuntimeV1ProjectGroupServiceList => {
                Self::Projects(projects::Method::ProjectGroupServiceList)
            }
            MethodId::YiruRuntimeV1ProjectGroupServiceCreate => {
                Self::Projects(projects::Method::ProjectGroupServiceCreate)
            }
            MethodId::YiruRuntimeV1ProjectGroupServiceUpdate => {
                Self::Projects(projects::Method::ProjectGroupServiceUpdate)
            }
            MethodId::YiruRuntimeV1ProjectGroupServiceDelete => {
                Self::Projects(projects::Method::ProjectGroupServiceDelete)
            }
            MethodId::YiruRuntimeV1ProjectGroupServiceMoveProject => {
                Self::Projects(projects::Method::ProjectGroupServiceMoveProject)
            }
            MethodId::YiruRuntimeV1ProjectGroupServiceScanNested => {
                Self::Projects(projects::Method::ProjectGroupServiceScanNested)
            }
            MethodId::YiruRuntimeV1ProjectGroupServiceCancelNestedScan => {
                Self::Projects(projects::Method::ProjectGroupServiceCancelNestedScan)
            }
            MethodId::YiruRuntimeV1ProjectGroupServiceImportNested => {
                Self::Projects(projects::Method::ProjectGroupServiceImportNested)
            }
            MethodId::YiruRuntimeV1ProjectGroupServiceSubscribeEvents => {
                Self::Projects(projects::Method::ProjectGroupServiceSubscribeEvents)
            }
            MethodId::YiruRuntimeV1RepoServiceClone => {
                Self::Projects(projects::Method::RepoServiceClone)
            }
            MethodId::YiruRuntimeV1RepoServiceCreate => {
                Self::Projects(projects::Method::RepoServiceCreate)
            }
            MethodId::YiruRuntimeV1RepoServiceGitAvailable => {
                Self::Projects(projects::Method::RepoServiceGitAvailable)
            }
            MethodId::YiruRuntimeV1RepoServiceReorder => {
                Self::Projects(projects::Method::RepoServiceReorder)
            }
            MethodId::YiruRuntimeV1RepoServiceRm => Self::Projects(projects::Method::RepoServiceRm),
            MethodId::YiruRuntimeV1RepoServiceUpdate => {
                Self::Projects(projects::Method::RepoServiceUpdate)
            }
            MethodId::YiruRuntimeV1RepoServiceHooks => {
                Self::Projects(projects::Method::RepoServiceHooks)
            }
            MethodId::YiruRuntimeV1RepoServiceHooksCheck => {
                Self::Projects(projects::Method::RepoServiceHooksCheck)
            }
            MethodId::YiruRuntimeV1RepoServiceSetupScriptImports => {
                Self::Projects(projects::Method::RepoServiceSetupScriptImports)
            }
            MethodId::YiruRuntimeV1RepoServiceSparsePresets => {
                Self::Projects(projects::Method::RepoServiceSparsePresets)
            }
            MethodId::YiruRuntimeV1RepoServiceSaveSparsePreset => {
                Self::Projects(projects::Method::RepoServiceSaveSparsePreset)
            }
            MethodId::YiruRuntimeV1RepoServiceRemoveSparsePreset => {
                Self::Projects(projects::Method::RepoServiceRemoveSparsePreset)
            }
            MethodId::YiruRuntimeV1ShellRepoHostServiceCloneAbort => {
                Self::Projects(projects::Method::ShellRepoHostServiceCloneAbort)
            }
            MethodId::YiruRuntimeV1ShellRepoHostServiceGetDefaultCreateProjectParent => {
                Self::Projects(projects::Method::ShellRepoHostServiceGetDefaultCreateProjectParent)
            }
            MethodId::YiruRuntimeV1ShellRepoHostServicePickDirectory => {
                Self::Projects(projects::Method::ShellRepoHostServicePickDirectory)
            }
            MethodId::YiruRuntimeV1ShellRepoHostServicePickFolder => {
                Self::Projects(projects::Method::ShellRepoHostServicePickFolder)
            }
            MethodId::YiruRuntimeV1ShellRepoHostServicePickFolders => {
                Self::Projects(projects::Method::ShellRepoHostServicePickFolders)
            }
            MethodId::YiruRuntimeV1ShellRepoHostServiceRemoveForHost => {
                Self::Projects(projects::Method::ShellRepoHostServiceRemoveForHost)
            }
            MethodId::YiruRuntimeV1ShellRepoHostServiceReorderForHost => {
                Self::Projects(projects::Method::ShellRepoHostServiceReorderForHost)
            }
            MethodId::YiruRuntimeV1ProjectHostSetupServiceList => {
                Self::Projects(projects::Method::ProjectHostSetupServiceList)
            }
            MethodId::YiruRuntimeV1ProjectHostSetupServiceCreate => {
                Self::Projects(projects::Method::ProjectHostSetupServiceCreate)
            }
            MethodId::YiruRuntimeV1ProjectHostSetupServiceSetupExistingFolder => {
                Self::Projects(projects::Method::ProjectHostSetupServiceSetupExistingFolder)
            }
            MethodId::YiruRuntimeV1ProjectHostSetupServiceClone => {
                Self::Projects(projects::Method::ProjectHostSetupServiceClone)
            }
            MethodId::YiruRuntimeV1ProjectHostSetupServiceUpdate => {
                Self::Projects(projects::Method::ProjectHostSetupServiceUpdate)
            }
            MethodId::YiruRuntimeV1ProjectHostSetupServiceDelete => {
                Self::Projects(projects::Method::ProjectHostSetupServiceDelete)
            }
            MethodId::YiruRuntimeV1FolderWorkspaceServiceList => {
                Self::Projects(projects::Method::FolderWorkspaceServiceList)
            }
            MethodId::YiruRuntimeV1FolderWorkspaceServiceCreate => {
                Self::Projects(projects::Method::FolderWorkspaceServiceCreate)
            }
            MethodId::YiruRuntimeV1FolderWorkspaceServiceUpdate => {
                Self::Projects(projects::Method::FolderWorkspaceServiceUpdate)
            }
            MethodId::YiruRuntimeV1FolderWorkspaceServiceDelete => {
                Self::Projects(projects::Method::FolderWorkspaceServiceDelete)
            }
            MethodId::YiruRuntimeV1FolderWorkspaceServiceGetPathStatus => {
                Self::Projects(projects::Method::FolderWorkspaceServiceGetPathStatus)
            }
            MethodId::YiruRuntimeV1ProjectServiceList => {
                Self::Projects(projects::Method::ProjectServiceList)
            }
            MethodId::YiruRuntimeV1ProjectServiceUpdate => {
                Self::Projects(projects::Method::ProjectServiceUpdate)
            }
            MethodId::YiruRuntimeV1ProjectContextServiceResolve => {
                Self::Projects(projects::Method::ProjectContextServiceResolve)
            }
            MethodId::YiruRuntimeV1AppControlServiceRecordStartupDiagnostic => {
                Self::Runtime(runtime::Method::AppControlServiceRecordStartupDiagnostic)
            }
            MethodId::YiruRuntimeV1AppControlServiceRestart => {
                Self::Runtime(runtime::Method::AppControlServiceRestart)
            }
            MethodId::YiruRuntimeV1CliServiceGetInstallStatus => {
                Self::Runtime(runtime::Method::CliServiceGetInstallStatus)
            }
            MethodId::YiruRuntimeV1CliServiceInstall => {
                Self::Runtime(runtime::Method::CliServiceInstall)
            }
            MethodId::YiruRuntimeV1CliServiceRemove => {
                Self::Runtime(runtime::Method::CliServiceRemove)
            }
            MethodId::YiruRuntimeV1CliServiceGetWslInstallStatus => {
                Self::Runtime(runtime::Method::CliServiceGetWslInstallStatus)
            }
            MethodId::YiruRuntimeV1CliServiceInstallWsl => {
                Self::Runtime(runtime::Method::CliServiceInstallWsl)
            }
            MethodId::YiruRuntimeV1CliServiceRemoveWsl => {
                Self::Runtime(runtime::Method::CliServiceRemoveWsl)
            }
            MethodId::YiruRuntimeV1DeveloperPermissionsServiceGetStatus => {
                Self::Runtime(runtime::Method::DeveloperPermissionsServiceGetStatus)
            }
            MethodId::YiruRuntimeV1DeveloperPermissionsServiceRequest => {
                Self::Runtime(runtime::Method::DeveloperPermissionsServiceRequest)
            }
            MethodId::YiruRuntimeV1WindowsFirewallServiceGetStatus => {
                Self::Runtime(runtime::Method::WindowsFirewallServiceGetStatus)
            }
            MethodId::YiruRuntimeV1WindowsFirewallServiceRepair => {
                Self::Runtime(runtime::Method::WindowsFirewallServiceRepair)
            }
            MethodId::YiruRuntimeV1WindowsFirewallServiceOpenNetworkSettings => {
                Self::Runtime(runtime::Method::WindowsFirewallServiceOpenNetworkSettings)
            }
            MethodId::YiruRuntimeV1HostRegistryServiceIsWslAvailable => {
                Self::Runtime(runtime::Method::HostRegistryServiceIsWslAvailable)
            }
            MethodId::YiruRuntimeV1HostRegistryServiceListWslDistros => {
                Self::Runtime(runtime::Method::HostRegistryServiceListWslDistros)
            }
            MethodId::YiruRuntimeV1HostRegistryServiceIsGitBashAvailable => {
                Self::Runtime(runtime::Method::HostRegistryServiceIsGitBashAvailable)
            }
            MethodId::YiruRuntimeV1HostRegistryServiceIsPwshAvailable => {
                Self::Runtime(runtime::Method::HostRegistryServiceIsPwshAvailable)
            }
            MethodId::YiruRuntimeV1HostRegistryServiceMarkAgentTrusted => {
                Self::Runtime(runtime::Method::HostRegistryServiceMarkAgentTrusted)
            }
            MethodId::YiruRuntimeV1HostRegistryServiceAdd => {
                Self::Runtime(runtime::Method::HostRegistryServiceAdd)
            }
            MethodId::YiruRuntimeV1HostRegistryServiceList => {
                Self::Runtime(runtime::Method::HostRegistryServiceList)
            }
            MethodId::YiruRuntimeV1HostRegistryServiceProbe => {
                Self::Runtime(runtime::Method::HostRegistryServiceProbe)
            }
            MethodId::YiruRuntimeV1HostRegistryServiceRemove => {
                Self::Runtime(runtime::Method::HostRegistryServiceRemove)
            }
            MethodId::YiruRuntimeV1MobilePairingServiceCreateDevelopmentOffer => {
                Self::Runtime(runtime::Method::MobilePairingServiceCreateDevelopmentOffer)
            }
            MethodId::YiruRuntimeV1MobilePairingServiceGetPairingQr => {
                Self::Runtime(runtime::Method::MobilePairingServiceGetPairingQr)
            }
            MethodId::YiruRuntimeV1MobilePairingServiceListDevices => {
                Self::Runtime(runtime::Method::MobilePairingServiceListDevices)
            }
            MethodId::YiruRuntimeV1MobilePairingServiceListNetworkInterfaces => {
                Self::Runtime(runtime::Method::MobilePairingServiceListNetworkInterfaces)
            }
            MethodId::YiruRuntimeV1MobilePairingServiceRevokeDevice => {
                Self::Runtime(runtime::Method::MobilePairingServiceRevokeDevice)
            }
            MethodId::YiruRuntimeV1RuntimeEnvironmentServiceGenerateOffer => {
                Self::Runtime(runtime::Method::RuntimeEnvironmentServiceGenerateOffer)
            }
            MethodId::YiruRuntimeV1RuntimeEnvironmentServiceDisconnect => {
                Self::Runtime(runtime::Method::RuntimeEnvironmentServiceDisconnect)
            }
            MethodId::YiruRuntimeV1RuntimeEnvironmentServiceGetStatus => {
                Self::Runtime(runtime::Method::RuntimeEnvironmentServiceGetStatus)
            }
            MethodId::YiruRuntimeV1RuntimeEnvironmentServiceImport => {
                Self::Runtime(runtime::Method::RuntimeEnvironmentServiceImport)
            }
            MethodId::YiruRuntimeV1RuntimeEnvironmentServiceList => {
                Self::Runtime(runtime::Method::RuntimeEnvironmentServiceList)
            }
            MethodId::YiruRuntimeV1RuntimeEnvironmentServiceListPeers => {
                Self::Runtime(runtime::Method::RuntimeEnvironmentServiceListPeers)
            }
            MethodId::YiruRuntimeV1RuntimeEnvironmentServiceRemove => {
                Self::Runtime(runtime::Method::RuntimeEnvironmentServiceRemove)
            }
            MethodId::YiruRuntimeV1RuntimeEnvironmentServiceRevokePeer => {
                Self::Runtime(runtime::Method::RuntimeEnvironmentServiceRevokePeer)
            }
            MethodId::YiruRuntimeV1StatusServiceGetStatus => {
                Self::Runtime(runtime::Method::StatusServiceGetStatus)
            }
            MethodId::YiruRuntimeV1UpdaterServiceCheck => {
                Self::Runtime(runtime::Method::UpdaterServiceCheck)
            }
            MethodId::YiruRuntimeV1UpdaterServiceDownload => {
                Self::Runtime(runtime::Method::UpdaterServiceDownload)
            }
            MethodId::YiruRuntimeV1UpdaterServiceGetStatus => {
                Self::Runtime(runtime::Method::UpdaterServiceGetStatus)
            }
            MethodId::YiruRuntimeV1UpdaterServiceGetVersion => {
                Self::Runtime(runtime::Method::UpdaterServiceGetVersion)
            }
            MethodId::YiruRuntimeV1UpdaterServiceInstall => {
                Self::Runtime(runtime::Method::UpdaterServiceInstall)
            }
            MethodId::YiruRuntimeV1UpdaterServiceSubscribeStatus => {
                Self::Runtime(runtime::Method::UpdaterServiceSubscribeStatus)
            }
            MethodId::YiruRuntimeV1ShellPlatformServiceOpenPath => {
                Self::Runtime(runtime::Method::ShellPlatformServiceOpenPath)
            }
            MethodId::YiruRuntimeV1ShellPlatformServiceOpenFileUri => {
                Self::Runtime(runtime::Method::ShellPlatformServiceOpenFileUri)
            }
            MethodId::YiruRuntimeV1ShellPlatformServiceOpenInExternalEditor => {
                Self::Runtime(runtime::Method::ShellPlatformServiceOpenInExternalEditor)
            }
            MethodId::YiruRuntimeV1ShellPlatformServiceOpenInFileManager => {
                Self::Runtime(runtime::Method::ShellPlatformServiceOpenInFileManager)
            }
            MethodId::YiruRuntimeV1ShellPlatformServiceOpenFilePath => {
                Self::Runtime(runtime::Method::ShellPlatformServiceOpenFilePath)
            }
            MethodId::YiruRuntimeV1ShellPlatformServicePathExists => {
                Self::Runtime(runtime::Method::ShellPlatformServicePathExists)
            }
            MethodId::YiruRuntimeV1ShellPlatformServicePickAttachment => {
                Self::Runtime(runtime::Method::ShellPlatformServicePickAttachment)
            }
            MethodId::YiruRuntimeV1ShellPlatformServicePickImage => {
                Self::Runtime(runtime::Method::ShellPlatformServicePickImage)
            }
            MethodId::YiruRuntimeV1ShellPlatformServicePickAudio => {
                Self::Runtime(runtime::Method::ShellPlatformServicePickAudio)
            }
            MethodId::YiruRuntimeV1ShellPlatformServicePickDirectory => {
                Self::Runtime(runtime::Method::ShellPlatformServicePickDirectory)
            }
            MethodId::YiruRuntimeV1PreflightServiceCheck => {
                Self::Runtime(runtime::Method::PreflightServiceCheck)
            }
            MethodId::YiruRuntimeV1PreflightServiceDetectAgents => {
                Self::Runtime(runtime::Method::PreflightServiceDetectAgents)
            }
            MethodId::YiruRuntimeV1PreflightServiceDetectRemoteAgents => {
                Self::Runtime(runtime::Method::PreflightServiceDetectRemoteAgents)
            }
            MethodId::YiruRuntimeV1PreflightServiceRefreshAgents => {
                Self::Runtime(runtime::Method::PreflightServiceRefreshAgents)
            }
            MethodId::YiruRuntimeV1DiagnosticsServiceGetMemorySnapshot => {
                Self::Support(support::Method::DiagnosticsServiceGetMemorySnapshot)
            }
            MethodId::YiruRuntimeV1DiagnosticsServiceGetStatus => {
                Self::Support(support::Method::DiagnosticsServiceGetStatus)
            }
            MethodId::YiruRuntimeV1DiagnosticsServiceCollectBundle => {
                Self::Support(support::Method::DiagnosticsServiceCollectBundle)
            }
            MethodId::YiruRuntimeV1DiagnosticsServiceOpenBundlePreview => {
                Self::Support(support::Method::DiagnosticsServiceOpenBundlePreview)
            }
            MethodId::YiruRuntimeV1DiagnosticsServiceDiscardBundlePreview => {
                Self::Support(support::Method::DiagnosticsServiceDiscardBundlePreview)
            }
            MethodId::YiruRuntimeV1DiagnosticsServiceUploadBundle => {
                Self::Support(support::Method::DiagnosticsServiceUploadBundle)
            }
            MethodId::YiruRuntimeV1NotificationsServiceDismiss => {
                Self::Support(support::Method::NotificationsServiceDismiss)
            }
            MethodId::YiruRuntimeV1NotificationsServiceReport => {
                Self::Support(support::Method::NotificationsServiceReport)
            }
            MethodId::YiruRuntimeV1NotificationsServiceGetMissedSince => {
                Self::Support(support::Method::NotificationsServiceGetMissedSince)
            }
            MethodId::YiruRuntimeV1NotificationsServiceLoadCustomSound => {
                Self::Support(support::Method::NotificationsServiceLoadCustomSound)
            }
            MethodId::YiruRuntimeV1NotificationsServiceRegisterPush => {
                Self::Support(support::Method::NotificationsServiceRegisterPush)
            }
            MethodId::YiruRuntimeV1NotificationsServiceSubscribe => {
                Self::Support(support::Method::NotificationsServiceSubscribe)
            }
            MethodId::YiruRuntimeV1StarNagShellServiceDismiss => {
                Self::Support(support::Method::StarNagShellServiceDismiss)
            }
            MethodId::YiruRuntimeV1StarNagShellServiceLater => {
                Self::Support(support::Method::StarNagShellServiceLater)
            }
            MethodId::YiruRuntimeV1StarNagShellServiceComplete => {
                Self::Support(support::Method::StarNagShellServiceComplete)
            }
            MethodId::YiruRuntimeV1StarNagShellServiceOpenWeb => {
                Self::Support(support::Method::StarNagShellServiceOpenWeb)
            }
            MethodId::YiruRuntimeV1StarNagShellServiceStarYiru => {
                Self::Support(support::Method::StarNagShellServiceStarYiru)
            }
            MethodId::YiruRuntimeV1StarNagShellServiceAgentValueMoment => {
                Self::Support(support::Method::StarNagShellServiceAgentValueMoment)
            }
            MethodId::YiruRuntimeV1StarNagShellServiceShowAgentValueMoment => {
                Self::Support(support::Method::StarNagShellServiceShowAgentValueMoment)
            }
            MethodId::YiruRuntimeV1StarNagShellServiceOnboardingCompleted => {
                Self::Support(support::Method::StarNagShellServiceOnboardingCompleted)
            }
            MethodId::YiruRuntimeV1FeedbackServiceSubmit => {
                Self::Support(support::Method::FeedbackServiceSubmit)
            }
            MethodId::YiruRuntimeV1CrashReportsServiceGetLatestPending => {
                Self::Support(support::Method::CrashReportsServiceGetLatestPending)
            }
            MethodId::YiruRuntimeV1CrashReportsServiceGetLatestReport => {
                Self::Support(support::Method::CrashReportsServiceGetLatestReport)
            }
            MethodId::YiruRuntimeV1CrashReportsServiceDismiss => {
                Self::Support(support::Method::CrashReportsServiceDismiss)
            }
            MethodId::YiruRuntimeV1CrashReportsServiceRecordRendererError => {
                Self::Support(support::Method::CrashReportsServiceRecordRendererError)
            }
            MethodId::YiruRuntimeV1CrashReportsServiceSubmit => {
                Self::Support(support::Method::CrashReportsServiceSubmit)
            }
            MethodId::YiruRuntimeV1CrashReportsServiceCopyLatestDiagnostics => {
                Self::Support(support::Method::CrashReportsServiceCopyLatestDiagnostics)
            }
            MethodId::YiruRuntimeV1CrashReportsServiceRecordBreadcrumb => {
                Self::Support(support::Method::CrashReportsServiceRecordBreadcrumb)
            }
            MethodId::YiruRuntimeV1ShellTelemetryServiceTrack => {
                Self::Support(support::Method::ShellTelemetryServiceTrack)
            }
            MethodId::YiruRuntimeV1ShellTelemetryServiceGetConsentState => {
                Self::Support(support::Method::ShellTelemetryServiceGetConsentState)
            }
            MethodId::YiruRuntimeV1ShellTelemetryServiceSetOptIn => {
                Self::Support(support::Method::ShellTelemetryServiceSetOptIn)
            }
            MethodId::YiruRuntimeV1ShellTelemetryServiceAcknowledgeBanner => {
                Self::Support(support::Method::ShellTelemetryServiceAcknowledgeBanner)
            }
            MethodId::YiruRuntimeV1TerminalFitServiceGetDrivers => {
                Self::Terminal(terminal::Method::TerminalFitServiceGetDrivers)
            }
            MethodId::YiruRuntimeV1TerminalFitServiceGetOverrides => {
                Self::Terminal(terminal::Method::TerminalFitServiceGetOverrides)
            }
            MethodId::YiruRuntimeV1TerminalFitServiceRestore => {
                Self::Terminal(terminal::Method::TerminalFitServiceRestore)
            }
            MethodId::YiruRuntimeV1TerminalPreferencesServiceGetAutoRestoreFit => {
                Self::Terminal(terminal::Method::TerminalPreferencesServiceGetAutoRestoreFit)
            }
            MethodId::YiruRuntimeV1TerminalPreferencesServiceSetAutoRestoreFit => {
                Self::Terminal(terminal::Method::TerminalPreferencesServiceSetAutoRestoreFit)
            }
            MethodId::YiruRuntimeV1TerminalServiceList => {
                Self::Terminal(terminal::Method::TerminalServiceList)
            }
            MethodId::YiruRuntimeV1TerminalServiceCreate => {
                Self::Terminal(terminal::Method::TerminalServiceCreate)
            }
            MethodId::YiruRuntimeV1TerminalServiceRead => {
                Self::Terminal(terminal::Method::TerminalServiceRead)
            }
            MethodId::YiruRuntimeV1TerminalServiceSend => {
                Self::Terminal(terminal::Method::TerminalServiceSend)
            }
            MethodId::YiruRuntimeV1TerminalServiceClose => {
                Self::Terminal(terminal::Method::TerminalServiceClose)
            }
            MethodId::YiruRuntimeV1TerminalServiceFocus => {
                Self::Terminal(terminal::Method::TerminalServiceFocus)
            }
            MethodId::YiruRuntimeV1LayoutServiceList => {
                Self::Terminal(terminal::Method::LayoutServiceList)
            }
            MethodId::YiruRuntimeV1LayoutServiceApply => {
                Self::Terminal(terminal::Method::LayoutServiceApply)
            }
            MethodId::YiruRuntimeV1SessionTabsServiceActivate => {
                Self::Terminal(terminal::Method::SessionTabsServiceActivate)
            }
            MethodId::YiruRuntimeV1SessionTabsServiceClose => {
                Self::Terminal(terminal::Method::SessionTabsServiceClose)
            }
            MethodId::YiruRuntimeV1SessionTabsServiceCreateTerminal => {
                Self::Terminal(terminal::Method::SessionTabsServiceCreateTerminal)
            }
            MethodId::YiruRuntimeV1SessionTabsServiceList => {
                Self::Terminal(terminal::Method::SessionTabsServiceList)
            }
            MethodId::YiruRuntimeV1SessionTabsServiceListAll => {
                Self::Terminal(terminal::Method::SessionTabsServiceListAll)
            }
            MethodId::YiruRuntimeV1SessionTabsServiceMove => {
                Self::Terminal(terminal::Method::SessionTabsServiceMove)
            }
            MethodId::YiruRuntimeV1SessionTabsServiceSetTabProps => {
                Self::Terminal(terminal::Method::SessionTabsServiceSetTabProps)
            }
            MethodId::YiruRuntimeV1SessionTabsServiceUpdatePaneLayout => {
                Self::Terminal(terminal::Method::SessionTabsServiceUpdatePaneLayout)
            }
            MethodId::YiruRuntimeV1SessionTabsServiceSubscribe => {
                Self::Terminal(terminal::Method::SessionTabsServiceSubscribe)
            }
            MethodId::YiruRuntimeV1SessionTabsServiceSubscribeAll => {
                Self::Terminal(terminal::Method::SessionTabsServiceSubscribeAll)
            }
            MethodId::YiruRuntimeV1SessionTabsServiceUnsubscribe => {
                Self::Terminal(terminal::Method::SessionTabsServiceUnsubscribe)
            }
            MethodId::YiruRuntimeV1SessionTabsServiceUnsubscribeAll => {
                Self::Terminal(terminal::Method::SessionTabsServiceUnsubscribeAll)
            }
            MethodId::YiruRuntimeV1TerminalServiceClearBuffer => {
                Self::Terminal(terminal::Method::TerminalServiceClearBuffer)
            }
            MethodId::YiruRuntimeV1TerminalServiceCloseTab => {
                Self::Terminal(terminal::Method::TerminalServiceCloseTab)
            }
            MethodId::YiruRuntimeV1TerminalServiceGetDisplayMode => {
                Self::Terminal(terminal::Method::TerminalServiceGetDisplayMode)
            }
            MethodId::YiruRuntimeV1TerminalServiceSetDisplayMode => {
                Self::Terminal(terminal::Method::TerminalServiceSetDisplayMode)
            }
            MethodId::YiruRuntimeV1TerminalServiceInspectProcess => {
                Self::Terminal(terminal::Method::TerminalServiceInspectProcess)
            }
            MethodId::YiruRuntimeV1TerminalServiceIsRunningAgent => {
                Self::Terminal(terminal::Method::TerminalServiceIsRunningAgent)
            }
            MethodId::YiruRuntimeV1TerminalServiceGetAgentStatus => {
                Self::Terminal(terminal::Method::TerminalServiceGetAgentStatus)
            }
            MethodId::YiruRuntimeV1TerminalServiceListManagedSessions => {
                Self::Terminal(terminal::Method::TerminalServiceListManagedSessions)
            }
            MethodId::YiruRuntimeV1TerminalServiceKillAllManaged => {
                Self::Terminal(terminal::Method::TerminalServiceKillAllManaged)
            }
            MethodId::YiruRuntimeV1TerminalServiceKillManaged => {
                Self::Terminal(terminal::Method::TerminalServiceKillManaged)
            }
            MethodId::YiruRuntimeV1TerminalServiceRestartManaged => {
                Self::Terminal(terminal::Method::TerminalServiceRestartManaged)
            }
            MethodId::YiruRuntimeV1TerminalServiceRename => {
                Self::Terminal(terminal::Method::TerminalServiceRename)
            }
            MethodId::YiruRuntimeV1TerminalServiceShow => {
                Self::Terminal(terminal::Method::TerminalServiceShow)
            }
            MethodId::YiruRuntimeV1TerminalServiceResizeForClient => {
                Self::Terminal(terminal::Method::TerminalServiceResizeForClient)
            }
            MethodId::YiruRuntimeV1TerminalServiceResolveActive => {
                Self::Terminal(terminal::Method::TerminalServiceResolveActive)
            }
            MethodId::YiruRuntimeV1TerminalServiceResolvePane => {
                Self::Terminal(terminal::Method::TerminalServiceResolvePane)
            }
            MethodId::YiruRuntimeV1TerminalServiceSplit => {
                Self::Terminal(terminal::Method::TerminalServiceSplit)
            }
            MethodId::YiruRuntimeV1TerminalServiceStop => {
                Self::Terminal(terminal::Method::TerminalServiceStop)
            }
            MethodId::YiruRuntimeV1TerminalServiceStopExact => {
                Self::Terminal(terminal::Method::TerminalServiceStopExact)
            }
            MethodId::YiruRuntimeV1TerminalServiceUnsubscribe => {
                Self::Terminal(terminal::Method::TerminalServiceUnsubscribe)
            }
            MethodId::YiruRuntimeV1TerminalServiceUpdateViewAttributes => {
                Self::Terminal(terminal::Method::TerminalServiceUpdateViewAttributes)
            }
            MethodId::YiruRuntimeV1TerminalServiceUpdateViewport => {
                Self::Terminal(terminal::Method::TerminalServiceUpdateViewport)
            }
            MethodId::YiruRuntimeV1TerminalServiceRestoreDesktopFit => {
                Self::Terminal(terminal::Method::TerminalServiceRestoreDesktopFit)
            }
            MethodId::YiruRuntimeV1TerminalServiceWait => {
                Self::Terminal(terminal::Method::TerminalServiceWait)
            }
            MethodId::YiruRuntimeV1TerminalServiceApprove => {
                Self::Terminal(terminal::Method::TerminalServiceApprove)
            }
            MethodId::YiruRuntimeV1TerminalServiceMultiplex => {
                Self::Terminal(terminal::Method::TerminalServiceMultiplex)
            }
            MethodId::YiruRuntimeV1TerminalServiceOpenMultiplex => {
                Self::Terminal(terminal::Method::TerminalServiceOpenMultiplex)
            }
            MethodId::YiruRuntimeV1DriverEventsServiceSubscribe => {
                Self::Terminal(terminal::Method::DriverEventsServiceSubscribe)
            }
            MethodId::YiruRuntimeV1WorktreeLabelsServiceRegister => {
                Self::Workspaces(workspaces::Method::WorktreeLabelsServiceRegister)
            }
            MethodId::YiruRuntimeV1WorktreeServicePs => {
                Self::Workspaces(workspaces::Method::WorktreeServicePs)
            }
            MethodId::YiruRuntimeV1WorktreeServiceShow => {
                Self::Workspaces(workspaces::Method::WorktreeServiceShow)
            }
            MethodId::YiruRuntimeV1WorktreeServiceSleep => {
                Self::Workspaces(workspaces::Method::WorktreeServiceSleep)
            }
            MethodId::YiruRuntimeV1WorktreeServiceActivate => {
                Self::Workspaces(workspaces::Method::WorktreeServiceActivate)
            }
            MethodId::YiruRuntimeV1WorktreeServicePrefetchCreateBase => {
                Self::Workspaces(workspaces::Method::WorktreeServicePrefetchCreateBase)
            }
            MethodId::YiruRuntimeV1WorktreeServiceResolvePrBase => {
                Self::Workspaces(workspaces::Method::WorktreeServiceResolvePrBase)
            }
            MethodId::YiruRuntimeV1WorktreeServiceRemove => {
                Self::Workspaces(workspaces::Method::WorktreeServiceRemove)
            }
            MethodId::YiruRuntimeV1WorktreeServiceForceDeleteBranch => {
                Self::Workspaces(workspaces::Method::WorktreeServiceForceDeleteBranch)
            }
            MethodId::YiruRuntimeV1WorktreeServiceSet => {
                Self::Workspaces(workspaces::Method::WorktreeServiceSet)
            }
            MethodId::YiruRuntimeV1WorktreeServicePersistSortOrder => {
                Self::Workspaces(workspaces::Method::WorktreeServicePersistSortOrder)
            }
            MethodId::YiruRuntimeV1WorktreeServiceDetectedList => {
                Self::Workspaces(workspaces::Method::WorktreeServiceDetectedList)
            }
            MethodId::YiruRuntimeV1WorktreeServiceLineageList => {
                Self::Workspaces(workspaces::Method::WorktreeServiceLineageList)
            }
            MethodId::YiruRuntimeV1WorktreeServiceBranchRenameFailureOutput => {
                Self::Workspaces(workspaces::Method::WorktreeServiceBranchRenameFailureOutput)
            }
            MethodId::YiruRuntimeV1WorktreeServiceSubscribeStateEvents => {
                Self::Workspaces(workspaces::Method::WorktreeServiceSubscribeStateEvents)
            }
            MethodId::YiruRuntimeV1WorkspaceEventsServiceAppendConsole => {
                Self::Workspaces(workspaces::Method::WorkspaceEventsServiceAppendConsole)
            }
            MethodId::YiruRuntimeV1WorkspaceEventsServiceAppendPerformance => {
                Self::Workspaces(workspaces::Method::WorkspaceEventsServiceAppendPerformance)
            }
            MethodId::YiruRuntimeV1WorkspaceEventsServiceList => {
                Self::Workspaces(workspaces::Method::WorkspaceEventsServiceList)
            }
            MethodId::YiruRuntimeV1WorkspaceEventsServiceWatch => {
                Self::Workspaces(workspaces::Method::WorkspaceEventsServiceWatch)
            }
            MethodId::YiruRuntimeV1WorkspaceEventsServiceGetProjectRevision => {
                Self::Workspaces(workspaces::Method::WorkspaceEventsServiceGetProjectRevision)
            }
            MethodId::YiruRuntimeV1WorktreeServiceArchive => {
                Self::Workspaces(workspaces::Method::WorktreeServiceArchive)
            }
            MethodId::YiruRuntimeV1WorktreeServiceList => {
                Self::Workspaces(workspaces::Method::WorktreeServiceList)
            }
            MethodId::YiruRuntimeV1WorktreeServiceCreate => {
                Self::Workspaces(workspaces::Method::WorktreeServiceCreate)
            }
            MethodId::YiruRuntimeV1WorktreeServiceListArchives => {
                Self::Workspaces(workspaces::Method::WorktreeServiceListArchives)
            }
            MethodId::YiruRuntimeV1WorktreeServiceRestore => {
                Self::Workspaces(workspaces::Method::WorktreeServiceRestore)
            }
            MethodId::YiruRuntimeV1WorkspaceCleanupServiceScan => {
                Self::Workspaces(workspaces::Method::WorkspaceCleanupServiceScan)
            }
            MethodId::YiruRuntimeV1WorkspaceCleanupServiceDismiss => {
                Self::Workspaces(workspaces::Method::WorkspaceCleanupServiceDismiss)
            }
            MethodId::YiruRuntimeV1WorkspaceCleanupServiceClearDismissals => {
                Self::Workspaces(workspaces::Method::WorkspaceCleanupServiceClearDismissals)
            }
            MethodId::YiruRuntimeV1WorkspaceCleanupServiceSubscribeEvents => {
                Self::Workspaces(workspaces::Method::WorkspaceCleanupServiceSubscribeEvents)
            }
            MethodId::YiruRuntimeV1ShellSessionServiceWatch => {
                Self::Workspaces(workspaces::Method::ShellSessionServiceWatch)
            }
            MethodId::YiruRuntimeV1ShellSessionServiceGet => {
                Self::Workspaces(workspaces::Method::ShellSessionServiceGet)
            }
            MethodId::YiruRuntimeV1ShellSessionServiceSet => {
                Self::Workspaces(workspaces::Method::ShellSessionServiceSet)
            }
            MethodId::YiruRuntimeV1ShellSessionServicePatch => {
                Self::Workspaces(workspaces::Method::ShellSessionServicePatch)
            }
            MethodId::YiruRuntimeV1ShellSessionServiceFlush => {
                Self::Workspaces(workspaces::Method::ShellSessionServiceFlush)
            }
            MethodId::YiruRuntimeV1RitualServiceGetSchedule => {
                Self::Workspaces(workspaces::Method::RitualServiceGetSchedule)
            }
            MethodId::YiruRuntimeV1RitualServiceSetSchedule => {
                Self::Workspaces(workspaces::Method::RitualServiceSetSchedule)
            }
            MethodId::YiruRuntimeV1RitualServiceRun => {
                Self::Workspaces(workspaces::Method::RitualServiceRun)
            }
            MethodId::YiruRuntimeV1WorkspacePortsServiceScan => {
                Self::Workspaces(workspaces::Method::WorkspacePortsServiceScan)
            }
            MethodId::YiruRuntimeV1WorkspacePortsServiceKill => {
                Self::Workspaces(workspaces::Method::WorkspacePortsServiceKill)
            }
            MethodId::YiruRuntimeV1WorkspacePortsServiceSubscribeEvents => {
                Self::Workspaces(workspaces::Method::WorkspacePortsServiceSubscribeEvents)
            }
            MethodId::YiruRuntimeV1WorkspaceSpaceServiceAnalyze => {
                Self::Workspaces(workspaces::Method::WorkspaceSpaceServiceAnalyze)
            }
            MethodId::YiruRuntimeV1WorkspaceSpaceServiceCancel => {
                Self::Workspaces(workspaces::Method::WorkspaceSpaceServiceCancel)
            }
            MethodId::YiruRuntimeV1ShellRuntimeServiceSyncWindowGraph => {
                Self::Workspaces(workspaces::Method::ShellRuntimeServiceSyncWindowGraph)
            }
        }
    }
}
