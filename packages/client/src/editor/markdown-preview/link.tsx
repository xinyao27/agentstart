import type { MarkdownDocument } from '@agentstart/protocol/files/values'
import { relativePathInsideRoot } from '@agentstart/protocol/host/path'
import type { Worktree } from '@agentstart/protocol/worktree/model'
import type { MutableRefObject } from 'react'
import type { Components } from 'react-markdown'
import { toast } from 'sonner'
import { detectLanguage } from '~renderer/file-presentation/language-detect'
import { translate } from '~renderer/i18n/i18n'
import { getConnectionIdForFile } from '~renderer/runtime/connection-context'
import { statRuntimePath } from '~renderer/runtime/file-client'
import { settingsForRuntimeOwner } from '~renderer/runtime/rpc-client'
import { shellClient } from '~renderer/runtime/shell-client'
import { useAppStore } from '~renderer/store/state'
import { cn } from '~renderer/ui/class-names'

import { openHttpLink, type HttpLinkSourceOwner } from '../http-link-routing'
import { isLocalPathOpenBlocked, showLocalPathOpenBlockedToast } from '../local-path-open-guard'
import type { createMarkdownDocumentIndex } from '../markdown-doc-links'
import {
  getMarkdownDocLinkAnchor,
  parseMarkdownDocLinkHref,
  resolveMarkdownDocLink
} from '../markdown-doc-links'
import { absolutePathToFileUri, resolveMarkdownLinkTarget } from '../markdown-internal-links'
import {
  fileUrlToAbsolutePath,
  getMarkdownPreviewLinkTarget,
  isMarkdownPreviewSystemBrowserModifier,
  resolveMarkdownPreviewHref,
  resolveMarkdownPreviewHttpOpenOptions
} from './links'
import {
  cancelMarkdownPreviewEditorRevealFrames,
  parseMarkdownPreviewLineTarget as parseLineTarget,
  requestMarkdownPreviewEditorRevealFrame
} from './navigation'
import {
  findMarkdownPreviewOpenedEditFileId,
  findMarkdownPreviewTargetWorktree
} from './source-model'

type AppStoreState = ReturnType<typeof useAppStore.getState>

export type MarkdownPreviewLinkContext = {
  activateMarkdownLink: AppStoreState['activateMarkdownLink']
  filePath: string
  isMac: boolean
  markdownDocumentIndex: ReturnType<typeof createMarkdownDocumentIndex>
  onOpenDocument?: (
    document: MarkdownDocument,
    options?: { anchor?: string | null }
  ) => void | Promise<void>
  openFile: AppStoreState['openFile']
  openMarkdownPreview: AppStoreState['openMarkdownPreview']
  pendingEditorRevealFrameIdsRef: MutableRefObject<number[]>
  resolvedSourceRuntimeEnvironmentId: string | null | undefined
  scrollToAnchor: (anchor: string) => boolean
  setMarkdownViewMode: AppStoreState['setMarkdownViewMode']
  setPendingEditorReveal: AppStoreState['setPendingEditorReveal']
  sourceConnectionId: string | null | undefined
  sourceOwner: HttpLinkSourceOwner
  sourceRoutingWorktreeId: string | null
  sourceWorktree: Worktree | null
  worktreeRoot: string | null
  worktreesByRepo: Record<string, Worktree[]>
}

