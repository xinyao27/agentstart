import { translate } from '~renderer/i18n/i18n'
import { joinPath } from '~renderer/path'
import { runtimePathExists, type RuntimeFileOperationArgs } from '~renderer/runtime/file-client'

import { isPathEqualOrDescendant, normalizeAbsolutePathForComparison } from './paths'
import type { FileExplorerOperationOwner, TreeNode } from './types'

export function fileExplorerOwnersMatch(
  left: FileExplorerOperationOwner,
  right: FileExplorerOperationOwner
): boolean {
  if (left.kind !== right.kind) {
    return false
  }
  return (
    left.kind !== 'runtime' ||
    (right.kind === 'runtime' && left.environmentId === right.environmentId)
  )
}

export function selectFileExplorerClipboardRoots(nodes: readonly TreeNode[]): TreeNode[] {
  return nodes.filter(
    (node) =>
      !nodes.some(
        (other) =>
          other !== node && other.isDirectory && isPathEqualOrDescendant(node.path, other.path)
      )
  )
}

export function resolveFileExplorerClipboardOwner(
  nodes: readonly TreeNode[]
): FileExplorerOperationOwner | null {
  const firstOwner = nodes[0]?.operationOwner ?? { kind: 'unresolved' as const }
  return nodes.every((node) =>
    fileExplorerOwnersMatch(firstOwner, node.operationOwner ?? { kind: 'unresolved' as const })
  )
    ? firstOwner
    : null
}

function getCopyName(name: string, isDirectory: boolean, copyNumber: number): string {
  const dotIndex = isDirectory ? -1 : name.lastIndexOf('.')
  const stem = dotIndex > 0 ? name.slice(0, dotIndex) : name
  const extension = dotIndex > 0 ? name.slice(dotIndex) : ''
  return `${stem} copy${copyNumber > 1 ? ` ${copyNumber}` : ''}${extension}`
}

export async function getAvailableClipboardDestinationPath(
  context: RuntimeFileOperationArgs,
  destinationDir: string,
  node: TreeNode,
  reservedPaths: Set<string>
): Promise<string> {
  const originalPath = joinPath(destinationDir, node.name)
  const normalizedOriginalPath = normalizeAbsolutePathForComparison(originalPath)
  if (
    !reservedPaths.has(normalizedOriginalPath) &&
    !(await runtimePathExists(context, originalPath))
  ) {
    reservedPaths.add(normalizedOriginalPath)
    return originalPath
  }

  let copyNumber = 1
  while (copyNumber < 10_000) {
    const candidate = joinPath(destinationDir, getCopyName(node.name, node.isDirectory, copyNumber))
    const normalizedCandidate = normalizeAbsolutePathForComparison(candidate)
    if (!reservedPaths.has(normalizedCandidate) && !(await runtimePathExists(context, candidate))) {
      reservedPaths.add(normalizedCandidate)
      return candidate
    }
    copyNumber += 1
  }
  throw new Error(
    translate(
      'auto.components.workspacePanel.fileExplorerClipboard.uniqueName',
      "Couldn't find an available name for '{{value0}}'.",
      { value0: node.name }
    )
  )
}
