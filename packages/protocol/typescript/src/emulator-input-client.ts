import { create, fromBinary, toBinary } from '@bufbuild/protobuf'

import {
  EmulatorService,
  EmulatorServiceButtonRequestSchema,
  EmulatorServiceExecRequestSchema,
  EmulatorServiceExecResponseSchema,
  EmulatorServiceGestureRequestSchema,
  EmulatorServiceOkResponseSchema,
  EmulatorServiceRotateRequestSchema,
  EmulatorServiceTapRequestSchema,
  EmulatorServiceTypeTextRequestSchema,
  EmulatorTargetSchema
} from '../generated/yiru/runtime/v1/emulator_pb.js'
import { emulatorExecResult, gesturePointKind, orientation } from './emulator-values.js'
import type {
  EmulatorGesturePointInput,
  EmulatorJsonResultValue,
  EmulatorOrientationInput,
  EmulatorTargetInput
} from './emulator-values.js'
import type { RuntimeCallOptions, RuntimeTransport } from './transport.js'

const TAP_PROCEDURE = `/${EmulatorService.typeName}/${EmulatorService.method.tap.name}`
const GESTURE_PROCEDURE = `/${EmulatorService.typeName}/${EmulatorService.method.gesture.name}`
const TYPE_TEXT_PROCEDURE = `/${EmulatorService.typeName}/${EmulatorService.method.typeText.name}`
const BUTTON_PROCEDURE = `/${EmulatorService.typeName}/${EmulatorService.method.button.name}`
const ROTATE_PROCEDURE = `/${EmulatorService.typeName}/${EmulatorService.method.rotate.name}`
const EXEC_PROCEDURE = `/${EmulatorService.typeName}/${EmulatorService.method.exec.name}`

export class EmulatorInputClient {
  protected readonly transport: RuntimeTransport

  constructor(transport: RuntimeTransport) {
    this.transport = transport
  }

  async tap(
    input: EmulatorTargetInput & { x: number; y: number },
    options?: RuntimeCallOptions
  ): Promise<boolean> {
    const response = await this.transport.unary({
      method: TAP_PROCEDURE,
      payload: toBinary(
        EmulatorServiceTapRequestSchema,
        create(EmulatorServiceTapRequestSchema, {
          target: protocolTarget(input),
          x: input.x,
          y: input.y
        })
      ),
      ...(options ? { options } : {})
    })
    return fromBinary(EmulatorServiceOkResponseSchema, response).ok
  }

  async gesture(
    input: EmulatorTargetInput & { points: EmulatorGesturePointInput[] },
    options?: RuntimeCallOptions
  ): Promise<boolean> {
    const response = await this.transport.unary({
      method: GESTURE_PROCEDURE,
      payload: toBinary(
        EmulatorServiceGestureRequestSchema,
        create(EmulatorServiceGestureRequestSchema, {
          target: protocolTarget(input),
          points: input.points.map((point) => ({
            x: point.x,
            y: point.y,
            kind: gesturePointKind(point.type),
            ...(point.edge === undefined ? {} : { edge: point.edge })
          }))
        })
      ),
      ...(options ? { options } : {})
    })
    return fromBinary(EmulatorServiceOkResponseSchema, response).ok
  }

  async typeText(
    input: EmulatorTargetInput & { text: string },
    options?: RuntimeCallOptions
  ): Promise<boolean> {
    const response = await this.transport.unary({
      method: TYPE_TEXT_PROCEDURE,
      payload: toBinary(
        EmulatorServiceTypeTextRequestSchema,
        create(EmulatorServiceTypeTextRequestSchema, {
          target: protocolTarget(input),
          text: input.text
        })
      ),
      ...(options ? { options } : {})
    })
    return fromBinary(EmulatorServiceOkResponseSchema, response).ok
  }

  async button(
    input: EmulatorTargetInput & { name: string },
    options?: RuntimeCallOptions
  ): Promise<boolean> {
    const response = await this.transport.unary({
      method: BUTTON_PROCEDURE,
      payload: toBinary(
        EmulatorServiceButtonRequestSchema,
        create(EmulatorServiceButtonRequestSchema, {
          target: protocolTarget(input),
          name: input.name
        })
      ),
      ...(options ? { options } : {})
    })
    return fromBinary(EmulatorServiceOkResponseSchema, response).ok
  }

  async rotate(
    input: EmulatorTargetInput & { orientation: EmulatorOrientationInput },
    options?: RuntimeCallOptions
  ): Promise<boolean> {
    const response = await this.transport.unary({
      method: ROTATE_PROCEDURE,
      payload: toBinary(
        EmulatorServiceRotateRequestSchema,
        create(EmulatorServiceRotateRequestSchema, {
          target: protocolTarget(input),
          orientation: orientation(input.orientation)
        })
      ),
      ...(options ? { options } : {})
    })
    return fromBinary(EmulatorServiceOkResponseSchema, response).ok
  }

  async exec(
    input: EmulatorTargetInput & { command: string },
    options?: RuntimeCallOptions
  ): Promise<EmulatorJsonResultValue> {
    const response = await this.transport.unary({
      method: EXEC_PROCEDURE,
      payload: toBinary(
        EmulatorServiceExecRequestSchema,
        create(EmulatorServiceExecRequestSchema, {
          target: protocolTarget(input),
          command: input.command
        })
      ),
      ...(options ? { options } : {})
    })
    return emulatorExecResult(fromBinary(EmulatorServiceExecResponseSchema, response))
  }
}

export function protocolTarget(target: EmulatorTargetInput) {
  return create(EmulatorTargetSchema, {
    ...(target.worktree === undefined ? {} : { worktree: target.worktree }),
    ...(target.device === undefined ? {} : { device: target.device })
  })
}
