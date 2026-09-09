import { isTuiAgent } from '@yiru/protocol/agent/identity'
import { recognizeAgentProcessFromCommandLine } from '@yiru/protocol/agent/process/recognition'
import type { TuiAgent } from '@yiru/protocol/agent/types'
import { useAppStore } from '~renderer/store/state'

const MANUAL_AGENT_COMMAND_MAX_CHARS = 4096

type ShellCommandAgentInferenceInput = {
  cacheKey: string
  hasFreshPaneAgentSurface: () => boolean
}

export function createShellCommandAgentInference({
  cacheKey,
  hasFreshPaneAgentSurface
}: ShellCommandAgentInferenceInput) {
  let inferredAgent: TuiAgent | null = null
  let commandLine = ''
  let cursorIndex = 0
  let generation = 0
  let isSuspended = false
  let onAcceptedAgent = (_agent: TuiAgent): void => {}
  let onRequestDroidReconfirmation = (): void => {}

  const resetCommandLine = (): void => {
    commandLine = ''
    cursorIndex = 0
  }
  const rememberAgent = (): void => {
    const normalizedCommand = commandLine.trim()
    resetCommandLine()
    const candidateAgent = normalizedCommand
      ? (recognizeAgentProcessFromCommandLine(normalizedCommand)?.agent ?? null)
      : null
    const state = useAppStore.getState()
    const registeredAgent = state.agentLaunchConfigByPaneKey[cacheKey]?.identity.agentType
    inferredAgent =
      state.paneForegroundAgentByPaneKey[cacheKey]?.agent || isTuiAgent(registeredAgent)
        ? null
        : candidateAgent
    generation += 1
    if (inferredAgent) {
      onAcceptedAgent(inferredAgent)
    }
  }
  const clear = (): void => {
    inferredAgent = null
    resetCommandLine()
    generation += 1
  }
  const append = (text: string): void => {
    const available = MANUAL_AGENT_COMMAND_MAX_CHARS - commandLine.length
    if (available <= 0) {
      isSuspended = true
      return
    }
    const inserted = text.slice(0, available)
    commandLine = commandLine.slice(0, cursorIndex) + inserted + commandLine.slice(cursorIndex)
    cursorIndex += inserted.length
    isSuspended ||= inserted.length < text.length
  }
  const deleteWord = (): void => {
    const beforeCursor = commandLine.slice(0, cursorIndex)
    const nextBeforeCursor = beforeCursor.replace(/[^\S\r\n]*\S+[^\S\r\n]*$/, '')
    commandLine = nextBeforeCursor + commandLine.slice(cursorIndex)
    cursorIndex = nextBeforeCursor.length
  }
  const deleteBeforeCursor = (): void => {
    if (cursorIndex > 0) {
      commandLine = commandLine.slice(0, cursorIndex - 1) + commandLine.slice(cursorIndex)
      cursorIndex -= 1
    }
  }
  const consumeCsi = (data: string, index: number): number | null => {
    if (data.charCodeAt(index) !== 0x1b || data[index + 1] !== '[') {
      return null
    }
    let cursor = index + 2
    while (cursor < data.length && /[0-9;?]/.test(data[cursor]!)) {
      cursor += 1
    }
    const final = data[cursor]
    if (!final || !/[~A-Za-z]/.test(final)) {
      return null
    }
    const params = data.slice(index + 2, cursor)
    if (final === 'D' && params === '') {
      cursorIndex = Math.max(0, cursorIndex - 1)
    } else if (final === 'C' && params === '') {
      cursorIndex = Math.min(commandLine.length, cursorIndex + 1)
    } else if (final === 'H' || (final === '~' && params === '1')) {
      cursorIndex = 0
    } else if (final === 'F' || (final === '~' && params === '4')) {
      cursorIndex = commandLine.length
    } else if (final === '~' && params === '3' && cursorIndex < commandLine.length) {
      commandLine = commandLine.slice(0, cursorIndex) + commandLine.slice(cursorIndex + 1)
    } else if (!(final === '~' && (params === '200' || params === '201'))) {
      resetCommandLine()
    }
    return cursor + 1
  }

  const observeAcceptedInput = (data: string): void => {
    if (
      data.includes('\r') ||
      data.includes('\n') ||
      data.includes('\x03') ||
      data.includes('\x04')
    ) {
      onRequestDroidReconfirmation()
    }
    if (inferredAgent) {
      return
    }
    if (hasFreshPaneAgentSurface()) {
      resetCommandLine()
      return
    }
    if (isSuspended) {
      if (data.includes('\x03') || data.includes('\x15')) {
        isSuspended = false
        resetCommandLine()
      }
      if (data.includes('\r') || data.includes('\n')) {
        isSuspended = false
      }
      return
    }
    if (data.length > MANUAL_AGENT_COMMAND_MAX_CHARS) {
      resetCommandLine()
      isSuspended = !data.includes('\r') && !data.includes('\n')
      return
    }
    for (let index = 0; index < data.length; index += 1) {
      const char = data[index]!
      if (char === '\r' || char === '\n') {
        isSuspended = false
        rememberAgent()
        if (inferredAgent) {
          return
        }
      } else if (char === '\x7f' || char === '\b') {
        deleteBeforeCursor()
      } else if (char === '\x17') {
        deleteWord()
      } else if (char === '\x03' || char === '\x15') {
        resetCommandLine()
      } else if (char === '\x1b') {
        const nextIndex = consumeCsi(data, index)
        if (nextIndex === null) {
          resetCommandLine()
        } else {
          index = nextIndex - 1
        }
      } else if (char < ' ') {
        resetCommandLine()
      } else {
        append(char)
        if (isSuspended) {
          return
        }
      }
    }
  }

  return {
    cancelSuspended: () => {
      if (isSuspended) {
        isSuspended = false
        resetCommandLine()
      }
    },
    clear,
    clearAfterPtySideEffects: () => {
      const currentGeneration = generation
      resetCommandLine()
      queueMicrotask(() => setTimeout(() => currentGeneration === generation && clear(), 0))
    },
    getAgent: () => inferredAgent,
    observeAcceptedInput,
    requestKnownDroidReconfirmation: () => onRequestDroidReconfirmation(),
    setAcceptedAgentHandler: (handler: (agent: TuiAgent) => void) => {
      onAcceptedAgent = handler
    },
    setDroidReconfirmationHandler: (handler: () => void) => {
      onRequestDroidReconfirmation = handler
    }
  }
}

export type ShellCommandAgentInference = ReturnType<typeof createShellCommandAgentInference>
