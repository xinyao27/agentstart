import { useMutation, useQueryClient } from '@tanstack/react-query'
import { useState } from 'react'
import { translate } from '~renderer/i18n/i18n'
import { CheckCircle, Crosshair } from '~renderer/icons/hugeicons'
import { terminalQueryRoot } from '~renderer/runtime/terminal-query'
import { Button } from '~renderer/ui/button'

import { openBrowserWritebackTarget } from '../../runtime/browser-writeback-target'
import { getExtensionBrowserCapabilities } from '../browser-capabilities'
import { WORKSPACE_EVENTS_QUERY_ROOT } from '../runtime/queries'
import { isEyeDropperCancellation } from './eye-dropper-cancellation'

type ColorWritebackProps = {
  projectId: string
  worktreeId: string
}

export function ColorWriteback({ projectId, worktreeId }: ColorWritebackProps): React.JSX.Element {
  const capabilities = getExtensionBrowserCapabilities()
  const queryClient = useQueryClient()
  const [pickedColor, setPickedColor] = useState<string | null>(null)
  const writeback = useMutation({
    mutationFn: async () => {
      await capabilities.prepareLongRunningAgent()
      const color = await capabilities.pickColor().catch((error: unknown) => {
        if (isEyeDropperCancellation(error)) {
          return null
        }
        throw error
      })
      if (!color) {
        return null
      }
      setPickedColor(color)
      const client = await openBrowserWritebackTarget()
      if (!client) {
        throw new Error('browser_writeback_protocol_unavailable')
      }
      return client.applyColor({
        color,
        intent: 'Color picked from the current browser view',
        target: { projectId, worktreeId }
      })
    },
    onSuccess: async (result) => {
      if (!result) {
        return
      }
      await Promise.all([
        queryClient.invalidateQueries({ queryKey: terminalQueryRoot({ kind: 'local' }) }),
        queryClient.invalidateQueries({ queryKey: WORKSPACE_EVENTS_QUERY_ROOT })
      ])
    }
  })
  return (
    <div className="border-sidebar-border ml-6 border-l px-2 py-1.5">
      <Button
        type="button"
        size="xs"
        variant="outline"
        disabled={writeback.isPending}
        onClick={() => writeback.mutate()}
      >
        {writeback.data ? <CheckCircle /> : <Crosshair />}
        {writeback.isPending
          ? translate('extension.eyeDropper.applying', 'Adding token…')
          : translate('extension.eyeDropper.pick', 'Pick color for design tokens')}
      </Button>
      {pickedColor ? (
        <p className="text-muted-foreground pt-1 font-mono text-xs">
          {translate('extension.eyeDropper.picked', 'Picked {{color}}', { color: pickedColor })}
        </p>
      ) : null}
      {writeback.isError ? (
        <p className="text-destructive pt-1 text-xs">
          {translate(
            'extension.eyeDropper.failed',
            'EyeDropper is unavailable or the agent could not start.'
          )}
        </p>
      ) : null}
    </div>
  )
}
