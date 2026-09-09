import type { MarkdownDocument } from '@yiru/protocol/files/values'
import { useEffect, useRef, useState } from 'react'
import type { MarkdownViewMode, OpenFile } from '~renderer/editor/state'
import { useEventCallback } from '~renderer/react/use-event-callback'
import { getConnectionId } from '~renderer/runtime/connection-context'
import { statRuntimePath } from '~renderer/runtime/file-client'
import { settingsForRuntimeOwner } from '~renderer/runtime/rpc-client'
import { useAppStore } from '~renderer/store/state'

import {
  createMarkdownDocumentIndex,
  getMarkdownDocLinkAnchor,
  resolveMarkdownDocLink
} from './markdown-doc-links'
import { requestSharedMarkdownDocumentList } from './markdown-document-list-request'
import { selectMarkdownDocumentWorktreePath } from './markdown-document-worktree-path-selector'

type OpenMarkdownDocumentOptions = {
  anchor?: string | null
}

export type UseMarkdownDocumentsResult = {
  markdownDocuments: MarkdownDocument[]
  openMarkdownDocument: (
    document: MarkdownDocument,
    options?: OpenMarkdownDocumentOptions
  ) => Promise<void>
  onOpenDocLink: (target: string) => void
  previewProps: {
    markdownDocuments: MarkdownDocument[]
    onOpenDocument: (
      document: MarkdownDocument,
      options?: OpenMarkdownDocumentOptions
    ) => Promise<void>
  }
  mdSave: (content: string) => Promise<void>
}

export function useMarkdownDocuments(
  activeFile: OpenFile,
  isMarkdown: boolean,
  viewMode: MarkdownViewMode,
  onSave: (content: string) => Promise<void>
): UseMarkdownDocumentsResult {
  const worktreeId = activeFile.worktreeId
  // Why: PTY activity replaces worktree metadata; only a routing-path change
  // should wake every mounted editor's document-link controller.
  const worktreePath = useAppStore((s) => selectMarkdownDocumentWorktreePath(s, worktreeId))
  const openFile = useAppStore((s) => s.openFile)
  const openMarkdownPreview = useAppStore((s) => s.openMarkdownPreview)
  const [markdownDocumentsByWorktree, setMarkdownDocumentsByWorktree] = useState<
    Record<string, MarkdownDocument[]>
  >({})
  const requestRef = useRef(0)

  const connectionId = getConnectionId(worktreeId)

  const refreshMarkdownDocuments = useEventCallback(async (requireFresh = false): Promise<void> => {
    if (!worktreeId || !worktreePath) {
      return
    }

    const requestId = requestRef.current + 1
    requestRef.current = requestId
    try {
      const documents = await requestSharedMarkdownDocumentList(
        {
          settings: settingsForRuntimeOwner(
            useAppStore.getState().settings,
            activeFile.runtimeEnvironmentId
          ),
          worktreeId,
          worktreePath,
          connectionId: connectionId ?? undefined
        },
        worktreePath,
        { requireFresh }
      )
      if (requestRef.current !== requestId) {
        return
      }
      setMarkdownDocumentsByWorktree((prev) => ({
        ...prev,
        [worktreeId]: documents
      }))
    } catch (err) {
      console.error('Failed to list markdown documents:', err)
      if (requestRef.current === requestId) {
        setMarkdownDocumentsByWorktree((prev) => ({
          ...prev,
          [worktreeId]: []
        }))
      }
    }
  })

  const openMarkdownDocument = async (
    document: MarkdownDocument,
    options: OpenMarkdownDocumentOptions = {}
  ): Promise<void> => {
    if (!worktreeId || !worktreePath) {
      return
    }
    try {
      const stats = await statRuntimePath(
        {
          settings: settingsForRuntimeOwner(
            useAppStore.getState().settings,
            activeFile.runtimeEnvironmentId
          ),
          worktreeId,
          worktreePath,
          connectionId: connectionId ?? undefined
        },
        document.filePath
      )
      if (stats.isDirectory) {
        await refreshMarkdownDocuments(true)
        return
      }
    } catch {
      await refreshMarkdownDocuments(true)
      return
    }

    if (options.anchor) {
      // Why: heading fragments are preview anchors, not filesystem paths.
      // Opening preview preserves Obsidian-style [[note#Heading]] navigation.
      openMarkdownPreview(
        {
          filePath: document.filePath,
          relativePath: document.relativePath,
          worktreeId,
          language: 'markdown',
          runtimeEnvironmentId: activeFile.runtimeEnvironmentId
        },
        { anchor: options.anchor }
      )
      return
    }

    openFile({
      filePath: document.filePath,
      relativePath: document.relativePath,
      worktreeId,
      language: 'markdown',
      runtimeEnvironmentId: activeFile.runtimeEnvironmentId,
      mode: 'edit'
    })
  }

  useEffect(() => {
    if (!isMarkdown) {
      return
    }
    void refreshMarkdownDocuments()
  }, [activeFile.id, isMarkdown, viewMode, refreshMarkdownDocuments])

  const markdownDocuments = (() =>
    worktreeId ? (markdownDocumentsByWorktree[worktreeId] ?? []) : [])()

  const previewProps = (() => ({ markdownDocuments, onOpenDocument: openMarkdownDocument }))()

  const mdSave = (content: string) => onSave(content).then(() => refreshMarkdownDocuments(true))

  const docIndex = (() => createMarkdownDocumentIndex(markdownDocuments))()

  const onOpenDocLink = (target: string) => {
    const resolution = resolveMarkdownDocLink(target, docIndex)
    if (resolution.status === 'resolved') {
      void openMarkdownDocument(resolution.document, {
        anchor: getMarkdownDocLinkAnchor(target)
      })
    }
  }

  return { markdownDocuments, openMarkdownDocument, onOpenDocLink, previewProps, mdSave }
}
