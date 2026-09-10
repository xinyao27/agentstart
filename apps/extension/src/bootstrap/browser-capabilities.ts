import type { ExtensionBrowserCapabilities } from '@agentstart/client/extension-bootstrap'

import type { ExtensionBootstrapResult } from '../bootstrap-response'
import {
  openAgentMonitor,
  prepareLongRunningAgent,
  publishAgentPresence
} from '../browser/agent-interaction'
import { downloadArtifact } from '../browser/artifact-download'
import { executeDaemonBrowserCommand } from '../browser/browser-command'
import {
  readCommunityAdapters,
  removeCommunityAdapter,
  saveCommunityAdapter
} from '../browser/community-adapters'
import {
  disableContextAwareness,
  enableContextAwareness,
  isContextAwarenessEnabled
} from '../browser/context-awareness'
import { pickPageElement } from '../browser/element-picker'
import {
  parseClaimedConsoleCaptures,
  parseConsoleEntries,
  parsePerformanceCapture,
  parseRecordingCapture,
  readBooleanResponse,
  readStringResponse,
  requireSuccessfulResponse,
  sendActiveTabMessage
} from '../browser/messages'
import { readOnDeviceAiStatus, setOnDeviceAiEnabled, summarizeText } from '../browser/on-device-ai'
import {
  captureActivePageContext,
  clearPendingPageContext,
  consumePendingPageContext,
  readRecentHistoryContext
} from '../browser/page-context'
import { createDangerousCredential, requestDangerousAssertion } from '../browser/passkey'
import {
  hasPersistentPageCaptureAccess,
  requestBrowserPermissions,
  requestPageCapturePermission
} from '../browser/permission'
import { readProjectBookmarks, saveProjectBookmarks } from '../browser/project-bookmarks'
import { publishProjectCatalog, publishWorkspacePortClaims } from '../browser/project-groups'
import { subscribeBrowserTabProjections } from '../browser/tab-projection'
import { startTabVideoRecording, stopTabVideoRecording } from '../browser/tab-recording'
import {
  dismissWorkbenchNotifications,
  displayWorkbenchNotification,
  getWorkbenchNotificationPermissionStatus,
  openWorkbenchNotificationSettings,
  probeWorkbenchNotificationDelivery
} from '../browser/workbench-notifications'
import { readWorkspacePreferences, setWorkspacePreferences } from '../browser/workspace-preferences'
import { readEnterprisePolicy } from '../enterprise-policy'
import { exportHtmlToPdf } from '../pdf-export/client'

