import { GitRefCategory } from '../../generated/yiru/runtime/v1/git_common_pb.js'
import type {
  GitCommitHistoryItem as ProtocolHistoryItem,
  GitHistoryServiceHistoryResponse as ProtocolHistoryResponse,
  GitRefEntry as ProtocolRefEntry
} from '../../generated/yiru/runtime/v1/git_history_pb.js'

export type GitHistoryRefCategory = 'head' | 'branches' | 'remote branches' | 'tags' | 'commits'
export type GitHistoryItemRef = {
  id: string
  name: string
  revision?: string
  category?: GitHistoryRefCategory
  remoteName?: string
  isCheckedOut?: boolean
}
export type GitHistoryItem = {
  id: string
  parentIds: string[]
  subject: string
  message: string
  displayId?: string
  author?: string
  authorEmail?: string
  timestamp?: number
  references?: GitHistoryItemRef[]
}
export type GitHistoryRefScope = 'head' | 'all'
export type GitHistoryOptions = {
  limit?: number
  baseRef?: string | null
  refScope?: GitHistoryRefScope
  includeRemoteBranches?: boolean
  skip?: number
}
export type GitHistoryResult = {
  items: GitHistoryItem[]
  currentRef?: GitHistoryItemRef
  remoteRef?: GitHistoryItemRef
  baseRef?: GitHistoryItemRef
  mergeBase?: string
  hasIncomingChanges: boolean
  hasOutgoingChanges: boolean
  hasMore: boolean
  limit: number
}

function historyRefCategoryFromProto(value: GitRefCategory): GitHistoryRefCategory | undefined {
  switch (value) {
    case GitRefCategory.BRANCH:
      return 'branches'
    case GitRefCategory.REMOTE_BRANCH:
      return 'remote branches'
    case GitRefCategory.TAG:
      return 'tags'
    case GitRefCategory.COMMIT:
      return 'commits'
    case GitRefCategory.HEAD:
      return 'head'
    default:
      return undefined
  }
}

function historyRefFromProto(ref: ProtocolRefEntry): GitHistoryItemRef {
  const category = historyRefCategoryFromProto(ref.category)
  return {
    id: ref.id,
    name: ref.name,
    ...(ref.revision ? { revision: ref.revision } : {}),
    ...(category ? { category } : {}),
    ...(ref.remoteName ? { remoteName: ref.remoteName } : {}),
    ...(ref.isCheckedOut !== undefined ? { isCheckedOut: ref.isCheckedOut } : {})
  }
}

function historyItemFromProto(item: ProtocolHistoryItem): GitHistoryItem {
  return {
    id: item.id,
    parentIds: item.parentIds,
    subject: item.subject,
    message: item.message,
    ...(item.displayId ? { displayId: item.displayId } : {}),
    ...(item.author ? { author: item.author } : {}),
    ...(item.authorEmail ? { authorEmail: item.authorEmail } : {}),
    ...(item.timestampMs !== undefined ? { timestamp: Number(item.timestampMs) } : {}),
    ...(item.references.length > 0 ? { references: item.references.map(historyRefFromProto) } : {})
  }
}

export function gitHistoryResultFromProto(response: ProtocolHistoryResponse): GitHistoryResult {
  return {
    items: response.items.map(historyItemFromProto),
    ...(response.currentRef ? { currentRef: historyRefFromProto(response.currentRef) } : {}),
    ...(response.remoteRef ? { remoteRef: historyRefFromProto(response.remoteRef) } : {}),
    ...(response.baseRef ? { baseRef: historyRefFromProto(response.baseRef) } : {}),
    ...(response.mergeBase ? { mergeBase: response.mergeBase } : {}),
    hasIncomingChanges: response.hasIncomingChanges,
    hasOutgoingChanges: response.hasOutgoingChanges,
    hasMore: response.hasMore,
    limit: response.limit
  }
}
