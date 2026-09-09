import type { FilesClient } from '@yiru/protocol'
import { basename, joinPath, normalizeRelativePath } from '~renderer/path'

import { requireFilesTarget } from '../files-target'
import { getActiveRuntimeTarget } from '../rpc-client'
import { getRuntimeFileArgs, type RuntimeFileOperationArgs } from './context'
import { runtimePathExists } from './read'
import { shellFilesClient } from './shell-files'

type StagedRuntimeImportEntry =
  | { relativePath: string; kind: 'directory' }
  | { relativePath: string; kind: 'file'; contentBase64: string }

type StagedRuntimeImportSource =
  | {
      sourcePath: string
      status: 'staged'
      name: string
      kind: 'file' | 'directory'
      entries: StagedRuntimeImportEntry[]
    }
  | {
      sourcePath: string
      status: 'skipped'
      reason: 'missing' | 'symlink' | 'permission-denied' | 'unsupported'
    }
  | { sourcePath: string; status: 'failed'; reason: string }

type RuntimeImportResult =
  | {
      sourcePath: string
      status: 'imported'
      destPath: string
      kind: 'file' | 'directory'
      renamed: boolean
    }
  | {
      sourcePath: string
      status: 'skipped'
      reason: 'missing' | 'symlink' | 'permission-denied' | 'unsupported'
    }
  | { sourcePath: string; status: 'failed'; reason: string }

const RUNTIME_UPLOAD_BASE64_CHUNK_CHARS = 512 * 1024

export async function importExternalPathsToRuntime(
  context: RuntimeFileOperationArgs,
  sourcePaths: string[],
  destinationDir: string,
  _options?: { ensureDestinationDir?: boolean }
): Promise<{ results: RuntimeImportResult[] }> {
  const client = await requireFilesTarget(getActiveRuntimeTarget(context.settings))
  if (!context.worktreePath) {
    throw new Error('Import destination requires an owning runtime worktree')
  }
  const destinationArgs = getRuntimeFileArgs(context, destinationDir)
  if (!destinationArgs) {
    throw new Error('Destination is outside the active runtime worktree')
  }

  const staged = await shellFilesClient.stageExternalPathsForRuntimeUpload({ sourcePaths })
  const results: RuntimeImportResult[] = []
  const reservedNames = new Set<string>()
  await ensureRuntimeDirectory(context, destinationDir)

  for (const source of staged.sources as StagedRuntimeImportSource[]) {
    if (source.status !== 'staged') {
      results.push(source)
      continue
    }
    let createdDirectoryImportRoot: string | null = null
    try {
      const finalName = await deconflictRuntimeImportName(
        context,
        destinationDir,
        source.name,
        reservedNames
      )
      const destPath = joinPath(destinationDir, finalName)
      const destRelativePath = joinRuntimeRelativePath(destinationArgs.relativePath, finalName)
      for (const entry of source.entries) {
        const entryRelativePath = joinRuntimeRelativePath(destRelativePath, entry.relativePath)
        if (entry.kind === 'directory') {
          await client.createDirectoryNoClobber(
            destinationArgs.worktreeSelector,
            entryRelativePath,
            {
              timeoutMs: 15_000
            }
          )
          if (source.kind === 'directory' && entry.relativePath === '') {
            createdDirectoryImportRoot = entryRelativePath
          }
          continue
        }
        await uploadRuntimeFileWithoutClobber(
          client,
          destinationArgs.worktreeSelector,
          entryRelativePath,
          entry.contentBase64
        )
      }
      reservedNames.add(finalName)
      results.push({
        sourcePath: source.sourcePath,
        status: 'imported',
        destPath,
        kind: source.kind,
        renamed: finalName !== source.name
      })
    } catch (error) {
      if (createdDirectoryImportRoot) {
        // Why: match local imports by removing the no-clobber root when a
        // nested runtime upload fails halfway through.
        await client
          .delete(
            {
              worktree: destinationArgs.worktreeSelector,
              relativePath: createdDirectoryImportRoot,
              recursive: true
            },
            { timeoutMs: 15_000 }
          )
          .catch(() => {})
      }
      results.push({
        sourcePath: source.sourcePath,
        status: 'failed',
        reason: error instanceof Error ? error.message : String(error)
      })
    }
  }
  return { results }
}

