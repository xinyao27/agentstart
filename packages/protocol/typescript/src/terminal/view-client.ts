import { create, fromBinary, toBinary } from '@bufbuild/protobuf'

import { StatusCode } from '../../generated/agent_start/protocol/v1/errors_pb.js'
import {
  TerminalColorSchemeMode,
  TerminalCursorStyle,
  TerminalService,
  TerminalServiceUnsubscribeRequestSchema,
  TerminalServiceUnsubscribeResponseSchema,
  TerminalServiceUpdateViewAttributesRequestSchema,
  TerminalServiceUpdateViewAttributesResponseSchema,
  TerminalServiceUpdateViewportRequestSchema,
  TerminalServiceUpdateViewportResponseSchema
} from '../../generated/agent_start/runtime/v1/terminal_pb.js'
import { RuntimeProtocolError } from '../error.js'
import type { RuntimeCallOptions } from '../transport.js'
import { TerminalIoClient } from './io-client.js'
import { clientIdentity, required, viewport } from './request-values.js'
import type {
  TerminalClientIdentity,
  TerminalViewAttributesInput,
  TerminalViewport
} from './types.js'

const UNSUBSCRIBE_PROCEDURE = `/${TerminalService.typeName}/${TerminalService.method.unsubscribe.name}`
const UPDATE_VIEW_ATTRIBUTES_PROCEDURE = `/${TerminalService.typeName}/${TerminalService.method.updateViewAttributes.name}`
const UPDATE_VIEWPORT_PROCEDURE = `/${TerminalService.typeName}/${TerminalService.method.updateViewport.name}`

export class TerminalViewClient extends TerminalIoClient {
  async updateViewport(
    input: {
      terminal: string
      client: TerminalClientIdentity
      viewport: TerminalViewport
      claim?: boolean
    },
    options?: RuntimeCallOptions
  ): Promise<{ applied: boolean; updated: boolean }> {
    const response = fromBinary(
      TerminalServiceUpdateViewportResponseSchema,
      await this.transport.unary({
        method: UPDATE_VIEWPORT_PROCEDURE,
        payload: toBinary(
          TerminalServiceUpdateViewportRequestSchema,
          create(TerminalServiceUpdateViewportRequestSchema, {
            terminal: required(input.terminal, 'Terminal handle'),
            client: clientIdentity(input.client),
            viewport: viewport(input.viewport),
            claim: input.claim === true
          })
        ),
        ...(options ? { options } : {})
      })
    )
    return { applied: response.applied, updated: response.updated }
  }

  async unsubscribe(
    input: { client?: TerminalClientIdentity; subscriptionId: string },
    options?: RuntimeCallOptions
  ): Promise<{ unsubscribed: true }> {
    const response = await this.transport.unary({
      method: UNSUBSCRIBE_PROCEDURE,
      payload: toBinary(
        TerminalServiceUnsubscribeRequestSchema,
        create(TerminalServiceUnsubscribeRequestSchema, {
          ...(input.client ? { client: clientIdentity(input.client) } : {}),
          subscriptionId: required(input.subscriptionId, 'Terminal subscription ID')
        })
      ),
      ...(options ? { options } : {})
    })
    if (!fromBinary(TerminalServiceUnsubscribeResponseSchema, response).unsubscribed) {
      throw new RuntimeProtocolError(
        StatusCode.UNKNOWN,
        'Terminal unsubscribe did not report success'
      )
    }
    return { unsubscribed: true }
  }

  async updateViewAttributes(
    input: TerminalViewAttributesInput,
    options?: RuntimeCallOptions
  ): Promise<{ updated: true }> {
    const response = await this.transport.unary({
      method: UPDATE_VIEW_ATTRIBUTES_PROCEDURE,
      payload: toBinary(
        TerminalServiceUpdateViewAttributesRequestSchema,
        create(TerminalServiceUpdateViewAttributesRequestSchema, {
          foreground: rgb(input.foreground),
          background: rgb(input.background),
          cursor: rgb(input.cursor),
          ansi: input.ansi.map(rgb),
          colorSchemeMode:
            input.colorSchemeMode === 'dark'
              ? TerminalColorSchemeMode.DARK
              : TerminalColorSchemeMode.LIGHT,
          cursorStyle: cursorStyle(input.cursorStyle),
          cursorBlink: input.cursorBlink
        })
      ),
      ...(options ? { options } : {})
    })
    if (!fromBinary(TerminalServiceUpdateViewAttributesResponseSchema, response).updated) {
      throw new RuntimeProtocolError(
        StatusCode.UNKNOWN,
        'Terminal view attribute update did not report success'
      )
    }
    return { updated: true }
  }
}

function rgb(value: readonly [number, number, number]): {
  red: number
  green: number
  blue: number
} {
  const [red, green, blue] = value
  return { red: channel(red), green: channel(green), blue: channel(blue) }
}

function channel(value: number): number {
  if (!Number.isInteger(value) || value < 0 || value > 255) {
    throw new TypeError('Terminal color channel must be an integer between 0 and 255')
  }
  return value
}

function cursorStyle(value: 'bar' | 'block' | 'underline'): TerminalCursorStyle {
  switch (value) {
    case 'bar':
      return TerminalCursorStyle.BAR
    case 'block':
      return TerminalCursorStyle.BLOCK
    case 'underline':
      return TerminalCursorStyle.UNDERLINE
  }
}
