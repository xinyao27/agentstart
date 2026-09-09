import type { FileWatchMessage } from '@yiru/protocol'
import type { FsChangedPayload } from '@yiru/protocol/files/watch-values'

import { requireFilesTarget } from '../files-target'
import { getActiveRuntimeTarget } from '../rpc-client'
import type { RuntimeClientTarget } from '../runtime-target'
import { toRuntimeWorktreeSelector } from '../worktree-selector'
import type { RuntimeFileOperationArgs } from './context'

type RuntimeFileWatchListener = {
  onPayload: (payload: FsChangedPayload) => void
  onError?: (error: Error) => void
}

type SharedRuntimeFileWatch = {
  target: RuntimeClientTarget
  worktreeId: string
  listeners: Set<RuntimeFileWatchListener>
  start: Promise<void>
  cancel: (() => void) | null
  closed: boolean
}

const sharedRuntimeFileWatches = new Map<string, SharedRuntimeFileWatch>()

export async function subscribeRuntimeFileChanges(
  context: RuntimeFileOperationArgs,
  onPayload: (payload: FsChangedPayload) => void,
  onError?: (error: Error) => void
): Promise<() => void> {
  const target = getActiveRuntimeTarget(context.settings)
  if (!context.worktreeId || !context.worktreePath) {
    throw new Error('A runtime file watch requires an owning worktree')
  }
  const listener: RuntimeFileWatchListener = { onPayload, onError }
  const key = getSharedRuntimeFileWatchKey(target, context.worktreeId, context.worktreePath)
  let shared = sharedRuntimeFileWatches.get(key)
  if (!shared) {
    shared = createSharedRuntimeFileWatch(key, target, context.worktreeId, context.worktreePath)
    sharedRuntimeFileWatches.set(key, shared)
  }
  shared.listeners.add(listener)
  try {
    await shared.start
  } catch (error) {
    shared.listeners.delete(listener)
    throw error
  }
  return () => {
    const current = sharedRuntimeFileWatches.get(key)
    if (!current) {
      return
    }
    current.listeners.delete(listener)
    if (current.listeners.size === 0) {
      closeSharedRuntimeFileWatch(key, current)
    }
  }
}

function getSharedRuntimeFileWatchKey(
  target: RuntimeClientTarget,
  worktreeId: string,
  worktreePath: string
): string {
  const targetKey = target.kind === 'environment' ? target.environmentId : 'local'
  return `${targetKey}\0${worktreeId}\0${worktreePath}`
}

function createSharedRuntimeFileWatch(
  key: string,
  target: RuntimeClientTarget,
  worktreeId: string,
  worktreePath: string
): SharedRuntimeFileWatch {
  const shared: SharedRuntimeFileWatch = {
    target,
    worktreeId,
    listeners: new Set(),
    start: Promise.resolve(),
    cancel: null,
    closed: false
  }
  // Why: editor reloads and Explorer can watch the same remote worktree. Keep
  // one server watcher and fan out events in the renderer.
  shared.start = startSharedRuntimeFileWatch(key, shared, worktreePath).catch((error) => {
    failSharedRuntimeFileWatch(
      key,
      shared,
      error instanceof Error ? error : new Error(String(error))
    )
    throw error
  })
  return shared
}

async function startSharedRuntimeFileWatch(
  key: string,
  shared: SharedRuntimeFileWatch,
  worktreePath: string
): Promise<void> {
  const client = await requireFilesTarget(shared.target)
  const watch = await client.watch(toRuntimeWorktreeSelector(shared.worktreeId))
  shared.cancel = () => {
    void watch.cancel()
  }
  if (shared.closed || sharedRuntimeFileWatches.get(key) !== shared) {
    shared.cancel()
    shared.cancel = null
    return
  }
  void consumeSharedRuntimeFileWatch(key, shared, worktreePath, watch.messages).finally(() => {
    if (sharedRuntimeFileWatches.get(key) === shared && !shared.closed) {
      sharedRuntimeFileWatches.delete(key)
      shared.closed = true
      shared.cancel = null
    }
  })
}

async function consumeSharedRuntimeFileWatch(
  key: string,
  shared: SharedRuntimeFileWatch,
  worktreePath: string,
  messages: AsyncIterable<FileWatchMessage>
): Promise<void> {
  try {
    for await (const event of messages) {
      if (event.type === 'starting' || event.type === 'ready') {
        if (shared.closed) {
          shared.cancel?.()
          shared.cancel = null
        }
      } else if (event.type === 'changed') {
        const payload: FsChangedPayload = { worktreePath, events: [...event.events] }
        for (const listener of Array.from(shared.listeners)) {
          listener.onPayload(payload)
        }
      } else if (event.type === 'error') {
        failSharedRuntimeFileWatch(key, shared, new Error(event.message))
      } else if (event.type === 'end') {
        if (sharedRuntimeFileWatches.get(key) === shared) {
          sharedRuntimeFileWatches.delete(key)
        }
        shared.closed = true
        shared.cancel = null
        shared.listeners.clear()
      }
    }
  } catch (error) {
    if (!shared.closed) {
      failSharedRuntimeFileWatch(
        key,
        shared,
        error instanceof Error ? error : new Error(String(error))
      )
    }
  }
}

function failSharedRuntimeFileWatch(
  key: string,
  shared: SharedRuntimeFileWatch,
  error: Error
): void {
  if (sharedRuntimeFileWatches.get(key) === shared) {
    sharedRuntimeFileWatches.delete(key)
  }
  shared.closed = true
  const cancel = shared.cancel
  shared.cancel = null
  const listeners = Array.from(shared.listeners)
  shared.listeners.clear()
  cancel?.()
  for (const listener of listeners) {
    listener.onError?.(error)
  }
}

function closeSharedRuntimeFileWatch(key: string, shared: SharedRuntimeFileWatch): void {
  if (shared.closed) {
    return
  }
  shared.closed = true
  sharedRuntimeFileWatches.delete(key)
  shared.cancel?.()
  shared.cancel = null
}
