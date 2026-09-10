import { requireSuccessfulResponse } from './messages'

const BACKGROUND_RESPONSE_RETRY_DELAY_MS = 250

export async function publishProjectCatalog(
  projects: { displayName: string; projectId: string }[]
): Promise<void> {
  await publishProjectGroupMessage({ projects, type: 'project-group-catalog' })
}

export async function publishWorkspacePortClaims(
  claims: { displayName: string; port: number; projectId: string; worktreeId: string }[]
): Promise<void> {
  await publishProjectGroupMessage({ claims, type: 'workspace-port-claims' })
}

async function publishProjectGroupMessage(message: object): Promise<void> {
  const response: unknown = await chrome.runtime.sendMessage(message)
  if (response !== undefined) {
    requireSuccessfulResponse(response)
    return
  }
  await new Promise<void>((resolve) => setTimeout(resolve, BACKGROUND_RESPONSE_RETRY_DELAY_MS))
  requireSuccessfulResponse(await chrome.runtime.sendMessage(message))
}
