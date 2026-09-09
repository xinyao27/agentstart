import { create, fromBinary, toBinary } from '@bufbuild/protobuf'

import {
  FilesService,
  FilesServiceBrowseServerDirectoryRequestSchema,
  FilesServiceBrowseServerDirectoryResponseSchema,
  FilesServiceListAllRequestSchema,
  FilesServiceListAllResponseSchema,
  FilesServiceListMarkdownDocumentsRequestSchema,
  FilesServiceListMarkdownDocumentsResponseSchema,
  FilesServiceListRequestSchema,
  FilesServiceListResponseSchema,
  FilesServiceOpenDiffRequestSchema,
  FilesServiceOpenDiffResponseSchema,
  FilesServiceOpenRequestSchema,
  FilesServiceOpenResponseSchema,
  FilesServiceReadChunkRequestSchema,
  FilesServiceReadChunkResponseSchema,
  FilesServiceReadDirectoryRequestSchema,
  FilesServiceReadDirectoryResponseSchema,
  FilesServiceReadPreviewRequestSchema,
  FilesServiceReadPreviewResponseSchema,
  FilesServiceReadRequestSchema,
  FilesServiceReadResponseSchema,
  FilesServiceSearchPathsRequestSchema,
  FilesServiceSearchPathsResponseSchema,
  FilesServiceSearchRequestSchema,
  FilesServiceSearchResponseSchema,
  FilesServiceStatRequestSchema,
  FilesServiceStatResponseSchema
} from '../../generated/yiru/runtime/v1/files_pb.js'
import type { RuntimeCallOptions, RuntimeTransport } from '../transport.js'
import { bytesToBase64 } from './base64.js'
import {
  directoryEntry,
  fileListResult,
  fileOpenResult,
  filePreviewResult,
  fileReadResult,
  markdownDocument,
  searchFileResult,
  type DirectoryEntry,
  type FileListResult,
  type FileOpenResult,
  type FilePreviewResult,
  type FileReadChunkResult,
  type FileReadResult,
  type FileSearchInput,
  type FileSearchResult,
  type MarkdownDocument
} from './values.js'

const BROWSE_SERVER_DIRECTORY_PROCEDURE = `/${FilesService.typeName}/${FilesService.method.browseServerDirectory.name}`
const LIST_PROCEDURE = `/${FilesService.typeName}/${FilesService.method.list.name}`
const SEARCH_PATHS_PROCEDURE = `/${FilesService.typeName}/${FilesService.method.searchPaths.name}`
const LIST_ALL_PROCEDURE = `/${FilesService.typeName}/${FilesService.method.listAll.name}`
const LIST_MARKDOWN_DOCUMENTS_PROCEDURE = `/${FilesService.typeName}/${FilesService.method.listMarkdownDocuments.name}`
const OPEN_PROCEDURE = `/${FilesService.typeName}/${FilesService.method.open.name}`
const OPEN_DIFF_PROCEDURE = `/${FilesService.typeName}/${FilesService.method.openDiff.name}`
const READ_PROCEDURE = `/${FilesService.typeName}/${FilesService.method.read.name}`
const READ_CHUNK_PROCEDURE = `/${FilesService.typeName}/${FilesService.method.readChunk.name}`
const READ_DIRECTORY_PROCEDURE = `/${FilesService.typeName}/${FilesService.method.readDirectory.name}`
const READ_PREVIEW_PROCEDURE = `/${FilesService.typeName}/${FilesService.method.readPreview.name}`
const STAT_PROCEDURE = `/${FilesService.typeName}/${FilesService.method.stat.name}`
const SEARCH_PROCEDURE = `/${FilesService.typeName}/${FilesService.method.search.name}`

export function byteOffset(value: number): bigint {
  if (!Number.isSafeInteger(value) || value < 0) {
    throw new TypeError('Byte offset must be a nonnegative safe integer')
  }
  return BigInt(value)
}

export class FilesReadClient {
  protected readonly transport: RuntimeTransport

