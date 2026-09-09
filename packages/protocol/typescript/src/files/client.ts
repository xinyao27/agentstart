import type { RuntimeTransport } from '../transport.js'
import { FilesWatchClient } from './watch-client.js'

export const FILES_PROTOCOL_CAPABILITY = 'files.protobuf.v1' as const

export class FilesClient extends FilesWatchClient {
  constructor(transport: RuntimeTransport) {
    super(transport)
  }
}
