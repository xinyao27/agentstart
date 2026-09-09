import { StatusCode } from '../../generated/yiru/protocol/v1/errors_pb.js'
import {
  TerminalArtifactProvider as ProtocolTerminalArtifactProvider,
  type TerminalOpenTarget as ProtocolTerminalOpenTarget,
  type TerminalPathResolution as ProtocolTerminalPathResolution
} from '../../generated/yiru/runtime/v1/files_pb.js'
import { RuntimeProtocolError } from '../error.js'

export type TerminalPathOpenTarget =
  | Readonly<{
      kind: 'worktree-file'
      provider: 'local' | 'ssh'
      relativePath: string
      absolutePath: string
    }>
  | Readonly<{
      kind: 'absolute-file'
      provider: 'local' | 'ssh'
      absolutePath: string
      grantId: string
    }>

export type TerminalPathResolution = Readonly<{
  worktree: string
  relativePath: string | null
  absolutePath: string | null
  exists: boolean
  isDirectory: boolean
  openTarget?: TerminalPathOpenTarget
}>

export function terminalPathResolution(
  resolution: ProtocolTerminalPathResolution | undefined
): TerminalPathResolution {
  if (!resolution) {
    throw invalidResponse('Terminal path resolution is missing')
  }
  return {
    worktree: resolution.worktree,
    relativePath: resolution.relativePath ?? null,
    absolutePath: resolution.absolutePath ?? null,
    exists: resolution.exists,
    isDirectory: resolution.isDirectory,
    ...(resolution.openTarget === undefined
      ? {}
      : { openTarget: terminalPathOpenTarget(resolution.openTarget) })
  }
}

function terminalPathOpenTarget(target: ProtocolTerminalOpenTarget): TerminalPathOpenTarget {
  switch (target.target.case) {
    case 'worktreeFile':
      return {
        kind: 'worktree-file',
        provider: terminalProvider(target.target.value.provider),
        relativePath: target.target.value.relativePath,
        absolutePath: target.target.value.absolutePath
      }
    case 'absoluteFile':
      return {
        kind: 'absolute-file',
        provider: terminalProvider(target.target.value.provider),
        absolutePath: target.target.value.absolutePath,
        grantId: target.target.value.grantId
      }
    case undefined:
      throw invalidResponse('Terminal path open target is empty')
  }
}

function terminalProvider(provider: ProtocolTerminalArtifactProvider): 'local' | 'ssh' {
  switch (provider) {
    case ProtocolTerminalArtifactProvider.LOCAL:
      return 'local'
    case ProtocolTerminalArtifactProvider.SSH:
      return 'ssh'
    case ProtocolTerminalArtifactProvider.UNSPECIFIED:
      throw invalidResponse('Terminal artifact provider is unspecified')
  }
  throw invalidResponse('Terminal artifact provider is unknown')
}

function invalidResponse(message: string): RuntimeProtocolError {
  return new RuntimeProtocolError(StatusCode.DATA_LOSS, message)
}
