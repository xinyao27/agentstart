import { toast } from 'sonner'
import { requestEditorSaveQuiesce } from '~renderer/editor/autosave'
import { translate } from '~renderer/i18n/i18n'
import { dirname } from '~renderer/path'
import { extractRuntimeErrorMessage } from '~renderer/runtime/error-message'
import {
  copyRuntimePath,
  deleteRuntimePath,
  renameRuntimePath,
  type RuntimeFileOperationArgs
} from '~renderer/runtime/file-client'
import { shellClient } from '~renderer/runtime/shell-client'
import { useAppStore } from '~renderer/store/state'

import { remapOpenEditorTabsForPathChange } from '../remap-open-editor-tabs-for-path-change'
import {
  fileExplorerOwnersMatch,
  getAvailableClipboardDestinationPath,
  resolveFileExplorerClipboardOwner,
  selectFileExplorerClipboardRoots
} from './clipboard-destination'
import {
  getFileExplorerOperationOwner,
  getFileExplorerOperationRoute,
  getFileExplorerOwnerUnresolvedMessage
} from './operation-owner'
import { isPathEqualOrDescendant } from './paths'
import { formatFileExplorerPathsForClipboard } from './selection'
import type { FileExplorerOperationOwner, TreeNode } from './types'
import { commitFileExplorerOp } from './undo-redo'

type FileExplorerClipboardMode = 'copy' | 'cut'

type FileExplorerClipboardState = {
  mode: FileExplorerClipboardMode
  nodes: TreeNode[]
  owner: FileExplorerOperationOwner
  systemTextWritten: Promise<boolean>
  systemText: string
  worktreeId: string
  worktreePath: string
}

type PastedPath = {
  destinationPath: string
  isDirectory: boolean
  sourcePath: string
}

let fileExplorerClipboard: FileExplorerClipboardState | null = null

export function setFileExplorerClipboard(
  mode: FileExplorerClipboardMode,
  nodes: readonly TreeNode[],
  worktreeId: string | null,
  worktreePath: string | null
): void {
  if (!worktreeId || !worktreePath || nodes.length === 0) {
    return
  }
  const roots = selectFileExplorerClipboardRoots(nodes)
  const owner = resolveFileExplorerClipboardOwner(roots)
  if (!owner || owner.kind === 'unresolved') {
    fileExplorerClipboard = null
    return
  }
  const systemText = formatFileExplorerPathsForClipboard(roots, 'absolute')
  const systemTextWritten = shellClient.ui.writeClipboardText(systemText).then(
    () => true,
    () => false
  )
  fileExplorerClipboard = {
    mode,
    nodes: roots,
    owner,
    systemText,
    systemTextWritten,
    worktreeId,
    worktreePath
  }
}

async function systemClipboardStillMatches(state: FileExplorerClipboardState): Promise<boolean> {
  if (!(await state.systemTextWritten)) {
    return true
  }
  try {
    return (await shellClient.ui.readClipboardText()) === state.systemText
  } catch {
    // Why: web clipboard reads can be denied after the user has already copied
    // inside AgentStart. Keep the in-memory resource clipboard usable in that case.
    return true
  }
}

async function refreshDirectories(
  paths: Iterable<string>,
  refreshDir: (dirPath: string) => Promise<void>
): Promise<void> {
  await Promise.all([...new Set(paths)].map((path) => refreshDir(path)))
}

async function movePath(
  context: RuntimeFileOperationArgs,
  sourcePath: string,
  destinationPath: string,
  worktreeId: string,
  worktreePath: string
): Promise<void> {
  const filesToMove = useAppStore
    .getState()
    .openFiles.filter((file) => isPathEqualOrDescendant(file.filePath, sourcePath))
  await Promise.all(filesToMove.map((file) => requestEditorSaveQuiesce({ fileId: file.id })))
  await renameRuntimePath(context, sourcePath, destinationPath)
  remapOpenEditorTabsForPathChange({
    fromPath: sourcePath,
    toPath: destinationPath,
    worktreeId,
    worktreePath
  })
}

