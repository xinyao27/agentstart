import { StatusCode } from '../generated/yiru/protocol/v1/errors_pb.js'
import type { MutationResult } from '../generated/yiru/runtime/v1/files_pb.js'
import { RuntimeProtocolError } from './error.js'

// Why: MutationResult.ok is the only success signal these RPCs return; a void-returning
// client method must surface it instead of discarding it, or a rejected mutation looks like
// it succeeded.
export function assertMutationOk(result: MutationResult | undefined, action: string): void {
  if (!result?.ok) {
    throw new RuntimeProtocolError(StatusCode.UNKNOWN, `${action} did not report success`)
  }
}
