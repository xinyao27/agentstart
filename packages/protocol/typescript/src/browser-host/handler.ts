import { BrowserHostService } from '../../generated/agent_start/runtime/v1/browser_pb.js'
import type { RuntimeHandlerRegistry } from '../handler.js'
import { decodeBrowserCommand } from './command.js'
import { downloadBrowserFile } from './download.js'
import { encodeBrowserResponse } from './response.js'

export type BrowserCommandExecutor = (
  method: string,
  input: unknown,
  authorityId?: string | null,
  stream?: {
    sendBinary: (
      receiptId: string,
      sequence: number,
      isEnd: boolean,
      payload: Uint8Array<ArrayBufferLike>,
      signal: AbortSignal
    ) => Promise<void>
    signal: AbortSignal
  }
) => Promise<unknown>

export function installBrowserHostHandlers(
  registry: RuntimeHandlerRegistry,
  execute: BrowserCommandExecutor
): void {
  registry.registerUnary(BrowserHostService.method.execute, async (request) => {
    const command = request.command.case
    if (!command) {
      throw new Error('Browser command is missing')
    }
    const invocation = decodeBrowserCommand(request)
    // Why: pageControl/grab commands scope registration ownership to the calling authority, the
    // way the legacy shell-services dispatch's authorityId did.
    const result = await execute(invocation.method, invocation.input, request.authorityId ?? null)
    return encodeBrowserResponse(command, result)
  })
  registry.registerServerStream(BrowserHostService.method.download, (request, context) =>
    downloadBrowserFile(execute, request, context.signal)
  )
}
