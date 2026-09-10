import type { Repo } from '@agentstart/protocol/project/repository'
import { isFolderRepo } from '@agentstart/protocol/project/repository'

import type { TreeNode } from './types'

export type AddProjectFromFolderModalData = {
  folderPath: string
}

export function canShowAddAsProjectAction(node: TreeNode, activeRepo: Repo | null): boolean {
  return node.isDirectory && Boolean(activeRepo && isFolderRepo(activeRepo))
}

export function buildAddProjectFromFolderModalData(node: TreeNode): AddProjectFromFolderModalData {
  return {
    folderPath: node.path
  }
}
