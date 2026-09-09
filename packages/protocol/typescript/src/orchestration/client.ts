import type { RuntimeTransport } from '../transport.js'
import { OrchestrationGateClient } from './gate-client.js'

// Why: identifies the Chrome-workbench-reachable half of OrchestrationService — worker-start/show/
// read/stop/abandon and every federation* rpc stay daemon-to-daemon (see their CALLER_CLASS_RUNTIME
// / PEER_KIND_DAEMON-only method_policy in orchestration.proto) and have no browser client here.
export const ORCHESTRATION_PROTOCOL_CAPABILITY = 'orchestration.protobuf.v1' as const

export class OrchestrationClient extends OrchestrationGateClient {
  constructor(transport: RuntimeTransport) {
    super(transport)
  }
}
