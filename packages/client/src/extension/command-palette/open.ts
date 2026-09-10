const OPEN_COMMAND_PALETTE_EVENT = 'agentstart:open-command-palette'

export function openCommandPalette(): void {
  window.dispatchEvent(new CustomEvent(OPEN_COMMAND_PALETTE_EVENT))
}

export function subscribeCommandPaletteOpen(listener: () => void): () => void {
  window.addEventListener(OPEN_COMMAND_PALETTE_EVENT, listener)
  return () => window.removeEventListener(OPEN_COMMAND_PALETTE_EVENT, listener)
}
