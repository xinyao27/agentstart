import type { TerminalCreateInput } from '@agentstart/protocol'

export function resolveTerminalPresentation(data: {
  presentation?: TerminalCreateInput['presentation']
  activate?: boolean
}): TerminalCreateInput['presentation'] | undefined {
  if (data.presentation) {
    return data.presentation
  }
  if (data.activate === true) {
    return 'focused'
  }
  return undefined
}
