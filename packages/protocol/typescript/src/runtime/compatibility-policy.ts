export type RuntimeCompatVerdict =
  | {
      kind: 'ok'
      clientProtocolVersion: number
      serverProtocolVersion: number
    }
  | {
      kind: 'blocked'
      reason: 'client-too-old' | 'server-too-old'
      clientProtocolVersion: number
      serverProtocolVersion: number
      requiredClientProtocolVersion?: number
      requiredServerProtocolVersion?: number
    }

export function evaluateRuntimeCompat(input: {
  clientProtocolVersion: number
  minCompatibleServerProtocolVersion: number
  serverProtocolVersion: number | undefined
  serverMinCompatibleClientProtocolVersion: number | undefined
}): RuntimeCompatVerdict {
  // Why: absent fields are protocol 0, so new clients fail clearly against
  // servers that predate compatibility negotiation.
  const serverProtocolVersion = input.serverProtocolVersion ?? 0
  const requiredClientProtocolVersion = input.serverMinCompatibleClientProtocolVersion ?? 0

  if (input.clientProtocolVersion < requiredClientProtocolVersion) {
    return {
      kind: 'blocked',
      reason: 'client-too-old',
      clientProtocolVersion: input.clientProtocolVersion,
      serverProtocolVersion,
      requiredClientProtocolVersion
    }
  }
  if (serverProtocolVersion < input.minCompatibleServerProtocolVersion) {
    return {
      kind: 'blocked',
      reason: 'server-too-old',
      clientProtocolVersion: input.clientProtocolVersion,
      serverProtocolVersion,
      requiredServerProtocolVersion: input.minCompatibleServerProtocolVersion
    }
  }
  return {
    kind: 'ok',
    clientProtocolVersion: input.clientProtocolVersion,
    serverProtocolVersion
  }
}