export function createBrowserCapabilities(
  bootstrap: ExtensionBootstrapResult
): ExtensionBrowserCapabilities {
  return {
    applyScheduledRitual: async (input) => {
      await requireSuccessfulResponse(
        await chrome.runtime.sendMessage({ ...input, type: 'scheduled-ritual' })
      )
    },
    arrangeStartDay: async (projectIds) => {
      await requireSuccessfulResponse(
        await chrome.runtime.sendMessage({ projectIds, type: 'ritual-start-layout' })
      )
    },
    arrangeWorkspaceWindows: async (projectIds, mode) => {
      if (mode === 'displays') {
        const granted = await requestBrowserPermissions({ permissions: ['system.display'] })
        if (!granted) {
          throw new Error('display_permission_denied')
        }
      }
      await requireSuccessfulResponse(
        await chrome.runtime.sendMessage({ mode, projectIds, type: 'arrange-workspace-windows' })
      )
    },
    captureActivePageContext,
    captureVisiblePage: async () =>
      readStringResponse(await sendActiveTabMessage('visual-capture'), 'imageDataUrl'),
    clearPendingPageContext,
    consumePendingAgentApproval,
    consumePendingPageContext,
    createDangerousCredential,
    dismissWorkbenchNotifications,
    displayWorkbenchNotification,
    disableContextAwareness,
    downloadArtifact: async (input) => downloadArtifact(bootstrap, input),
    drainClaimedConsoleSensors: async () =>
      parseClaimedConsoleCaptures(
        await chrome.runtime.sendMessage({ type: 'claimed-console-drain' })
      ),
    drainConsoleSensor: async () =>
      parseConsoleEntries(await sendActiveTabMessage('console-sensor-drain')),
    enableContextAwareness,
    executeBrowserCommand: executeDaemonBrowserCommand,
    exportHtmlToPdf,
    fillGitHubComment: async (draft) => {
      await requireSuccessfulResponse(await sendActiveTabMessage('github-comment-fill', { draft }))
    },
    finishDay: async () => {
      await requireSuccessfulResponse(
        await chrome.runtime.sendMessage({ type: 'ritual-end-layout' })
      )
    },
    getNotificationPermissionStatus: getWorkbenchNotificationPermissionStatus,
    hasBrowserControlAccess: async () => chrome.permissions.contains({ permissions: ['debugger'] }),
    hasPersistentPageCaptureAccess,
    highlightVisualChanges: async (regions) => {
      await requireSuccessfulResponse(await sendActiveTabMessage('visual-highlight', { regions }))
    },
    isConsoleSensorActive: async () =>
      readBooleanResponse(await sendActiveTabMessage('console-sensor-status'), 'isActive'),
    isContextAwarenessEnabled,
    isNetworkMockActive: async () =>
      readBooleanResponse(await sendActiveTabMessage('network-mock-status'), 'isActive'),
    isRecording: async () =>
      readBooleanResponse(await sendActiveTabMessage('recording-status'), 'isRecording'),
    openAgentMonitor,
    openDaemonTabCommand: async (input) => {
      await requireSuccessfulResponse(
        await chrome.runtime.sendMessage({ ...input, type: 'daemon-open-tab' })
      )
    },
    openNotificationSettings: openWorkbenchNotificationSettings,
    openFocusWorkspace: async (projectId) => {
      await requireSuccessfulResponse(
        await chrome.runtime.sendMessage({ projectId, type: 'focus-workspace-window' })
      )
    },
    openUserScriptsSettings: async () => {
      await chrome.tabs.create({ url: `chrome://extensions/?id=${chrome.runtime.id}` })
    },
    pickColor,
    pickPageElement,
    pickProjectDirectory,
    prepareLongRunningAgent,
    probeNotificationDelivery: probeWorkbenchNotificationDelivery,
    publishAgentPresence,
    publishOperationProgress: async (input) => {
      await requireSuccessfulResponse(
        await chrome.runtime.sendMessage({ ...input, type: 'operation-progress' })
      )
    },
    publishProjectCatalog,
    publishWorkspacePortClaims,
    readGitHubContext: async () =>
      readStringResponse(await sendActiveTabMessage('github-comment-context'), 'pageContext'),
    readOnDeviceAiStatus,
    readWorkspacePreferences,
    readCommunityAdapters: async () => ({
      adapters: await readCommunityAdapters(),
      disabled: (await readEnterprisePolicy()).disableCommunityAdapters
    }),
    readProjectBookmarks,
    readRecentHistoryContext,
    readTrustedSites,
    replay: async (events) => {
      await requireSuccessfulResponse(await sendActiveTabMessage('recording-replay', { events }))
    },
    requestDangerousAssertion,
    requestGitHubPage: async () =>
      requestBrowserPermissions({
        origins: ['https://github.com/*'],
        permissions: ['activeTab', 'scripting']
      }),
    requestPageCapture: requestPageCapturePermission,
    runPerformanceAudit: async () =>
      parsePerformanceCapture(await sendActiveTabMessage('performance-audit')),
    saveProjectBookmarks,
    saveCommunityAdapter,
    setOnDeviceAiEnabled,
    setWorkspacePreferences: saveWorkspacePreferences,
    removeCommunityAdapter,
    revokeTrustedSite: async (origin) => {
      await chrome.permissions.remove({ origins: [origin] })
    },
    startConsoleSensor: async () => {
      await requireSuccessfulResponse(await sendActiveTabMessage('console-sensor-start'))
    },
    startNetworkMock: async (rule) => {
      await requireSuccessfulResponse(await sendActiveTabMessage('network-mock-start', rule))
    },
    startRecording,
    stopConsoleSensor: async () => {
      await requireSuccessfulResponse(await sendActiveTabMessage('console-sensor-stop'))
    },
    stopNetworkMock: async () => {
      await requireSuccessfulResponse(await sendActiveTabMessage('network-mock-stop'))
    },
    stopRecording,
    subscribeBrowserTabProjections,
    summarizeText
  }
}

