import { create, fromBinary, toBinary, type MessageInitShape } from '@bufbuild/protobuf'

import {
  ShellHostAcceptedSchema,
  ShellHostRegisterRequestSchema,
  ShellHostResponseSchema,
  ShellHostService
} from '../../generated/agent_start/runtime/v1/shell_host_pb.js'
import type { RuntimeTransport } from '../transport.js'

export * from '../../generated/agent_start/runtime/v1/shell_host_pb.js'
export { scheduleFromProto as decodeShellHostResume } from '../rate-limit-resume-client.js'

export function createShellHostResponse(input: MessageInitShape<typeof ShellHostResponseSchema>) {
  return create(ShellHostResponseSchema, input)
}

export async function registerShellHost(transport: RuntimeTransport): Promise<boolean> {
  const response = await transport.unary({
    method: `/${ShellHostService.typeName}/${ShellHostService.method.register.name}`,
    payload: toBinary(ShellHostRegisterRequestSchema, create(ShellHostRegisterRequestSchema))
  })
  return fromBinary(ShellHostAcceptedSchema, response).accepted
}
