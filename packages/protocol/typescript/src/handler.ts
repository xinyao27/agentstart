import { fromBinary, getExtension, hasExtension, toBinary } from '@bufbuild/protobuf'
import type {
  DescMethodServerStreaming,
  DescMethodUnary,
  DescMessage,
  MessageShape
} from '@bufbuild/protobuf'

import {
  method_policy as methodPolicyExtension,
  method_transport_policy as methodTransportPolicyExtension,
  RuntimeRoutePolicy
} from '../generated/agent_start/protocol/v1/annotations_pb.js'
import { PeerKind } from '../generated/agent_start/protocol/v1/frame_pb.js'

export type RuntimeHandlerContext = Readonly<{
  signal: AbortSignal
  timeoutMs: number
}>

export type RuntimeUnaryHandler<Input extends DescMessage, Output extends DescMessage> = (
  request: MessageShape<Input>,
  context: RuntimeHandlerContext
) => MessageShape<Output> | Promise<MessageShape<Output>>

export type RuntimeServerStreamHandler<Input extends DescMessage, Output extends DescMessage> = (
  request: MessageShape<Input>,
  context: RuntimeHandlerContext
) => AsyncIterable<MessageShape<Output>>

type EncodedUnaryHandler = Readonly<{
  kind: 'unary'
  invoke: (request: Uint8Array, context: RuntimeHandlerContext) => Promise<Uint8Array>
}>

type EncodedStreamHandler = Readonly<{
  kind: 'stream'
  invoke: (request: Uint8Array, context: RuntimeHandlerContext) => AsyncIterable<Uint8Array>
}>

export type EncodedRuntimeHandler = EncodedStreamHandler | EncodedUnaryHandler

export class RuntimeHandlerRegistry {
  private readonly handlers = new Map<string, EncodedRuntimeHandler>()

  get(procedure: string): EncodedRuntimeHandler | undefined {
    return this.handlers.get(procedure)
  }

  registerUnary<Input extends DescMessage, Output extends DescMessage>(
    method: DescMethodUnary<Input, Output>,
    handler: RuntimeUnaryHandler<Input, Output>
  ): () => void {
    validateReverseMethod(method)
    const procedure = methodProcedure(method)
    return this.register(procedure, {
      kind: 'unary',
      invoke: async (request, context) =>
        toBinary(method.output, await handler(fromBinary(method.input, request), context))
    })
  }

  registerServerStream<Input extends DescMessage, Output extends DescMessage>(
    method: DescMethodServerStreaming<Input, Output>,
    handler: RuntimeServerStreamHandler<Input, Output>
  ): () => void {
    validateReverseMethod(method)
    const procedure = methodProcedure(method)
    return this.register(procedure, {
      kind: 'stream',
      invoke: (request, context) =>
        encodeStream(method.output, handler(fromBinary(method.input, request), context))
    })
  }

  private register(procedure: string, handler: EncodedRuntimeHandler): () => void {
    if (this.handlers.has(procedure)) {
      throw new Error(`Runtime handler is already registered for ${procedure}`)
    }
    this.handlers.set(procedure, handler)
    return () => {
      if (this.handlers.get(procedure) === handler) {
        this.handlers.delete(procedure)
      }
    }
  }
}

function methodProcedure(method: DescMethodUnary | DescMethodServerStreaming): string {
  return `/${method.parent.typeName}/${method.name}`
}

function validateReverseMethod(method: DescMethodUnary | DescMethodServerStreaming): void {
  const options = method.proto.options
  if (
    !options ||
    !hasExtension(options, methodPolicyExtension) ||
    !hasExtension(options, methodTransportPolicyExtension)
  ) {
    throw new Error('Reverse runtime handler has no method policy')
  }
  const policy = getExtension(options, methodPolicyExtension)
  const transport = getExtension(options, methodTransportPolicyExtension)
  if (
    transport.route !== RuntimeRoutePolicy.LOCAL_ONLY ||
    !policy.peerKinds.includes(PeerKind.CHROME_EXTENSION)
  ) {
    throw new Error('Reverse runtime handler is not allowed for a local Chrome peer')
  }
}

async function* encodeStream<Output extends DescMessage>(
  output: Output,
  responses: AsyncIterable<MessageShape<Output>>
): AsyncIterable<Uint8Array> {
  for await (const response of responses) {
    yield toBinary(output, response)
  }
}
