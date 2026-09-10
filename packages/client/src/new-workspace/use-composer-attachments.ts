import { useRef, useState } from 'react'
import { toast } from 'sonner'
import { translate } from '~renderer/i18n/i18n'
import { joinPath } from '~renderer/path'
import { importExternalPathsToRuntime } from '~renderer/runtime/file-client'
import type { RuntimeFileOperationArgs } from '~renderer/runtime/file/context'
import { shellClient } from '~renderer/runtime/shell-client'

import {
  collectComposerDropUploadResult,
  shouldReportComposerDropUploadFailure
} from './composer-drop-upload-result'

type UseComposerAttachmentsOptions = {
  agentPrompt: string
  initialPaths: string[]
  selectedRepoPath: string | undefined
  selectedRepoSettings: RuntimeFileOperationArgs['settings']
  setAgentPrompt: (value: string) => void
}

export function useComposerAttachments({
  agentPrompt,
  initialPaths,
  selectedRepoPath,
  selectedRepoSettings,
  setAgentPrompt
}: UseComposerAttachmentsOptions) {
  const [attachmentPaths, setAttachmentPaths] = useState<string[]>(initialPaths)
  const promptTextareaRef = useRef<HTMLTextAreaElement | null>(null)
  const promptCaretFrameRef = useRef<number | null>(null)

  const cancelCaretFrame = (): void => {
    if (promptCaretFrameRef.current !== null) {
      cancelAnimationFrame(promptCaretFrameRef.current)
      promptCaretFrameRef.current = null
    }
  }

  const addAttachments = (paths: string[]): void => {
    setAttachmentPaths((current) => [
      ...current,
      ...paths.filter((pathValue) => !current.includes(pathValue))
    ])
  }

  const insertFolders = (folderPaths: string[]): void => {
    if (folderPaths.length === 0) {
      return
    }
    const formatPath = (pathValue: string): string =>
      /[\s"'$`\\()[\]{}*?!;&|<>#~]/.test(pathValue)
        ? `"${pathValue.replace(/(["\\$`])/g, '\\$1')}"`
        : pathValue
    const insertion = Array.from(new Set(folderPaths)).map(formatPath).join(' ')
    const textarea = promptTextareaRef.current
    const current = agentPrompt
    const selectionStart = textarea?.selectionStart ?? current.length
    const selectionEnd = textarea?.selectionEnd ?? current.length
    const before = current.slice(0, selectionStart)
    const after = current.slice(selectionEnd)
    const padded = `${before.length > 0 && !/\s$/.test(before) ? ' ' : ''}${insertion}${
      after.length > 0 && !/^\s/.test(after) ? ' ' : ''
    }`
    const caret = before.length + padded.length
    if (textarea) {
      cancelCaretFrame()
      promptCaretFrameRef.current = requestAnimationFrame(() => {
        promptCaretFrameRef.current = null
        if (promptTextareaRef.current === textarea && textarea.isConnected) {
          textarea.focus()
          textarea.setSelectionRange(caret, caret)
        }
      })
    }
    setAgentPrompt(before + padded + after)
  }

  const uploadPaths = async (
    sourcePaths: string[],
    settings = selectedRepoSettings,
    repoPath = selectedRepoPath,
    canReportFailure: () => boolean = () => true
  ): Promise<{ filePaths: string[]; folderPaths: string[] } | null> => {
    if (!settings?.activeRuntimeEnvironmentId?.trim()) {
      return null
    }
    if (!repoPath) {
      if (canReportFailure()) {
        toast.error(
          translate(
            'auto.hooks.useComposerState.3db83fc58a',
            'No project path is available on this host for attachments.'
          )
        )
      }
      return { filePaths: [], folderPaths: [] }
    }
    const { results } = await importExternalPathsToRuntime(
      { settings, worktreeId: repoPath, worktreePath: repoPath },
      sourcePaths,
      joinPath(repoPath, '.agentstart/drops'),
      { ensureDestinationDir: true }
    )
    const result = collectComposerDropUploadResult(results)
    if (shouldReportComposerDropUploadFailure(result, canReportFailure)) {
      toast.error(
        translate(
          'auto.hooks.useComposerState.a9ff236145',
          'Some attachments could not be uploaded.'
        )
      )
    }
    return { filePaths: result.filePaths, folderPaths: result.folderPaths }
  }

  const handleAddAttachment = async (): Promise<void> => {
    try {
      const selectedPath = await shellClient.shell.pickAttachment()
      if (!selectedPath) {
        return
      }
      const uploaded = await uploadPaths([selectedPath])
      if (uploaded) {
        addAttachments(uploaded.filePaths)
        insertFolders(uploaded.folderPaths)
      } else {
        addAttachments([selectedPath])
      }
    } catch (error) {
      toast.error(
        error instanceof Error
          ? error.message
          : translate(
              'auto.hooks.useComposerState.addAttachmentFailed',
              'Failed to add attachment.'
            )
      )
    }
  }

  return {
    attachmentPaths,
    handleAddAttachment,
    onComposerNodeChange: (node: HTMLDivElement | null): void => {
      if (!node) {
        cancelCaretFrame()
      }
    },
    promptTextareaRef,
    setAttachmentPaths
  }
}
