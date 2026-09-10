import { create, fromBinary, toBinary } from '@bufbuild/protobuf'

import {
  EmulatorService,
  EmulatorServiceAttachRequestSchema,
  EmulatorServiceAttachResponseSchema,
  EmulatorServiceAvailabilityRequestSchema,
  EmulatorServiceAvailabilityResponseSchema,
  EmulatorServiceKillRequestSchema,
  EmulatorServiceKillResponseSchema,
  EmulatorServiceListRequestSchema,
  EmulatorServiceListResponseSchema,
  EmulatorServiceListSimulatorsRequestSchema,
  EmulatorServiceListSimulatorsResponseSchema,
  EmulatorServiceShutdownRequestSchema,
  EmulatorServiceShutdownResponseSchema,
  EmulatorServiceStreamFramesRequestSchema,
  EmulatorServiceStreamFramesResponseSchema,
  EmulatorServiceUnregisterActiveRequestSchema,
  EmulatorServiceUnregisterActiveResponseSchema
} from '../generated/agent_start/runtime/v1/emulator_pb.js'
import { EmulatorInputClient, protocolTarget } from './emulator-input-client.js'
import {
  emulatorAttachResult,
  emulatorAvailability,
  emulatorDeviceInfo,
  emulatorJsonResult,
  emulatorStopResult
} from './emulator-values.js'
import type {
  EmulatorAttachResultValue,
  EmulatorAvailabilityValue,
  EmulatorDeviceValue,
  EmulatorJsonResultValue,
  EmulatorStopResultValue,
  EmulatorTargetInput
} from './emulator-values.js'
import type { RuntimeCallOptions, RuntimeStream, RuntimeTransport } from './transport.js'

const LIST_PROCEDURE = `/${EmulatorService.typeName}/${EmulatorService.method.list.name}`
const ATTACH_PROCEDURE = `/${EmulatorService.typeName}/${EmulatorService.method.attach.name}`
const KILL_PROCEDURE = `/${EmulatorService.typeName}/${EmulatorService.method.kill.name}`
const SHUTDOWN_PROCEDURE = `/${EmulatorService.typeName}/${EmulatorService.method.shutdown.name}`
const LIST_SIMULATORS_PROCEDURE = `/${EmulatorService.typeName}/${EmulatorService.method.listSimulators.name}`
const AVAILABILITY_PROCEDURE = `/${EmulatorService.typeName}/${EmulatorService.method.availability.name}`
const UNREGISTER_ACTIVE_PROCEDURE = `/${EmulatorService.typeName}/${EmulatorService.method.unregisterActive.name}`
const STREAM_FRAMES_PROCEDURE = `/${EmulatorService.typeName}/${EmulatorService.method.streamFrames.name}`

export type EmulatorStreamEvent =
  | { type: 'ready' }
  | { type: 'frame'; data: Uint8Array }
  | { type: 'error'; message: string }

export type EmulatorFrames = Readonly<{
  events: AsyncIterable<EmulatorStreamEvent>
  cancel: (reason?: string) => Promise<void>
}>

export class EmulatorClient extends EmulatorInputClient {
  constructor(transport: RuntimeTransport) {
    super(transport)
  }

  async list(options?: RuntimeCallOptions): Promise<EmulatorJsonResultValue> {
    const response = await this.transport.unary({
      method: LIST_PROCEDURE,
      payload: toBinary(EmulatorServiceListRequestSchema, create(EmulatorServiceListRequestSchema)),
      ...(options ? { options } : {})
    })
    return emulatorJsonResult(fromBinary(EmulatorServiceListResponseSchema, response))
  }

  async attach(
    target: EmulatorTargetInput,
    options?: RuntimeCallOptions
  ): Promise<EmulatorAttachResultValue> {
    const response = await this.transport.unary({
      method: ATTACH_PROCEDURE,
      payload: toBinary(
        EmulatorServiceAttachRequestSchema,
        create(EmulatorServiceAttachRequestSchema, { target: protocolTarget(target) })
      ),
      ...(options ? { options } : {})
    })
    return emulatorAttachResult(fromBinary(EmulatorServiceAttachResponseSchema, response))
  }

