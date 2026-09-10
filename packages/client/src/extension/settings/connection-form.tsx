import { useActionState } from 'react'
import { translate } from '~renderer/i18n/i18n'
import { Button } from '~renderer/ui/button'
import { Input } from '~renderer/ui/input'

export type DaemonConnectionSettings = {
  authToken: string
  endpoint: string
  protocolVersion: number
}

type SaveState = { kind: 'idle' | 'saved' | 'error' }

export type DaemonConnectionFormProps = {
  initialSettings: DaemonConnectionSettings
  onReset: () => Promise<void>
  onSave: (settings: DaemonConnectionSettings) => Promise<void>
  savedMessage: string
}

export function DaemonConnectionForm({
  initialSettings,
  onReset,
  onSave,
  savedMessage
}: DaemonConnectionFormProps): React.JSX.Element {
  const [state, saveAction, isSaving] = useActionState<SaveState, FormData>(
    async (_current, formData) => {
      const endpoint = formData.get('endpoint')
      const authToken = formData.get('auth-token')
      const protocolVersion = Number(formData.get('protocol-version'))
      if (
        typeof endpoint !== 'string' ||
        typeof authToken !== 'string' ||
        !Number.isInteger(protocolVersion)
      ) {
        return { kind: 'error' }
      }
      try {
        await onSave({ authToken, endpoint, protocolVersion })
        return { kind: 'saved' }
      } catch {
        return { kind: 'error' }
      }
    },
    { kind: 'idle' }
  )

  return (
    <>
      <form action={saveAction} className="mt-5 grid gap-4">
        <label className="grid gap-1 text-sm">
          <span>{translate('extension.settings.endpoint', 'WebSocket endpoint')}</span>
          <Input
            name="endpoint"
            defaultValue={initialSettings.endpoint}
            placeholder={translate(
              'extension.settings.endpointPlaceholder',
              'wss://host.example/rpc'
            )}
            autoComplete="off"
          />
        </label>
        <label className="grid gap-1 text-sm">
          <span>{translate('extension.settings.token', 'Access token')}</span>
          <Input
            name="auth-token"
            type="password"
            defaultValue={initialSettings.authToken}
            autoComplete="off"
          />
        </label>
        <label className="grid gap-1 text-sm">
          <span>{translate('extension.settings.protocolVersion', 'Protocol version')}</span>
          <Input
            name="protocol-version"
            inputMode="numeric"
            defaultValue={String(initialSettings.protocolVersion)}
          />
        </label>
        <div className="flex gap-2">
          <Button type="submit" disabled={isSaving}>
            {translate('extension.settings.save', 'Save connection')}
          </Button>
          <Button type="button" variant="outline" onClick={() => void onReset()}>
            {translate('extension.settings.useLocal', 'Use local daemon')}
          </Button>
        </div>
      </form>
      {state.kind === 'saved' ? (
        <p className="text-muted-foreground mt-3 text-sm">{savedMessage}</p>
      ) : null}
      {state.kind === 'error' ? (
        <p className="text-destructive mt-3 text-sm">
          {translate(
            'extension.settings.invalid',
            'Enter a ws:// or wss:// endpoint, a token, and a positive protocol version.'
          )}
        </p>
      ) : null}
    </>
  )
}
