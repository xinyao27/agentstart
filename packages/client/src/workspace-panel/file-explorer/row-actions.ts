import { toast } from 'sonner'
import { translate } from '~renderer/i18n/i18n'
import { extractRuntimeErrorMessage } from '~renderer/runtime/error-message'
import { downloadRuntimeFile, type RuntimeFileOperationArgs } from '~renderer/runtime/file-client'
import { downloadRuntimeFolder } from '~renderer/runtime/folder-download'
import { shellClient } from '~renderer/runtime/shell-client'

import type { TreeNode } from './types'

export function shouldShowCollapseFolderAction(node: TreeNode, isExpanded: boolean): boolean {
  return node.isDirectory && isExpanded
}

export function shouldShowFindInFolderAction(node: TreeNode): boolean {
  return node.isDirectory
}

export function shouldShowOpenInTerminalAction(node: TreeNode): boolean {
  return node.isDirectory
}

export function shouldShowViewFileAction(node: TreeNode): boolean {
  return !node.isDirectory
}

export function shouldShowRemoteDownloadAction(
  runtimeDownloadContext?: RuntimeFileOperationArgs | null
): boolean {
  return Boolean(runtimeDownloadContext)
}

export function shouldShowCopyFileAction(
  node: TreeNode,
  connectionId?: string | null,
  selectionSize = 1
): boolean {
  // Why: remote directories need recursive materialization semantics not supported here.
  return (!connectionId || !node.isDirectory) && selectionSize === 1
}

export async function downloadRemoteEntry(
  node: TreeNode,
  runtimeContext: RuntimeFileOperationArgs
): Promise<void> {
  try {
    const result = node.isDirectory
      ? await downloadRuntimeFolder(runtimeContext, node.path, node.name)
      : await downloadRuntimeFile(runtimeContext, node.path, node.name)
    toast.success(
      translate(
        'auto.components.right.sidebar.FileExplorerRow.bce4d4e44f',
        "Downloaded '{{value0}}'",
        { value0: node.name }
      ),
      {
        action: {
          label: translate('auto.components.right.sidebar.FileExplorerRow.1a3df04ae1', 'Open'),
          onClick: () => {
            void shellClient.shell.openPath(result.destinationPath)
          }
        }
      }
    )
  } catch (error) {
    toast.error(
      extractRuntimeErrorMessage(
        error,
        translate(
          'auto.components.right.sidebar.FileExplorerRow.b3e288bf41',
          "Failed to download '{{value0}}'.",
          { value0: node.name }
        )
      )
    )
  }
}

export async function copyFileToOsClipboard(node: TreeNode): Promise<void> {
  const failureMessage = translate(
    'auto.components.right.sidebar.FileExplorerRow.b234ab25b4',
    'Could not copy the file to the clipboard'
  )
  try {
    const result = await shellClient.ui.writeClipboardFile(node.path)
    if (!result.ok) {
      toast.error(failureMessage)
    }
  } catch (error) {
    toast.error(extractRuntimeErrorMessage(error, failureMessage))
  }
}