async function uploadRuntimeFileWithoutClobber(
  client: FilesClient,
  worktreeSelector: string,
  relativePath: string,
  contentBase64: string
): Promise<void> {
  const tempRelativePath = makeRuntimeUploadTempPath(relativePath)
  try {
    await writeRuntimeBase64File(client, worktreeSelector, tempRelativePath, contentBase64)
    await client.commitUpload(
      { worktree: worktreeSelector, tempRelativePath, finalRelativePath: relativePath },
      { timeoutMs: 30_000 }
    )
  } finally {
    await client
      .delete(
        { worktree: worktreeSelector, relativePath: tempRelativePath, recursive: false },
        { timeoutMs: 15_000 }
      )
      .catch(() => {})
  }
}

async function writeRuntimeBase64File(
  client: FilesClient,
  worktreeSelector: string,
  relativePath: string,
  contentBase64: string
): Promise<void> {
  if (contentBase64.length <= RUNTIME_UPLOAD_BASE64_CHUNK_CHARS) {
    await client.writeBase64(
      { worktree: worktreeSelector, relativePath, contentBase64 },
      { timeoutMs: 30_000 }
    )
    return
  }
  for (let offset = 0; offset < contentBase64.length; offset += RUNTIME_UPLOAD_BASE64_CHUNK_CHARS) {
    await client.writeBase64Chunk(
      {
        worktree: worktreeSelector,
        relativePath,
        contentBase64: contentBase64.slice(offset, offset + RUNTIME_UPLOAD_BASE64_CHUNK_CHARS),
        append: offset > 0
      },
      { timeoutMs: 30_000 }
    )
  }
}

async function ensureRuntimeDirectory(
  context: RuntimeFileOperationArgs,
  destinationDir: string
): Promise<void> {
  const destinationArgs = getRuntimeFileArgs(context, destinationDir)
  if (!destinationArgs) {
    return
  }
  const client = await requireFilesTarget(destinationArgs.target)
  const parts = normalizeRelativePath(destinationArgs.relativePath)
    .split('/')
    .filter((part) => part.length > 0)
  let current = ''
  for (const part of parts) {
    current = joinRuntimeRelativePath(current, part)
    if (await runtimePathExists(context, joinPath(context.worktreePath ?? '', current))) {
      continue
    }
    await client.createDirectory(destinationArgs.worktreeSelector, current, { timeoutMs: 15_000 })
  }
}

async function deconflictRuntimeImportName(
  context: RuntimeFileOperationArgs,
  destinationDir: string,
  originalName: string,
  reservedNames: Set<string>
): Promise<string> {
  const available = async (name: string): Promise<boolean> =>
    !(await runtimePathExists(context, joinPath(destinationDir, name))) && !reservedNames.has(name)
  if (await available(originalName)) {
    return originalName
  }

  const dotIndex = originalName.lastIndexOf('.')
  const hasMeaningfulExt = dotIndex > 0
  const stem = hasMeaningfulExt ? originalName.slice(0, dotIndex) : originalName
  const ext = hasMeaningfulExt ? originalName.slice(dotIndex) : ''
  let candidate = `${stem} copy${ext}`
  if (await available(candidate)) {
    return candidate
  }
  for (let counter = 2; counter < 10000; counter += 1) {
    candidate = `${stem} copy ${counter}${ext}`
    if (await available(candidate)) {
      return candidate
    }
  }
  throw new Error(`Could not generate a unique name for '${basename(originalName)}'`)
}

function makeRuntimeUploadTempPath(relativePath: string): string {
  const normalized = normalizeRelativePath(relativePath)
  const slashIndex = normalized.lastIndexOf('/')
  const dir = slashIndex === -1 ? '' : normalized.slice(0, slashIndex + 1)
  const leaf = slashIndex === -1 ? normalized : normalized.slice(slashIndex + 1)
  const nonce = `${Date.now().toString(36)}-${Math.random().toString(36).slice(2)}`
  return `${dir}.${leaf}.yiru-upload-${nonce}`
}

function joinRuntimeRelativePath(basePath: string, relativePath: string): string {
  const base = normalizeRelativePath(basePath)
  const relative = normalizeRelativePath(relativePath)
  if (!base) {
    return relative
  }
  if (!relative) {
    return base
  }
  return `${base}/${relative}`
}
