export const TERMINAL_MULTIPLEX_CRC32C_POLYNOMIAL = 0x82f63b78

const CRC32C_TABLE = Array.from({ length: 256 }, (_, byte) => {
  let value = byte
  for (let bit = 0; bit < 8; bit += 1) {
    value = (value & 1) === 1 ? (value >>> 1) ^ TERMINAL_MULTIPLEX_CRC32C_POLYNOMIAL : value >>> 1
  }
  return value >>> 0
})

export function terminalMultiplexCrc32c(chunks: readonly Uint8Array<ArrayBufferLike>[]): number {
  let crc = 0xffffffff
  for (const chunk of chunks) {
    for (const byte of chunk) {
      crc = (crc >>> 8) ^ CRC32C_TABLE[(crc ^ byte) & 0xff]!
    }
  }
  return (crc ^ 0xffffffff) >>> 0
}
