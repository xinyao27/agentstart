import type { StatusCode } from '../generated/yiru/protocol/v1/errors_pb.js'

export class RuntimeProtocolError extends Error {
  readonly code: StatusCode

  constructor(code: StatusCode, message: string) {
    super(message || `Runtime protocol call failed with status ${code}`)
    this.name = 'RuntimeProtocolError'
    this.code = code
  }
}
