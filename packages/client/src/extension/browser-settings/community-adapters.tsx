import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query'
import { useActionState } from 'react'
import { translate } from '~renderer/i18n/i18n'
import { Button } from '~renderer/ui/button'
import { Input } from '~renderer/ui/input'
import { Textarea } from '~renderer/ui/textarea'

import { getExtensionBrowserCapabilities, type CommunityAdapter } from '../browser-capabilities'

const COMMUNITY_ADAPTERS_QUERY_KEY = ['extension-host', 'community-adapters'] as const
type AdapterState = { kind: 'idle' | 'error' }

export function CommunityAdaptersSettings(): React.JSX.Element {
  const capabilities = getExtensionBrowserCapabilities()
  const queryClient = useQueryClient()
  const adapters = useQuery({
    queryFn: capabilities.readCommunityAdapters,
    queryKey: COMMUNITY_ADAPTERS_QUERY_KEY
  })
  const remove = useMutation({
    mutationFn: capabilities.removeCommunityAdapter,
    onSuccess: async () => queryClient.invalidateQueries({ queryKey: COMMUNITY_ADAPTERS_QUERY_KEY })
  })
  const [state, saveAction, isSaving] = useActionState<AdapterState, FormData>(
    async (_current, formData) => {
      const name = formData.get('adapter-name')
      const match = formData.get('adapter-match')
      const code = formData.get('adapter-code')
      if (typeof name !== 'string' || typeof match !== 'string' || typeof code !== 'string') {
        return { kind: 'error' }
      }
      try {
        await capabilities.saveCommunityAdapter({ code, match, name })
        await queryClient.invalidateQueries({ queryKey: COMMUNITY_ADAPTERS_QUERY_KEY })
        return { kind: 'idle' }
      } catch {
        return { kind: 'error' }
      }
    },
    { kind: 'idle' }
  )

  return (
    <section className="border-border mt-5 border p-4">
      <h2 className="font-medium">
        {translate('extension.settings.adapters', 'Community site adapters')}
      </h2>
      <p className="text-muted-foreground mt-1 text-sm">
        {translate(
          'extension.settings.adaptersDescription',
          'Reviewable scripts run in Chrome’s isolated user-script world. They may add bounded context through document.documentElement.dataset.agentstartContext, but never choose a project or execute an agent action.'
        )}
      </p>
      {adapters.isPending ? (
        <p className="text-muted-foreground mt-3 text-sm" role="status">
          {translate('extension.browserSettings.loadingAdapters', 'Loading site adapters…')}
        </p>
      ) : adapters.data?.disabled ? (
        <p className="text-muted-foreground mt-3 text-sm">
          {translate('extension.settings.adaptersManaged', 'Disabled by enterprise policy.')}
        </p>
      ) : (
        <form action={saveAction} className="mt-4 grid gap-3">
          <label className="grid gap-1 text-sm">
            <span>{translate('extension.settings.adapterName', 'Adapter name')}</span>
            <Input maxLength={100} name="adapter-name" required />
          </label>
          <label className="grid gap-1 text-sm">
            <span>{translate('extension.settings.adapterMatch', 'Exact site match')}</span>
            <Input
              autoComplete="off"
              name="adapter-match"
              placeholder={translate(
                'extension.settings.adapterMatchPlaceholder',
                'https://jira.example.com/*'
              )}
              required
              type="text"
            />
          </label>
          <label className="grid gap-1 text-sm">
            <span>{translate('extension.settings.adapterCode', 'Reviewed JavaScript')}</span>
            <Textarea
              name="adapter-code"
              placeholder={translate(
                'extension.settings.adapterCodePlaceholder',
                'document.documentElement.dataset.agentstartContext = document.title'
              )}
              required
              spellCheck={false}
            />
          </label>
          <div className="flex flex-wrap gap-2">
            <Button disabled={isSaving} type="submit">
              {translate('extension.settings.installAdapter', 'Review and install')}
            </Button>
            <Button
              onClick={() => void capabilities.openUserScriptsSettings()}
              type="button"
              variant="outline"
            >
              {translate('extension.settings.userScriptsToggle', 'Open Chrome permission toggle')}
            </Button>
          </div>
        </form>
      )}
      {state.kind === 'error' || adapters.isError || remove.isError ? (
        <p className="text-destructive mt-3 text-sm" role="alert">
          {translate(
            'extension.settings.adapterFailed',
            'Nothing was installed. Use one exact HTTP(S) origin ending in /*, grant access, and enable Chrome’s Allow User Scripts toggle.'
          )}
        </p>
      ) : null}
      <div className="mt-4 grid gap-2">
        {adapters.data?.adapters.map((adapter) => (
          <InstalledAdapter
            adapter={adapter}
            disabled={remove.isPending}
            key={adapter.id}
            onRemove={(id) => remove.mutate(id)}
          />
        ))}
      </div>
    </section>
  )
}

function InstalledAdapter({
  adapter,
  disabled,
  onRemove
}: {
  adapter: CommunityAdapter
  disabled: boolean
  onRemove: (id: string) => void
}): React.JSX.Element {
  return (
    <details className="border-border border p-3">
      <summary className="cursor-pointer text-sm font-medium">{adapter.name}</summary>
      <p className="text-muted-foreground mt-2 text-xs">{adapter.match}</p>
      <pre className="border-border mt-2 max-h-40 overflow-auto border p-2 text-xs whitespace-pre-wrap">
        {adapter.code}
      </pre>
      <Button
        className="mt-2"
        disabled={disabled}
        onClick={() => onRemove(adapter.id)}
        size="xs"
        type="button"
        variant="outline"
      >
        {translate('extension.settings.removeAdapter', 'Remove adapter')}
      </Button>
    </details>
  )
}
