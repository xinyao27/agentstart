import type { GlobalSettings } from '@yiru/protocol/settings/global/model'
import { detectLanguage } from '~renderer/file-presentation/language-detect'
import { joinPath } from '~renderer/path'
import {
  createRuntimePath,
  deleteRuntimePath,
  runtimePathExists,
  writeRuntimeFile
} from '~renderer/runtime/file-client'

import {
  applyMarkdownTemplatePlaceholders,
  getMarkdownTemplateTitleForFileName,
  listMarkdownDocumentTemplates,
  readMarkdownDocumentTemplateContent,
  type MarkdownDocumentTemplate
} from './markdown-document-templates'
import { requestMarkdownTemplateSelection } from './markdown-template-picker-request'

export type UntitledMarkdownFileInfo = {
  filePath: string
  relativePath: string
  worktreeId: string
  language: string
  isUntitled: true
  deleteUntouchedOnClose?: boolean
  mode: 'edit'
}

type CreateUntitledMarkdownOptions = {
  template?: MarkdownDocumentTemplate
  now?: Date
}

export async function createUntitledMarkdownFile(
  worktreePath: string,
  worktreeId: string,
  connectionId?: string,
  settings?: Pick<GlobalSettings, 'activeRuntimeEnvironmentId'> | null,
  options: CreateUntitledMarkdownOptions = {}
): Promise<UntitledMarkdownFileInfo> {
  const baseName = 'untitled'
  const extension = '.md'
  const maxAttempts = 100
  const context = { settings, worktreeId, worktreePath, connectionId }
  const templateContent = options.template
    ? await readMarkdownDocumentTemplateContent(context, options.template)
    : null

  // Why: existence probing and exclusive creation must use the same runtime-aware
  // filesystem seam; another caller can still win between those operations.
  for (let attempt = 1; attempt <= maxAttempts; attempt += 1) {
    const fileName =
      attempt === 1 ? `${baseName}${extension}` : `${baseName}-${attempt}${extension}`
    const filePath = joinPath(worktreePath, fileName)
    if (await runtimePathExists(context, filePath)) {
      continue
    }

    try {
      await createRuntimePath(context, filePath, 'file')
      if (templateContent !== null) {
        try {
          await writeRuntimeFile(
            context,
            filePath,
            applyMarkdownTemplatePlaceholders(templateContent, {
              title: getMarkdownTemplateTitleForFileName(fileName),
              filename: fileName,
              now: options.now
            })
          )
        } catch (error) {
          await deleteRuntimePath(context, filePath).catch(() => undefined)
          throw error
        }
      }

      return {
        filePath,
        relativePath: fileName,
        worktreeId,
        language: detectLanguage(fileName),
        isUntitled: true,
        deleteUntouchedOnClose: templateContent === null ? undefined : false,
        mode: 'edit'
      }
    } catch (error) {
      const isExistingPath =
        error instanceof Error &&
        (error.message.includes('EEXIST') || error.message.includes('exists'))
      if (isExistingPath && attempt < maxAttempts) {
        continue
      }
      throw error
    }
  }

  throw new Error(`Unable to create untitled markdown file after ${maxAttempts} attempts.`)
}

export async function createUntitledMarkdownFileWithTemplateSelection(
  worktreePath: string,
  worktreeId: string,
  connectionId?: string,
  settings?: Pick<GlobalSettings, 'activeRuntimeEnvironmentId'> | null
): Promise<UntitledMarkdownFileInfo | null> {
  const context = { settings, worktreeId, worktreePath, connectionId }
  const templates = await listMarkdownDocumentTemplates(context, worktreePath)
  const selection = await requestMarkdownTemplateSelection(templates)
  if (selection.type === 'cancel') {
    return null
  }
  return createUntitledMarkdownFile(worktreePath, worktreeId, connectionId, settings, {
    template: selection.type === 'template' ? selection.template : undefined
  })
}