  constructor(transport: RuntimeTransport) {
    this.transport = transport
  }

  async browseServerDirectory(
    path: string,
    options?: RuntimeCallOptions
  ): Promise<{ entries: DirectoryEntry[]; resolvedPath: string }> {
    const response = await this.transport.unary({
      method: BROWSE_SERVER_DIRECTORY_PROCEDURE,
      payload: toBinary(
        FilesServiceBrowseServerDirectoryRequestSchema,
        create(FilesServiceBrowseServerDirectoryRequestSchema, { path })
      ),
      ...(options ? { options } : {})
    })
    const result = fromBinary(FilesServiceBrowseServerDirectoryResponseSchema, response)
    return { entries: result.entries.map(directoryEntry), resolvedPath: result.resolvedPath }
  }

  async list(worktree: string, options?: RuntimeCallOptions): Promise<FileListResult> {
    const response = await this.transport.unary({
      method: LIST_PROCEDURE,
      payload: toBinary(
        FilesServiceListRequestSchema,
        create(FilesServiceListRequestSchema, { worktree })
      ),
      ...(options ? { options } : {})
    })
    return fileListResult(fromBinary(FilesServiceListResponseSchema, response).result)
  }

  async searchPaths(
    input: Readonly<{ worktree: string; query: string; limit?: number }>,
    options?: RuntimeCallOptions
  ): Promise<FileListResult> {
    const response = await this.transport.unary({
      method: SEARCH_PATHS_PROCEDURE,
      payload: toBinary(
        FilesServiceSearchPathsRequestSchema,
        create(FilesServiceSearchPathsRequestSchema, {
          worktree: input.worktree,
          query: input.query,
          ...(input.limit === undefined ? {} : { limit: input.limit })
        })
      ),
      ...(options ? { options } : {})
    })
    return fileListResult(fromBinary(FilesServiceSearchPathsResponseSchema, response).result)
  }

  async listAll(
    input: Readonly<{ worktree: string; excludePaths?: readonly string[] }>,
    options?: RuntimeCallOptions
  ): Promise<string[]> {
    const response = await this.transport.unary({
      method: LIST_ALL_PROCEDURE,
      payload: toBinary(
        FilesServiceListAllRequestSchema,
        create(FilesServiceListAllRequestSchema, {
          worktree: input.worktree,
          excludePaths: [...(input.excludePaths ?? [])]
        })
      ),
      ...(options ? { options } : {})
    })
    return fromBinary(FilesServiceListAllResponseSchema, response).relativePaths
  }

  async listMarkdownDocuments(
    worktree: string,
    options?: RuntimeCallOptions
  ): Promise<MarkdownDocument[]> {
    const response = await this.transport.unary({
      method: LIST_MARKDOWN_DOCUMENTS_PROCEDURE,
      payload: toBinary(
        FilesServiceListMarkdownDocumentsRequestSchema,
        create(FilesServiceListMarkdownDocumentsRequestSchema, { worktree })
      ),
      ...(options ? { options } : {})
    })
    return fromBinary(FilesServiceListMarkdownDocumentsResponseSchema, response).documents.map(
      markdownDocument
    )
  }

  async open(
    worktree: string,
    relativePath: string,
    options?: RuntimeCallOptions
  ): Promise<FileOpenResult> {
    const response = await this.transport.unary({
      method: OPEN_PROCEDURE,
      payload: toBinary(
        FilesServiceOpenRequestSchema,
        create(FilesServiceOpenRequestSchema, { worktree, relativePath })
      ),
      ...(options ? { options } : {})
    })
    return fileOpenResult(fromBinary(FilesServiceOpenResponseSchema, response).result)
  }

