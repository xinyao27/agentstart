import {
  classifyTerminalId,
  encodeRuntimePtyId,
  type DurablePtyId,
  type RuntimePtyId,
  type TerminalIdIndex
} from '@yiru/protocol/terminal-identity'
import type { StateCreator } from 'zustand'

import type { AppState } from '../store/types'

export type TerminalIdentitySlice = {
  terminalSessionIdIndex: TerminalIdIndex
  rememberTerminalSessionId: (
    handle: string,
    durablePtyId: string,
    environmentId: string | null
  ) => void
}

function withTerminalSessionId(
  index: TerminalIdIndex,
  runtimePtyId: RuntimePtyId,
  durablePtyId: DurablePtyId
): TerminalIdIndex {
  if (index.get(runtimePtyId) === durablePtyId) {
    return index
  }
  const next = new Map(index)
  next.set(runtimePtyId, durablePtyId)
  return next
}

export const createTerminalIdentitySlice: StateCreator<AppState, [], [], TerminalIdentitySlice> = (
  set
) => ({
  terminalSessionIdIndex: new Map(),
  rememberTerminalSessionId: (handle, rawDurablePtyId, environmentId) => {
    const durablePtyId = classifyTerminalId(rawDurablePtyId)
    if (durablePtyId.kind === 'runtime') {
      return
    }
    const runtimePtyId = encodeRuntimePtyId(handle, environmentId)
    set((state) => ({
      terminalSessionIdIndex: withTerminalSessionId(
        state.terminalSessionIdIndex,
        runtimePtyId,
        durablePtyId.id
      )
    }))
  }
})
