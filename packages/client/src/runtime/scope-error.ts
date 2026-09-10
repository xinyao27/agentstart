import { RuntimeProtocolError, StatusCode } from '@agentstart/protocol'

export function isRuntimeScopeForbiddenError(error: unknown): boolean {
  return error instanceof RuntimeProtocolError && error.code === StatusCode.PERMISSION_DENIED
}