  async openDiff(
    input: Readonly<{ worktree: string; relativePath: string; staged: boolean }>,
    options?: RuntimeCallOptions
  ): Promise<FileOpenResult> {
    const response = await this.transport.unary({
      method: OPEN_DIFF_PROCEDURE,
      payload: toBinary(
        FilesServiceOpenDiffRequestSchema,
        create(FilesServiceOpenDiffRequestSchema, input)
      ),
      ...(options ? { options } : {})
    })
    return fileOpenResult(fromBinary(FilesServiceOpenDiffResponseSchema, response).result)
  }

  async read(
    worktree: string,
    relativePath: string,
    options?: RuntimeCallOptions
  ): Promise<FileReadResult> {
    const response = await this.transport.unary({
      method: READ_PROCEDURE,
      payload: toBinary(
        FilesServiceReadRequestSchema,
        create(FilesServiceReadRequestSchema, { worktree, relativePath })
      ),
      ...(options ? { options } : {})
    })
    return fileReadResult(fromBinary(FilesServiceReadResponseSchema, response).result)
  }

  async readChunk(
    input: Readonly<{ worktree: string; relativePath: string; offset: number; length: number }>,
    options?: RuntimeCallOptions
  ): Promise<FileReadChunkResult> {
    const response = await this.transport.unary({
      method: READ_CHUNK_PROCEDURE,
      payload: toBinary(
        FilesServiceReadChunkRequestSchema,
        create(FilesServiceReadChunkRequestSchema, {
          worktree: input.worktree,
          relativePath: input.relativePath,
          offset: byteOffset(input.offset),
          length: input.length
        })
      ),
      ...(options ? { options } : {})
    })
    const result = fromBinary(FilesServiceReadChunkResponseSchema, response)
    return {
      contentBase64: bytesToBase64(result.content),
      bytesRead: result.bytesRead,
      eof: result.eof
    }
  }

  async readDirectory(
    worktree: string,
    relativePath: string,
    options?: RuntimeCallOptions
  ): Promise<DirectoryEntry[]> {
    const response = await this.transport.unary({
      method: READ_DIRECTORY_PROCEDURE,
      payload: toBinary(
        FilesServiceReadDirectoryRequestSchema,
        create(FilesServiceReadDirectoryRequestSchema, { worktree, relativePath })
      ),
      ...(options ? { options } : {})
    })
    return fromBinary(FilesServiceReadDirectoryResponseSchema, response).entries.map(directoryEntry)
  }

  async readPreview(
    worktree: string,
    relativePath: string,
    options?: RuntimeCallOptions
  ): Promise<FilePreviewResult> {
    const response = await this.transport.unary({
      method: READ_PREVIEW_PROCEDURE,
      payload: toBinary(
        FilesServiceReadPreviewRequestSchema,
        create(FilesServiceReadPreviewRequestSchema, { worktree, relativePath })
      ),
      ...(options ? { options } : {})
    })
    return filePreviewResult(fromBinary(FilesServiceReadPreviewResponseSchema, response).result)
  }

  async stat(
    worktree: string,
    relativePath: string,
    options?: RuntimeCallOptions
  ): Promise<{ isDirectory: boolean; mtime: number; size: number }> {
    const response = await this.transport.unary({
      method: STAT_PROCEDURE,
      payload: toBinary(
        FilesServiceStatRequestSchema,
        create(FilesServiceStatRequestSchema, { worktree, relativePath })
      ),
      ...(options ? { options } : {})
    })
    const result = fromBinary(FilesServiceStatResponseSchema, response)
    return { isDirectory: result.isDirectory, mtime: result.mtime, size: Number(result.size) }
  }

  async search(input: FileSearchInput, options?: RuntimeCallOptions): Promise<FileSearchResult> {
    const response = await this.transport.unary({
      method: SEARCH_PROCEDURE,
      payload: toBinary(
        FilesServiceSearchRequestSchema,
        create(FilesServiceSearchRequestSchema, input)
      ),
      ...(options ? { options } : {})
    })
    const result = fromBinary(FilesServiceSearchResponseSchema, response)
    return {
      files: result.files.map(searchFileResult),
      totalMatches: result.totalMatches,
      truncated: result.truncated
    }
  }
}
