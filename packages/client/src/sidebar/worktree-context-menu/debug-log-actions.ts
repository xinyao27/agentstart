import { useEffect, useState } from 'react'
import { toast } from 'sonner'
import { detectLanguage } from '~renderer/file-presentation/language-detect'
import { translate } from '~renderer/i18n/i18n'
import { joinPath } from '~renderer/path'
import type { RuntimeFileOperationArgs } from '~renderer/runtime/file-client'
import {
  deleteRuntimePath,
  readRuntimeDirectory,
  runtimePathExists
} from '~renderer/runtime/file-client'
import { useAppStore } from '~renderer/store/state'
import { activateAndRevealWorktree } from '~renderer/worktree/activation'

import type { WorktreeContextMenuState } from './state'

// Why: the agentstart-debug skill instructs agents to write NDJSON logs under this
// AgentStart-reserved worktree directory; the menu reads and clears the same place.
const WORKTREE_DEBUG_LOG_DIR = '.agentstart/debug'
const MAX_OPENED_DEBUG_LOG_FILES = 10

type OpenDebugLogFile = (file: {
  filePath: string
  relativePath: string
  worktreeId: string
  language: string
  mode: 'edit'
}) => void

async function listDebugLogFileNames(
  context: RuntimeFileOperationArgs,
  logRootPath: string
): Promise<string[]> {
  if (!(await runtimePathExists(context, logRootPath))) {
    return []
  }
  const entries = await readRuntimeDirectory(context, logRootPath)
  return entries
    .filter((entry) => !entry.isDirectory && !entry.isSymlink)
    .map((entry) => entry.name)
    .sort((first, second) => first.localeCompare(second))
}

function toastNoDebugLogs(): void {
  toast.info(
    translate(
      'auto.components.sidebar.WorktreeContextMenu.noDebugLogs',
      'No debug logs in this worktree.'
    )
  )
}

async function viewDebugLogs(args: {
  context: RuntimeFileOperationArgs
  worktreeId: string
  worktreePath: string
  openFile: OpenDebugLogFile
}): Promise<void> {
  const logRootPath = joinPath(args.worktreePath, WORKTREE_DEBUG_LOG_DIR)
  const fileNames = await listDebugLogFileNames(args.context, logRootPath)
  if (fileNames.length === 0) {
    toastNoDebugLogs()
    return
  }
  activateAndRevealWorktree(args.worktreeId)
  for (const fileName of fileNames.slice(0, MAX_OPENED_DEBUG_LOG_FILES)) {
    args.openFile({
      filePath: joinPath(logRootPath, fileName),
      relativePath: `${WORKTREE_DEBUG_LOG_DIR}/${fileName}`,
      worktreeId: args.worktreeId,
      language: detectLanguage(fileName),
      mode: 'edit'
    })
  }
}

async function clearDebugLogs(args: {
  context: RuntimeFileOperationArgs
  worktreePath: string
}): Promise<void> {
  const logRootPath = joinPath(args.worktreePath, WORKTREE_DEBUG_LOG_DIR)
  if (!(await runtimePathExists(args.context, logRootPath))) {
    toastNoDebugLogs()
    return
  }
  await deleteRuntimePath(args.context, logRootPath, true)
  toast.success(
    translate('auto.components.sidebar.WorktreeContextMenu.debugLogsCleared', 'Debug logs cleared.')
  )
}

export function useDebugLogMenuActions(args: {
  state: WorktreeContextMenuState
  menuOpen: boolean
}) {
  const { menuOpen } = args
  const { worktree } = args.state
  const settings = useAppStore((store) => store.settings)
  const openFile = useAppStore((store) => store.openFile)
  // Why: Repo.connectionId is dead — nothing sets it since remote hosts were
  // removed (#63) — debug logs for a direct worktree are always local.
  const connectionId = undefined
  const [hasDebugLogs, setHasDebugLogs] = useState(false)

  // Why: log presence lives on the worktree's host, so it can only be known
  // asynchronously. Probe on each menu open and keep the entry disabled until
  // the probe confirms there is something to view or clear.
  useEffect(() => {
    if (!menuOpen) {
      return
    }
    let cancelled = false
    const context: RuntimeFileOperationArgs = {
      settings,
      worktreeId: worktree.id,
      worktreePath: worktree.path,
      connectionId
    }
    listDebugLogFileNames(context, joinPath(worktree.path, WORKTREE_DEBUG_LOG_DIR))
      .then((fileNames) => {
        if (!cancelled) {
          setHasDebugLogs(fileNames.length > 0)
        }
      })
      .catch(() => {
        if (!cancelled) {
          setHasDebugLogs(false)
        }
      })
    return () => {
      cancelled = true
    }
  }, [connectionId, menuOpen, settings, worktree.id, worktree.path])

  const handleViewDebugLogs = () => {
    const context: RuntimeFileOperationArgs = {
      settings,
      worktreeId: worktree.id,
      worktreePath: worktree.path,
      connectionId
    }
    viewDebugLogs({
      context,
      worktreeId: worktree.id,
      worktreePath: worktree.path,
      openFile
    }).catch(() => {
      toast.error(
        translate(
          'auto.components.sidebar.WorktreeContextMenu.viewDebugLogsFailed',
          'Could not read debug logs.'
        )
      )
    })
  }

  const handleClearDebugLogs = () => {
    const context: RuntimeFileOperationArgs = {
      settings,
      worktreeId: worktree.id,
      worktreePath: worktree.path,
      connectionId
    }
    clearDebugLogs({ context, worktreePath: worktree.path })
      .then(() => setHasDebugLogs(false))
      .catch(() => {
        toast.error(
          translate(
            'auto.components.sidebar.WorktreeContextMenu.clearDebugLogsFailed',
            'Could not clear debug logs.'
          )
        )
      })
  }

  return {
    handleClearDebugLogs,
    handleViewDebugLogs,
    hasDebugLogs
  }
}

export type DebugLogMenuActions = ReturnType<typeof useDebugLogMenuActions>
