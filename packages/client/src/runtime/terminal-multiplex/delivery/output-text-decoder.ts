export type TerminalOutputDecodeResult = { ok: true; data: string } | { ok: false }

function createDecoder(): TextDecoder {
  return new TextDecoder('utf-8', { fatal: true })
}

/**
 * Decode the byte-contiguous terminal stream without treating transport frame
 * boundaries as UTF-8 boundaries. PTY reads may split one scalar across any
 * two output frames, so the decoder must retain an incomplete suffix.
 */
export class TerminalOutputTextDecoder {
  private decoder = createDecoder()

  decode(payload: Uint8Array<ArrayBufferLike>): TerminalOutputDecodeResult {
    try {
      return { ok: true, data: this.decoder.decode(payload, { stream: true }) }
    } catch {
      // Why: a fatal decoder's continuation state is no longer useful after
      // malformed input. Recovery will rebase from an authoritative snapshot.
      this.reset()
      return { ok: false }
    }
  }

  reset(): void {
    this.decoder = createDecoder()
  }
}
