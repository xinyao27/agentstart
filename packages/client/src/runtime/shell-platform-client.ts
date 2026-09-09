import {
  SHELL_PLATFORM_PROTOCOL_CAPABILITY,
  ShellPlatformClient,
  type ShellPlatformOpenExternalEditorInput
} from '@yiru/protocol'
import type { ShellPlatformOutcomeValue } from '@yiru/protocol'
import { translate } from '~renderer/i18n/i18n'
import type { RenderingHostBootstrap as ShellRenderingHost } from '~renderer/rendering-host-bootstrap'
import { parseRenderingHostBootstrap } from '~renderer/rendering-host-bootstrap'

import {
  openConfiguredBrowserHostProtocol,
  readConfiguredBrowserHostStatus
} from './browser-host-runtime'

type ShellOpenExternalEditorRequest = Omit<ShellPlatformOpenExternalEditorInput, 'connectionId'> & {
  connectionId?: string | null
}

export type ShellPlatformApi = {
  openPath: (path: string) => Promise<void>
  openInFileManager: (path: string) => Promise<ShellPlatformOutcomeValue>
  openInExternalEditor: {
    (request: ShellOpenExternalEditorRequest): Promise<ShellPlatformOutcomeValue>
    (path: string, command?: string): Promise<ShellPlatformOutcomeValue>
  }
  openUrl: (url: string) => Promise<void>
  openFilePath: (path: string) => Promise<boolean>
  openFileUri: (uri: string) => Promise<void>
  pathExists: (path: string) => Promise<boolean>
  pickAttachment: () => Promise<string | null>
  pickImage: () => Promise<string | null>
  pickRepoIconImage: () => Promise<{ dataUrl: string; fileName: string } | null>
  pickAudio: () => Promise<string | null>
  pickDirectory: (args: { defaultPath?: string }) => Promise<string | null>
}

function resolveRenderingHost(): ShellRenderingHost {
  if (typeof location !== 'undefined') {
    const bootstrap = parseRenderingHostBootstrap(location.search)
    if (bootstrap) {
      return bootstrap
    }
  }
  const userAgent = navigator.userAgent.toLowerCase()
  return {
    platform: userAgent.includes('mac') ? 'darwin' : userAgent.includes('win') ? 'win32' : 'linux',
    osRelease: '',
    displayServer: null
  }
}

// Why: the shell platform namespace is protobuf-only, so a missing capability
// means the connected daemon predates the cutover — an error, not a legacy retry.
async function openShellPlatformTarget(): Promise<ShellPlatformClient> {
  const status = await readConfiguredBrowserHostStatus()
  if (!status.capabilities?.includes(SHELL_PLATFORM_PROTOCOL_CAPABILITY)) {
    throw new Error(
      translate(
        'runtime.shellPlatformTarget.unavailable',
        'This action needs a current Yiru daemon connection.'
      )
    )
  }
  return new ShellPlatformClient(await openConfiguredBrowserHostProtocol())
}

const renderingHostSnapshot = resolveRenderingHost()

export function getRenderingHostSnapshot(): ShellRenderingHost {
  return renderingHostSnapshot
}

function openInExternalEditor(
  request: ShellOpenExternalEditorRequest
): Promise<ShellPlatformOutcomeValue>
function openInExternalEditor(path: string, command?: string): Promise<ShellPlatformOutcomeValue>
async function openInExternalEditor(
  request: ShellOpenExternalEditorRequest | string,
  command?: string
): Promise<ShellPlatformOutcomeValue> {
  const input: ShellPlatformOpenExternalEditorInput =
    typeof request === 'string'
      ? {
          path: request,
          ...(command === undefined ? {} : { command })
        }
      : {
          path: request.path,
          ...(request.command === undefined ? {} : { command: request.command }),
          ...(request.connectionId == null ? {} : { connectionId: request.connectionId })
        }
  return (await openShellPlatformTarget()).openInExternalEditor(input)
}

export const daemonShellPlatformApi: Omit<ShellPlatformApi, 'openUrl' | 'pickRepoIconImage'> = {
  openPath: async (path) => {
    await (await openShellPlatformTarget()).openPath(path)
  },
  openInFileManager: async (path) => (await openShellPlatformTarget()).openInFileManager(path),
  openInExternalEditor,
  openFilePath: async (path) => (await openShellPlatformTarget()).openFilePath(path),
  openFileUri: async (uri) => {
    await (await openShellPlatformTarget()).openFileUri(uri)
  },
  pathExists: async (path) => (await openShellPlatformTarget()).pathExists(path),
  pickAttachment: async () => (await openShellPlatformTarget()).pickAttachment(),
  pickImage: async () => (await openShellPlatformTarget()).pickImage(),
  pickAudio: async () => (await openShellPlatformTarget()).pickAudio(),
  pickDirectory: async (input) => (await openShellPlatformTarget()).pickDirectory(input)
}
