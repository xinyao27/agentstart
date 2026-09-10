import type { ExecutionHostId } from '@agentstart/protocol/host/identity'
import React, { useState } from 'react'
import { translate } from '~renderer/i18n/i18n'
import { useAppStore } from '~renderer/store/state'
import { Button } from '~renderer/ui/button'
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle
} from '~renderer/ui/dialog'
import { Input } from '~renderer/ui/input'
import { Label } from '~renderer/ui/label'

import { applyHostRename, getHostDisplayLabelOverride } from './host-rename-remove'

type HostRenameDialogProps = {
  open: boolean
  onOpenChange: (open: boolean) => void
  hostId: ExecutionHostId
  /** The label the host shows by default, used as the placeholder and reset target. */
  derivedLabel: string
}

export function HostRenameDialog({
  open,
  onOpenChange,
  hostId,
  derivedLabel
}: HostRenameDialogProps): React.JSX.Element {
  const settings = useAppStore((s) => s.settings)
  const updateSettings = useAppStore((s) => s.updateSettings)
  const currentOverride = getHostDisplayLabelOverride(settings, hostId)
  const draftIdentity = open ? `${hostId}:${currentOverride ?? ''}` : ''
  const [draft, setDraft] = useState({ identity: '', value: '' })
  const value = draft.identity === draftIdentity ? draft.value : (currentOverride ?? '')
  const close = (): void => {
    setDraft({ identity: '', value: '' })
    onOpenChange(false)
  }

  const submit = (): void => {
    void updateSettings({ hostSettingOverrides: applyHostRename(settings, hostId, value) })
    close()
  }

  const reset = (): void => {
    setDraft({ identity: draftIdentity, value: '' })
    void updateSettings({ hostSettingOverrides: applyHostRename(settings, hostId, '') })
    close()
  }

  return (
    <Dialog open={open} onOpenChange={(nextOpen) => (nextOpen ? onOpenChange(true) : close())}>
      <DialogContent className="sm:max-w-md">
        <DialogHeader>
          <DialogTitle>
            {translate('auto.components.sidebar.HostRenameDialog.1a2b3c4d5e', 'Rename host')}
          </DialogTitle>
          <DialogDescription>
            {translate(
              'auto.components.sidebar.HostRenameDialog.2b3c4d5e6f',
              'This label is shown only on this computer. Leave it blank to use the default name.'
            )}
          </DialogDescription>
        </DialogHeader>
        <div className="space-y-2">
          <Label htmlFor="host-rename-input">
            {translate('auto.components.sidebar.HostRenameDialog.3c4d5e6f7a', 'Display name')}
          </Label>
          <Input
            id="host-rename-input"
            autoFocus
            value={value}
            placeholder={derivedLabel}
            onChange={(e) => setDraft({ identity: draftIdentity, value: e.target.value })}
            onKeyDown={(e) => {
              if (e.key === 'Enter') {
                e.preventDefault()
                submit()
              }
            }}
          />
        </div>
        <DialogFooter className="sm:justify-between">
          <Button type="button" variant="ghost" disabled={!currentOverride} onClick={reset}>
            {translate('auto.components.sidebar.HostRenameDialog.4d5e6f7a8b', 'Reset to default')}
          </Button>
          <div className="flex gap-2">
            <Button type="button" variant="outline" onClick={close}>
              {translate('auto.components.sidebar.HostRenameDialog.5e6f7a8b9c', 'Cancel')}
            </Button>
            <Button type="button" onClick={submit}>
              {translate('auto.components.sidebar.HostRenameDialog.6f7a8b9c0d', 'Save')}
            </Button>
          </div>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  )
}
