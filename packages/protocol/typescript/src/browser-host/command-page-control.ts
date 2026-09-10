import type { BrowserPageControlRegisterCommand } from '../../generated/agent_start/runtime/v1/browser_page_control_pb.js'
import type { ExecuteRequest } from '../../generated/agent_start/runtime/v1/browser_pb.js'
import { invocation, type BrowserCommandInvocation } from './command-invocation.js'

type PageControlCommand = Extract<
  ExecuteRequest['command'],
  {
    case:
      | 'grabCancel'
      | 'grabSetMode'
      | 'grabAwaitSelection'
      | 'grabCaptureSelection'
      | 'grabExtractHover'
      | 'pageControlOpenDevTools'
      | 'pageControlSetActive'
      | 'pageControlRegister'
      | 'pageControlUnregister'
      | 'pageControlSetViewportOverride'
      | 'pageControlSetAnnotationViewport'
  }
>

export function decodePageControlCommand(command: PageControlCommand): BrowserCommandInvocation {
  switch (command.case) {
    case 'grabCancel':
    case 'pageControlOpenDevTools':
    case 'pageControlSetActive':
    case 'grabExtractHover':
      return invocation(command.case, { browserPageId: command.value.browserPageId })
    case 'grabSetMode':
      return invocation(command.case, {
        browserPageId: command.value.browserPageId,
        enabled: command.value.enabled
      })
    case 'grabAwaitSelection':
      return invocation(command.case, {
        browserPageId: command.value.browserPageId,
        opId: command.value.opId
      })
    case 'grabCaptureSelection':
      return invocation(command.case, {
        browserPageId: command.value.browserPageId,
        rect: command.value.rect
      })
    case 'pageControlRegister':
      return invocation(command.case, {
        backendPageId: command.value.backendPageId,
        browserPageId: command.value.browserPageId,
        sessionProfileId: sessionProfileIdInput(command.value.sessionProfile),
        workspaceId: command.value.workspaceId,
        worktreeId: command.value.worktreeId
      })
    case 'pageControlUnregister':
      return invocation(command.case, {
        browserPageId: command.value.browserPageId,
        expectedBackendPageId: command.value.expectedBackendPageId
      })
    case 'pageControlSetViewportOverride':
      return invocation(command.case, {
        browserPageId: command.value.browserPageId,
        override: viewportOverrideInput(command.value.override)
      })
    case 'pageControlSetAnnotationViewport':
      return invocation(command.case, {
        browserPageId: command.value.browserPageId,
        emitViewport: command.value.emitViewport,
        enabled: command.value.enabled,
        markers: command.value.markers,
        token: command.value.token
      })
  }
}

function sessionProfileIdInput(
  sessionProfile: BrowserPageControlRegisterCommand['sessionProfile']
): string | null | undefined {
  if (sessionProfile.case === 'sessionProfileId') {
    return sessionProfile.value
  }
  return sessionProfile.case === 'clearSessionProfileId' ? null : undefined
}

function viewportOverrideInput(
  override: Extract<
    PageControlCommand,
    { case: 'pageControlSetViewportOverride' }
  >['value']['override']
): unknown {
  return override.case === 'set' ? override.value : null
}