export function createMarkdownPreviewLink(
  context: MarkdownPreviewLinkContext
): NonNullable<Components['a']> {
  return ({ href, children, className, ...props }) => {
    const {
      activateMarkdownLink,
      filePath,
      isMac,
      markdownDocumentIndex,
      onOpenDocument,
      openFile,
      openMarkdownPreview,
      pendingEditorRevealFrameIdsRef,
      resolvedSourceRuntimeEnvironmentId,
      scrollToAnchor,
      setMarkdownViewMode,
      setPendingEditorReveal,
      sourceConnectionId,
      sourceOwner,
      sourceRoutingWorktreeId,
      sourceWorktree,
      worktreeRoot,
      worktreesByRepo
    } = context
    const docLinkTarget = parseMarkdownDocLinkHref(href)
    if (docLinkTarget !== null) {
      const resolution = resolveMarkdownDocLink(docLinkTarget, markdownDocumentIndex)
      const resolvedDocument = resolution.status === 'resolved' ? resolution.document : null
      const title =
        resolution.status === 'ambiguous' ? 'Document link is ambiguous' : 'Document not found'

      const handleDocLinkClick = (event: React.MouseEvent<HTMLAnchorElement>): void => {
        event.preventDefault()
        if (resolvedDocument && onOpenDocument) {
          void onOpenDocument(resolvedDocument, {
            anchor: getMarkdownDocLinkAnchor(docLinkTarget)
          })
        }
      }

      return (
        <a
          {...props}
          href={href}
          className={cn(
            'outline-none focus-visible:bg-accent',
            className,
            resolvedDocument ? 'markdown-doc-link' : 'markdown-doc-link-broken'
          )}
          title={resolvedDocument ? undefined : title}
          onClick={handleDocLinkClick}
        >
          {children}
        </a>
      )
    }

    const handleClick = async (event: React.MouseEvent<HTMLAnchorElement>): Promise<void> => {
      if (!href) {
        return
      }

      event.preventDefault()

      if (href.startsWith('#')) {
        void scrollToAnchor(href.slice(1))
        return
      }

      // Why: Cmd/Ctrl+Shift-click keeps both web and local file targets on
      // the OS path. Pre-check dangling in-worktree Markdown files so the
      // user sees a toast instead of shell.openFileUri's silent no-op.
      if (isMarkdownPreviewSystemBrowserModifier(event, isMac)) {
        if (sourceOwner.kind === 'unknown') {
          return
        }
        const osTarget = getMarkdownPreviewLinkTarget(href, filePath)
        if (!osTarget) {
          return
        }
        let parsed: URL
        try {
          parsed = new URL(osTarget)
        } catch {
          return
        }
        if (parsed.protocol === 'http:' || parsed.protocol === 'https:') {
          openHttpLink(parsed.toString(), {
            worktreeId: sourceRoutingWorktreeId,
            sourceOwner
          })
          return
        }
        if (parsed.protocol === 'file:') {
          if (
            isLocalPathOpenBlocked(
              settingsForRuntimeOwner(
                useAppStore.getState().settings,
                resolvedSourceRuntimeEnvironmentId
              ),
              { connectionId: sourceConnectionId }
            )
          ) {
            // Why: modifier-open delegates to the client OS. Server-local
            // file:// targets from remote runtime/SSH worktrees cannot be opened locally.
            showLocalPathOpenBlockedToast()
            return
          }
          const classified = resolveMarkdownLinkTarget(href, filePath, worktreeRoot)
          if (
            classified?.kind === 'markdown' ||
            (classified?.kind === 'file' && classified.line !== undefined)
          ) {
            // Why: use the classifier's stripped absolutePath (no `:line:col`
            // or `#L10` suffix) so the OS handler receives a clean file URI.
            const cleanUri = absolutePathToFileUri(classified.absolutePath)
            void shellClient.shell.pathExists(classified.absolutePath).then((exists) => {
              if (!exists) {
                toast.error(
                  translate(
                    'auto.components.editor.MarkdownPreview.6c043947ae',
                    'File not found: {{value0}}',
                    { value0: classified.relativePath ?? classified.absolutePath }
                  )
                )
                return
              }
              void shellClient.shell.openFileUri(cleanUri)
            })
            return
          }
          void shellClient.shell.openFileUri(parsed.toString())
        }
        return
      }

      const target = resolveMarkdownPreviewHref(href, filePath)
      if (!target) {
        return
      }

      if (target.protocol === 'http:' || target.protocol === 'https:') {
        // Why: every HTTP(S) activation uses the shared gesture rule,
        // including Browser tabs owned by a remote runtime.
        openHttpLink(
          target.toString(),
          resolveMarkdownPreviewHttpOpenOptions(event, sourceRoutingWorktreeId, sourceOwner)
        )
        return
      }

      if (target.protocol !== 'file:') {
        return
      }

      const classified = resolveMarkdownLinkTarget(href, filePath, worktreeRoot)
      const classifiedFileTarget =
        classified?.kind === 'markdown' || classified?.kind === 'file' ? classified : null
      const absolutePath = classifiedFileTarget?.absolutePath ?? fileUrlToAbsolutePath(target)
      if (!absolutePath) {
        return
      }
      const lineTarget =
        classifiedFileTarget?.line !== undefined
          ? { line: classifiedFileTarget.line, column: classifiedFileTarget.column }
          : parseLineTarget(target.hash)

      // Why: same-file anchors need no ownership/filesystem resolution (e.g.
      // `./README.md#heading` when this file is README.md). Run before the
      // unknown-ownership guard so ambiguous folder-workspace ownership still
      // scrolls within the open document.
      if (absolutePath === filePath && target.hash && !lineTarget) {
        void scrollToAnchor(target.hash.slice(1))
        return
      }

      if (sourceOwner.kind === 'unknown') {
        return
      }

      const targetWorktree = findMarkdownPreviewTargetWorktree(
        worktreesByRepo,
        absolutePath,
        sourceWorktree,
        sourceOwner
      )
      if (!targetWorktree) {
        if (sourceRoutingWorktreeId && worktreeRoot) {
          // Why: floating markdown files are owned by a synthetic workspace,
          // so there may be no repo worktree even though AgentStart can stat/open
          // links relative to the source file root.
          void activateMarkdownLink(href, {
            sourceFilePath: filePath,
            worktreeId: sourceRoutingWorktreeId,
            worktreeRoot,
            runtimeEnvironmentId: resolvedSourceRuntimeEnvironmentId,
            sourceOwner
          })
          return
        }
        if (
          isLocalPathOpenBlocked(
            settingsForRuntimeOwner(
              useAppStore.getState().settings,
              resolvedSourceRuntimeEnvironmentId
            ),
            { connectionId: sourceConnectionId }
          )
        ) {
          // Why: without a workspace match, opening a file URI delegates to
          // the client OS. Remote runtime/SSH paths are not local files.
          showLocalPathOpenBlockedToast()
          return
        }
        void shellClient.shell.openFileUri(target.toString())
        return
      }

      const relativePath = relativePathInsideRoot(targetWorktree.path, absolutePath)
      if (relativePath === null) {
        return
      }
      const language = detectLanguage(absolutePath)
      const targetConnectionId = getConnectionIdForFile(targetWorktree.id, absolutePath)
      if (targetConnectionId === undefined) {
        return
      }
      try {
        const stats = await statRuntimePath(
          {
            settings: settingsForRuntimeOwner(
              useAppStore.getState().settings,
              resolvedSourceRuntimeEnvironmentId
            ),
            worktreeId: targetWorktree.id,
            worktreePath: targetWorktree.path,
            connectionId: targetConnectionId ?? undefined
          },
          absolutePath
        )
        if (stats.isDirectory) {
          toast.error(
            translate(
              'auto.components.editor.MarkdownPreview.759463a221',
              'Cannot open directory: {{value0}}',
              { value0: relativePath }
            )
          )
          return
        }
      } catch {
        toast.error(
          translate(
            'auto.components.editor.MarkdownPreview.6c043947ae',
            'File not found: {{value0}}',
            { value0: relativePath }
          )
        )
        return
      }

      // Why: line targets like #L10 and path.ts:10 should reveal in Monaco,
      // not open a preview tab or a literal path with the suffix included.
      if (lineTarget) {
        openFile({
          filePath: absolutePath,
          relativePath,
          worktreeId: targetWorktree.id,
          runtimeEnvironmentId: resolvedSourceRuntimeEnvironmentId,
          language,
          mode: 'edit'
        })
        const openedState = useAppStore.getState()
        const targetFileId = findMarkdownPreviewOpenedEditFileId(
          openedState.openFiles,
          openedState.activeFileIdByWorktree,
          { filePath: absolutePath, worktreeId: targetWorktree.id }
        )
        if (language === 'markdown') {
          setMarkdownViewMode(targetFileId, 'source')
        }
        cancelMarkdownPreviewEditorRevealFrames(pendingEditorRevealFrameIdsRef)
        setPendingEditorReveal(null)
        requestMarkdownPreviewEditorRevealFrame(pendingEditorRevealFrameIdsRef, () => {
          requestMarkdownPreviewEditorRevealFrame(pendingEditorRevealFrameIdsRef, () => {
            setPendingEditorReveal({
              filePath: absolutePath,
              fileId: targetFileId,
              line: lineTarget.line,
              column: lineTarget.column ?? 1,
              matchLength: 0
            })
          })
        })
        return
      }

      if (language === 'markdown') {
        openMarkdownPreview(
          {
            filePath: absolutePath,
            relativePath,
            worktreeId: targetWorktree.id,
            runtimeEnvironmentId: resolvedSourceRuntimeEnvironmentId,
            language
          },
          { anchor: target.hash ? target.hash.slice(1) : null }
        )
        return
      }

      openFile({
        filePath: absolutePath,
        relativePath,
        worktreeId: targetWorktree.id,
        runtimeEnvironmentId: resolvedSourceRuntimeEnvironmentId,
        language,
        mode: 'edit'
      })
    }

    return (
      <a
        {...props}
        href={href}
        className={cn('outline-none focus-visible:bg-accent', className)}
        onClick={handleClick}
        style={{ cursor: 'pointer' }}
      >
        {children}
      </a>
    )
  }
}
