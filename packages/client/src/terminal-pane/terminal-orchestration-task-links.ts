import { openOrchestrationTarget } from '~renderer/runtime/orchestration-target'
import { openRuntimeTerminalClient } from '~renderer/runtime/terminal-protocol'

export type ParsedOrchestrationTaskLink = {
  taskId: string
  startIndex: number
  endIndex: number
}

export const ORCHESTRATION_TASK_PREFIX = 'task_'

const MAX_ORCHESTRATION_TASK_TOKEN_LENGTH = 128
const ORCHESTRATION_TASK_BOUNDARY_CHAR = /[A-Za-z0-9_-]/

export function extractOrchestrationTaskLinks(lineText: string): ParsedOrchestrationTaskLink[] {
  if (!lineText.includes(ORCHESTRATION_TASK_PREFIX)) {
    return []
  }

  const links: ParsedOrchestrationTaskLink[] = []
  let searchStart = 0
  while (searchStart < lineText.length) {
    const startIndex = lineText.indexOf(ORCHESTRATION_TASK_PREFIX, searchStart)
    if (startIndex === -1) {
      break
    }

    const bodyStart = startIndex + ORCHESTRATION_TASK_PREFIX.length
    const tokenEnd = findOrchestrationTaskTokenEnd(lineText, bodyStart)
    searchStart = Math.max(tokenEnd, bodyStart + 1)
    const bodyLength = tokenEnd - bodyStart
    if (bodyLength === 0) {
      continue
    }

    const taskId = lineText.slice(startIndex, tokenEnd)
    if (taskId.length > MAX_ORCHESTRATION_TASK_TOKEN_LENGTH) {
      continue
    }
    if (
      ORCHESTRATION_TASK_BOUNDARY_CHAR.test(lineText[startIndex - 1] ?? '') ||
      ORCHESTRATION_TASK_BOUNDARY_CHAR.test(lineText[tokenEnd] ?? '')
    ) {
      continue
    }
    links.push({ taskId, startIndex, endIndex: tokenEnd })
  }
  return links
}

export async function focusRuntimeOrchestrationTask(
  taskId: string,
  runtimeEnvironmentId: string | null,
  focusRendererTerminal?: (handle: string) => boolean
): Promise<void> {
  const environmentId = runtimeEnvironmentId?.trim()
  const target = environmentId
    ? ({ kind: 'environment', environmentId } as const)
    : ({ kind: 'local' } as const)
  const orchestration = await openOrchestrationTarget()
  if (!orchestration) {
    throw new Error('Orchestration protocol capability is not available on this daemon')
  }
  const result = await orchestration.dispatchShow(
    { task: taskId },
    environmentId ? { destination: { environmentId } } : {}
  )
  const terminal = result.dispatch?.assigneeHandle?.trim()
  if (!terminal) {
    throw new Error(`No dispatched terminal for orchestration task ${taskId}`)
  }
  if (focusRendererTerminal?.(terminal)) {
    return
  }
  // Why: task IDs are stable orchestration DB records, but terminal.focus owns
  // the app-side navigation contract for local and SSH runtime terminals.
  await (await openRuntimeTerminalClient(target)).focus(terminal)
}

function findOrchestrationTaskTokenEnd(lineText: string, startIndex: number): number {
  let index = startIndex
  while (index < lineText.length && ORCHESTRATION_TASK_BOUNDARY_CHAR.test(lineText[index])) {
    index += 1
  }
  return index
}
