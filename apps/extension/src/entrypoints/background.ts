import { defineBackground } from 'wxt/utils/define-background'

import { clearAgentOverlay } from '../background/agent-overlay'
import {
  handleAgentPresenceMessage,
  handleOperationProgressMessage,
  registerAgentPresenceListeners
} from '../background/agent-presence'
import { registerBrowserEnvironmentListeners } from '../background/browser-use/environment'
import { registerBrowserGrabListeners } from '../background/browser-use/grab'
import { handleBrowserUseMessage } from '../background/browser-use/messages'
import { registerBrowserObservabilityListeners } from '../background/browser-use/observability'
import { registerBrowserPageControlListeners } from '../background/browser-use/page-control'
import { registerBrowserUseTargetListeners } from '../background/browser-use/target'
import { handleConsoleSensorMessage } from '../background/cdp/console-messages'
import { registerConsoleSensorListeners } from '../background/cdp/console-sensor'
import { handleRecordingMessage } from '../background/cdp/messages'
import { handleNetworkMockMessage } from '../background/cdp/network-messages'
import { registerNetworkMockListeners, stopNetworkMock } from '../background/cdp/network-mock'
import { handlePerformanceAuditMessage } from '../background/cdp/performance-messages'
import { isRecording, registerRecordingListeners, stopRecording } from '../background/cdp/recording'
import { registerCdpSessionListeners } from '../background/cdp/session'
import {
  configureChromeEntrypoints,
  injectForgeAction,
  registerChromeEntrypointListeners
} from '../background/chrome-entrypoints'
import { handleGitHubCommentMessage } from '../background/github-comment'
import {
  provisionFirstInstallLauncher,
  registerLauncherListeners,
  restorePinnedLauncher
} from '../background/launcher'
import { requestNativeBootstrap, requestNativeDirectory } from '../background/native-bootstrap'
import { handleNavigationMessage } from '../background/navigation-messages'
import {
  handleClaimedConsoleMessage,
  handleWorkspacePortClaimsMessage,
  registerPreviewClaimListeners,
  restoreWorkspacePortClaims
} from '../background/preview-claim'
import {
  handleProjectCatalogMessage,
  restoreProjectGroupMappings
} from '../background/project-groups'
import { handleRitualNavigationMessage } from '../background/ritual-navigation'
import { handleTabCommandMessage } from '../background/tab-command'
import { handleVisualCaptureMessage } from '../background/visual-capture'
import { handleWindowLayoutMessage } from '../background/window-layout'
import { restoreCommunityAdapters } from '../browser/community-adapters'
import { readCustomRuntimeBootstrap } from '../connection-settings'
import { handlePdfExportMessage } from '../pdf-export/background'

