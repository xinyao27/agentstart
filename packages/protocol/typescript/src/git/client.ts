import { GitGenerationParamsSchema } from '../../generated/agent_start/runtime/v1/git_generation_pb.js'
import type { RuntimeTransport } from '../transport.js'
import { GitGenerationClient } from './generation-client.js'

export const GIT_PROTOCOL_CAPABILITY = 'git.protobuf.v1' as const

export class GitClient extends GitGenerationClient {
  constructor(transport: RuntimeTransport) {
    super(transport)
  }
}

// Re-exported so a resolved GitGenerationParams can be embedded by a caller
// that already knows the exact shape without importing the generated schema.
export { GitGenerationParamsSchema }
