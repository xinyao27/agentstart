import { translate } from '~renderer/i18n/i18n'

export function getTerminalImageDropRejectionMessage(): string {
  return translate(
    'auto.components.terminal.pane.terminal.drop.handler.imageDropNotImage',
    'Only image files can be dropped into the terminal.'
  )
}

export function formatTerminalImageDropSaveError(error: unknown): string {
  const detail = error instanceof Error ? error.message : String(error)
  return translate(
    'auto.components.terminal.pane.terminal.drop.handler.imageDropSaveFailed',
    'Dropping the image failed: {{detail}}',
    { detail }
  )
}