export default defineBackground({
  main() {
    registerCdpSessionListeners()
    registerConsoleSensorListeners()
    registerNetworkMockListeners()
    registerRecordingListeners()
    registerChromeEntrypointListeners()
    registerLauncherListeners()
    registerAgentPresenceListeners()
    registerBrowserEnvironmentListeners()
    registerBrowserGrabListeners()
    registerBrowserPageControlListeners()
    registerBrowserObservabilityListeners()
    registerBrowserUseTargetListeners()
    registerPreviewClaimListeners()
    chrome.permissions.onAdded.addListener(() => {
      registerCdpSessionListeners()
      registerAgentPresenceListeners()
      registerPreviewClaimListeners()
    })

    chrome.runtime.onInstalled.addListener((details) => {
      void configureChromeEntrypoints()
      void restoreCommunityAdapters()
      if (details.reason === 'install') {
        void provisionFirstInstallLauncher()
      }
    })
    chrome.runtime.onStartup.addListener(() => {
      void configureChromeEntrypoints()
      void restoreCommunityAdapters()
      void restorePinnedLauncher()
      void restoreProjectGroupMappings()
    })
    chrome.runtime.onMessage.addListener((message: unknown, sender, respond) => {
      if (typeof message !== 'object' || message === null) {
        return false
      }
      if (Reflect.get(message, 'type') === 'agent-overlay-takeover') {
        const tabId = sender.tab?.id
        if (tabId !== undefined) {
          void Promise.all([
            stopNetworkMock(tabId),
            isRecording(tabId) ? stopRecording(tabId) : Promise.resolve(null),
            clearAgentOverlay(tabId)
          ])
        }
        return false
      }
      const presenceResult = handleAgentPresenceMessage(message, sender)
      if (presenceResult !== null) {
        return presenceResult
      }
      const browserUseResult = handleBrowserUseMessage(message, respond)
      if (browserUseResult !== null) {
        return browserUseResult
      }
      const progressResult = handleOperationProgressMessage(message)
      if (progressResult !== null) {
        respond({ ok: progressResult })
        return false
      }
      const projectCatalogResult = handleProjectCatalogMessage(message, respond)
      if (projectCatalogResult !== null) {
        return projectCatalogResult
      }
      const claimResult = handleWorkspacePortClaimsMessage(message, respond)
      if (claimResult !== null) {
        return claimResult
      }
      const claimedConsoleResult = handleClaimedConsoleMessage(message, respond)
      if (claimedConsoleResult !== null) {
        return claimedConsoleResult
      }
      if (Reflect.get(message, 'type') === 'context-awareness-enabled') {
        void chrome.tabs
          .query({ active: true, lastFocusedWindow: true })
          .then((tabs) => (tabs[0] ? injectForgeAction(tabs[0]) : undefined))
        return false
      }
      if (Reflect.get(message, 'type') === 'forge-action-open') {
        void chrome.tabs
          .query({ active: true, lastFocusedWindow: true })
          .then((tabs) =>
            tabs[0]?.id === undefined
              ? undefined
              : chrome.sidePanel.open({ tabId: tabs[0].id }).catch(() => undefined)
          )
        return false
      }
      if (Reflect.get(message, 'type') === 'pick-project-directory') {
        void requestNativeDirectory().then(
          (path) => respond({ ok: true, path }),
          (error: unknown) =>
            respond({ ok: false, error: error instanceof Error ? error.message : String(error) })
        )
        return true
      }
      const recordingResult = handleRecordingMessage(message, respond)
      if (recordingResult !== null) {
        return recordingResult
      }
      const consoleSensorResult = handleConsoleSensorMessage(message, respond)
      if (consoleSensorResult !== null) {
        return consoleSensorResult
      }
      const networkMockResult = handleNetworkMockMessage(message, respond)
      if (networkMockResult !== null) {
        return networkMockResult
      }
      const performanceResult = handlePerformanceAuditMessage(message, respond)
      if (performanceResult !== null) {
        return performanceResult
      }
      const githubCommentResult = handleGitHubCommentMessage(message, respond)
      if (githubCommentResult !== null) {
        return githubCommentResult
      }
      const visualCaptureResult = handleVisualCaptureMessage(message, respond)
      if (visualCaptureResult !== null) {
        return visualCaptureResult
      }
      const pdfExportResult = handlePdfExportMessage(message, respond)
      if (pdfExportResult !== null) {
        return pdfExportResult
      }
      const windowLayoutResult = handleWindowLayoutMessage(message, respond)
      if (windowLayoutResult !== null) {
        return windowLayoutResult
      }
      const ritualNavigationResult = handleRitualNavigationMessage(message, respond)
      if (ritualNavigationResult !== null) {
        return ritualNavigationResult
      }
      const tabCommandResult = handleTabCommandMessage(message, respond)
      if (tabCommandResult !== null) {
        return tabCommandResult
      }
      const navigationResult = handleNavigationMessage(message, respond)
      if (navigationResult !== null) {
        return navigationResult
      }
      if (Reflect.get(message, 'type') === 'agent-attention') {
        const count = Reflect.get(message, 'count')
        if (typeof count !== 'number' || !Number.isInteger(count) || count < 0) {
          return false
        }
        void chrome.action.setBadgeBackgroundColor({ color: '#d97706' })
        void chrome.action.setBadgeText({ text: count > 0 ? String(Math.min(count, 99)) : '' })
        return false
      }
      if (Reflect.get(message, 'type') !== 'bootstrap') {
        return false
      }
      void readCustomRuntimeBootstrap()
        .then((custom) => custom ?? requestNativeBootstrap())
        .then(
          (result) => respond({ ok: true, result }),
          (error: unknown) =>
            respond({
              ok: false,
              error: error instanceof Error ? error.message : String(error)
            })
        )
      return true
    })
    void configureChromeEntrypoints()
    void restoreCommunityAdapters()
    void restoreProjectGroupMappings()
    void restoreWorkspacePortClaims()
  },
  type: 'module'
})