  async kill(
    input: EmulatorTargetInput & { managedOnly?: boolean },
    options?: RuntimeCallOptions
  ): Promise<EmulatorStopResultValue> {
    const response = await this.transport.unary({
      method: KILL_PROCEDURE,
      payload: toBinary(
        EmulatorServiceKillRequestSchema,
        create(EmulatorServiceKillRequestSchema, {
          target: protocolTarget(input),
          managedOnly: input.managedOnly === true
        })
      ),
      ...(options ? { options } : {})
    })
    return emulatorStopResult(fromBinary(EmulatorServiceKillResponseSchema, response))
  }

  async shutdown(
    input: EmulatorTargetInput & { managedOnly?: boolean },
    options?: RuntimeCallOptions
  ): Promise<EmulatorStopResultValue> {
    const response = await this.transport.unary({
      method: SHUTDOWN_PROCEDURE,
      payload: toBinary(
        EmulatorServiceShutdownRequestSchema,
        create(EmulatorServiceShutdownRequestSchema, {
          target: protocolTarget(input),
          managedOnly: input.managedOnly === true
        })
      ),
      ...(options ? { options } : {})
    })
    return emulatorStopResult(fromBinary(EmulatorServiceShutdownResponseSchema, response))
  }

  async listSimulators(options?: RuntimeCallOptions): Promise<EmulatorDeviceValue[]> {
    const response = await this.transport.unary({
      method: LIST_SIMULATORS_PROCEDURE,
      payload: toBinary(
        EmulatorServiceListSimulatorsRequestSchema,
        create(EmulatorServiceListSimulatorsRequestSchema)
      ),
      ...(options ? { options } : {})
    })
    return fromBinary(EmulatorServiceListSimulatorsResponseSchema, response).devices.map(
      emulatorDeviceInfo
    )
  }

  async availability(options?: RuntimeCallOptions): Promise<EmulatorAvailabilityValue> {
    const response = await this.transport.unary({
      method: AVAILABILITY_PROCEDURE,
      payload: toBinary(
        EmulatorServiceAvailabilityRequestSchema,
        create(EmulatorServiceAvailabilityRequestSchema)
      ),
      ...(options ? { options } : {})
    })
    return emulatorAvailability(fromBinary(EmulatorServiceAvailabilityResponseSchema, response))
  }

  async unregisterActive(
    input: EmulatorTargetInput,
    options?: RuntimeCallOptions
  ): Promise<boolean> {
    const response = await this.transport.unary({
      method: UNREGISTER_ACTIVE_PROCEDURE,
      payload: toBinary(
        EmulatorServiceUnregisterActiveRequestSchema,
        create(
          EmulatorServiceUnregisterActiveRequestSchema,
          input.worktree === undefined ? {} : { worktree: input.worktree }
        )
      ),
      ...(options ? { options } : {})
    })
    return fromBinary(EmulatorServiceUnregisterActiveResponseSchema, response).ok
  }

  async streamFrames(
    input: { streamUrl: string; streamKey?: string },
    options?: RuntimeCallOptions
  ): Promise<EmulatorFrames> {
    const stream = await this.transport.subscribe({
      method: STREAM_FRAMES_PROCEDURE,
      payload: toBinary(
        EmulatorServiceStreamFramesRequestSchema,
        create(EmulatorServiceStreamFramesRequestSchema, {
          streamUrl: input.streamUrl,
          ...(input.streamKey === undefined ? {} : { streamKey: input.streamKey })
        })
      ),
      ...(options ? { options } : {})
    })
    return { events: frameEvents(stream), cancel: stream.cancel }
  }
}

async function* frameEvents(stream: RuntimeStream): AsyncIterable<EmulatorStreamEvent> {
  for await (const payload of stream.events) {
    const message = fromBinary(EmulatorServiceStreamFramesResponseSchema, payload).event
    switch (message.case) {
      case 'ready':
        yield { type: 'ready' }
        break
      case 'frame':
        yield { type: 'frame', data: message.value.data }
        break
      case 'error':
        yield { type: 'error', message: message.value.message }
        break
      case undefined:
        break
    }
  }
}