function commitPasteOperation(
  mode: FileExplorerClipboardMode,
  context: RuntimeFileOperationArgs,
  pastedPaths: readonly PastedPath[],
  worktreeId: string,
  worktreePath: string,
  refreshDir: (dirPath: string) => Promise<void>
): void {
  const refreshPaths = pastedPaths.flatMap(({ sourcePath, destinationPath }) => [
    dirname(sourcePath),
    dirname(destinationPath)
  ])
  commitFileExplorerOp({
    undo: async () => {
      if (mode === 'copy') {
        for (const item of [...pastedPaths].toReversed()) {
          await deleteRuntimePath(context, item.destinationPath, item.isDirectory)
        }
      } else {
        for (const item of [...pastedPaths].toReversed()) {
          await movePath(context, item.destinationPath, item.sourcePath, worktreeId, worktreePath)
        }
      }
      await refreshDirectories(refreshPaths, refreshDir)
    },
    redo: async () => {
      for (const item of pastedPaths) {
        await (mode === 'copy'
          ? copyRuntimePath(context, item.sourcePath, item.destinationPath)
          : movePath(context, item.sourcePath, item.destinationPath, worktreeId, worktreePath))
      }
      await refreshDirectories(refreshPaths, refreshDir)
    }
  })
}

export function pasteFileExplorerClipboard(args: {
  activeWorktreeId: string | null
  destinationNode: TreeNode | null
  refreshDir: (dirPath: string) => Promise<void>
  setSelectedPaths: (paths: Set<string>) => void
  worktreePath: string | null
}): void {
  const clipboard = fileExplorerClipboard
  if (!clipboard || !args.activeWorktreeId || !args.worktreePath) {
    return
  }

  void (async () => {
    if (!(await systemClipboardStillMatches(clipboard))) {
      fileExplorerClipboard = null
      return
    }
    const currentOwner = getFileExplorerOperationOwner(args.activeWorktreeId)
    const route = getFileExplorerOperationRoute(currentOwner)
    const destinationOwner = args.destinationNode?.operationOwner ?? currentOwner
    if (
      clipboard.worktreeId !== args.activeWorktreeId ||
      clipboard.worktreePath !== args.worktreePath ||
      !fileExplorerOwnersMatch(clipboard.owner, currentOwner) ||
      !fileExplorerOwnersMatch(destinationOwner, currentOwner) ||
      !route
    ) {
      throw new Error(
        route
          ? translate(
              'auto.components.right.sidebar.fileExplorerClipboard.sameWorkspace',
              'Files can only be pasted into the workspace they were copied from.'
            )
          : getFileExplorerOwnerUnresolvedMessage()
      )
    }
    const destinationDir = args.destinationNode
      ? args.destinationNode.isDirectory
        ? args.destinationNode.path
        : dirname(args.destinationNode.path)
      : args.worktreePath
    if (
      clipboard.nodes.some(
        (node) => node.isDirectory && isPathEqualOrDescendant(destinationDir, node.path)
      )
    ) {
      throw new Error(
        translate(
          'auto.components.right.sidebar.fileExplorerClipboard.insideItself',
          "A folder can't be pasted into itself."
        )
      )
    }

    const context: RuntimeFileOperationArgs = {
      settings: route.settings,
      worktreeId: args.activeWorktreeId,
      worktreePath: args.worktreePath,
      connectionId: route.connectionId
    }
    const reservedPaths = new Set<string>()
    const pastedPaths: PastedPath[] = []
    let operationError: unknown
    for (const node of clipboard.nodes) {
      if (clipboard.mode === 'cut' && dirname(node.path) === destinationDir) {
        continue
      }
      try {
        const destinationPath = await getAvailableClipboardDestinationPath(
          context,
          destinationDir,
          node,
          reservedPaths
        )
        await (clipboard.mode === 'copy'
          ? copyRuntimePath(context, node.path, destinationPath)
          : movePath(context, node.path, destinationPath, args.activeWorktreeId, args.worktreePath))
        pastedPaths.push({
          sourcePath: node.path,
          destinationPath,
          isDirectory: node.isDirectory
        })
      } catch (error) {
        operationError = error
        break
      }
    }
    if (clipboard.mode === 'cut') {
      fileExplorerClipboard = null
    }
    if (pastedPaths.length === 0) {
      if (operationError) {
        throw operationError
      }
      return
    }
    commitPasteOperation(
      clipboard.mode,
      context,
      pastedPaths,
      args.activeWorktreeId,
      args.worktreePath,
      args.refreshDir
    )
    await refreshDirectories(
      pastedPaths.flatMap(({ sourcePath, destinationPath }) => [
        dirname(sourcePath),
        dirname(destinationPath)
      ]),
      args.refreshDir
    )
    args.setSelectedPaths(new Set(pastedPaths.map((item) => item.destinationPath)))
    if (operationError) {
      throw operationError
    }
  })().catch((error: unknown) => {
    toast.error(
      extractRuntimeErrorMessage(
        error,
        translate(
          'auto.components.right.sidebar.fileExplorerClipboard.failed',
          'Could not paste the selected files.'
        )
      )
    )
  })
}
