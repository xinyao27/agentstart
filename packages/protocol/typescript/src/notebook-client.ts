import { create, fromBinary, toBinary } from '@bufbuild/protobuf'

import {
  NotebookService,
  NotebookServiceRunPythonCellRequestSchema,
  NotebookServiceRunPythonCellResponseSchema
} from '../generated/yiru/runtime/v1/notebook_pb.js'
import type { RuntimeCallOptions, RuntimeTransport } from './transport.js'

export const NOTEBOOK_PROTOCOL_CAPABILITY = 'notebook.protobuf.v1' as const

const RUN_PYTHON_CELL_PROCEDURE = `/${NotebookService.typeName}/${NotebookService.method.runPythonCell.name}`

export type NotebookRunPythonCellInput = Readonly<{
  filePath: string
  code: string
  preamble?: string
}>

export type NotebookCellRunResult = Readonly<{
  stdout: string
  stderr: string
  exitCode: number | null
  error?: string
}>

export class NotebookClient {
  private readonly transport: RuntimeTransport

  constructor(transport: RuntimeTransport) {
    this.transport = transport
  }

  async runPythonCell(
    input: NotebookRunPythonCellInput,
    options?: RuntimeCallOptions
  ): Promise<NotebookCellRunResult> {
    const response = await this.transport.unary({
      method: RUN_PYTHON_CELL_PROCEDURE,
      payload: toBinary(
        NotebookServiceRunPythonCellRequestSchema,
        create(NotebookServiceRunPythonCellRequestSchema, {
          code: input.code,
          filePath: input.filePath,
          // Why: the legacy surface treats an absent preamble as empty, which
          // is exactly proto3's zero value.
          preamble: input.preamble ?? ''
        })
      ),
      ...(options ? { options } : {})
    })
    const decoded = fromBinary(NotebookServiceRunPythonCellResponseSchema, response)
    return {
      stdout: decoded.stdout,
      stderr: decoded.stderr,
      // Why: exit_code is null when the process group was killed by a signal.
      exitCode: decoded.exitCode ?? null,
      ...(decoded.error === undefined ? {} : { error: decoded.error })
    }
  }
}