async function saveWorkspacePreferences(
  preferences: Awaited<ReturnType<typeof readWorkspacePreferences>>
): Promise<void> {
  if (
    preferences.useNewTabLauncher &&
    !(await chrome.permissions.contains({ permissions: ['tabs'] }))
  ) {
    const granted = await requestBrowserPermissions({ permissions: ['tabs'] })
    if (!granted) {
      throw new Error('new_tab_launcher_permission_denied')
    }
  }
  await setWorkspacePreferences(preferences)
}

async function readTrustedSites(): Promise<string[]> {
  const permissions = await chrome.permissions.getAll()
  return (permissions.origins ?? [])
    .filter((origin) => origin.startsWith('http://') || origin.startsWith('https://'))
    .toSorted()
}

async function consumePendingAgentApproval(): Promise<string | null> {
  const stored: unknown = await chrome.storage.session.get('pendingAgentApproval')
  const terminal =
    typeof stored === 'object' && stored !== null
      ? Reflect.get(stored, 'pendingAgentApproval')
      : null
  if (typeof terminal !== 'string') {
    return null
  }
  await chrome.storage.session.remove('pendingAgentApproval')
  return terminal
}

async function pickProjectDirectory(): Promise<string | null> {
  const response: unknown = await chrome.runtime.sendMessage({ type: 'pick-project-directory' })
  requireSuccessfulResponse(response)
  if (typeof response !== 'object' || response === null) {
    return null
  }
  const projectPath = Reflect.get(response, 'path')
  return typeof projectPath === 'string' ? projectPath : null
}

async function pickColor(): Promise<string> {
  const EyeDropperConstructor = Reflect.get(globalThis, 'EyeDropper')
  if (typeof EyeDropperConstructor !== 'function') {
    throw new Error('eye_dropper_unavailable')
  }
  const picker: unknown = Reflect.construct(EyeDropperConstructor, [])
  const open =
    typeof picker === 'object' && picker !== null ? Reflect.get(picker, 'open') : undefined
  if (typeof open !== 'function') {
    throw new Error('eye_dropper_unavailable')
  }
  const result: unknown = await Reflect.apply(open, picker, [])
  const color =
    typeof result === 'object' && result !== null ? Reflect.get(result, 'sRGBHex') : null
  if (typeof color !== 'string' || !/^#[0-9a-fA-F]{6}$/.test(color)) {
    throw new Error('eye_dropper_result_invalid')
  }
  return color
}

async function startRecording(): Promise<void> {
  if (await requestBrowserPermissions({ permissions: ['tabCapture'] })) {
    // Why: Chrome can revoke action-scoped tab capture after an MV3 reload. The CDP interaction
    // timeline is still complete and replayable without the optional video.
    await startTabVideoRecording().catch(() => {})
  }
  try {
    await requireSuccessfulResponse(await sendActiveTabMessage('recording-start'))
  } catch (error) {
    await stopTabVideoRecording()
    throw error
  }
}

async function stopRecording(): Promise<ReturnType<typeof parseRecordingCapture>> {
  const [capture, video] = await Promise.all([
    Promise.resolve(parseRecordingCapture(await sendActiveTabMessage('recording-stop'))),
    stopTabVideoRecording()
  ])
  return capture ? { ...capture, video } : null
}
