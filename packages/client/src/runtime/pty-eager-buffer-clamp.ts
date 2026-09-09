import { clampUtf8TextTail } from '@yiru/protocol/text/utf8-tail'

export type EagerBufferChunk = {
  data: string
  bytes: number
}

export function clampUtf8Tail(data: string, maxBytes: number): EagerBufferChunk {
  const tail = clampUtf8TextTail(data, maxBytes)
  return { data: tail.text, bytes: tail.bytes }
}
