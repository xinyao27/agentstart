import type { GlobalSettings } from '@yiru/protocol/settings/global/model'
import { useEffect, useState } from 'react'
import { toast } from 'sonner'
import { useNow } from '~renderer/dashboard/use-now'
import { openHttpLink } from '~renderer/editor/http-link-routing'
import { translate } from '~renderer/i18n/i18n'
import {
  ArrowSquareOut as ExternalLink,
  Question as HelpCircle,
  Lock,
  LockOpen,
  ShieldCheck
} from '~renderer/icons/hugeicons'
import { LoadingIndicator } from '~renderer/loading/indicator'
import { shellClient } from '~renderer/runtime/shell-client'
import { useAppStore } from '~renderer/store/state'
import { cn } from '~renderer/ui/class-names'

import { MiniMaxIcon } from '../status-bar/icons'
import { Badge } from '../ui/badge'
import { Button } from '../ui/button'
import { Input } from '../ui/input'
import { Label } from '../ui/label'
import { Popover, PopoverContent, PopoverTrigger } from '../ui/popover'
import { SearchableSetting } from './searchable-setting'

const MINIMAX_CONSOLE_URL = 'https://platform.minimax.io/console/usage'

type MiniMaxAccountsSectionProps = {
  settings: GlobalSettings
  updateSettings: (updates: Partial<GlobalSettings>) => void
}

function formatRelativeRefresh(updatedAt: number, now: number): string {
  const diffMs = Math.max(0, now - updatedAt)
  if (diffMs < 60_000) {
    return translate('auto.components.settings.AccountsPane.3a30aaf526', 'just now')
  }
  const formatter = new Intl.RelativeTimeFormat(undefined, { numeric: 'auto' })
  const minutes = Math.round(diffMs / 60_000)
  if (minutes < 60) {
    return formatter.format(-minutes, 'minute')
  }
  const hours = Math.round(minutes / 60)
  if (hours < 24) {
    return formatter.format(-hours, 'hour')
  }
  return formatter.format(-Math.round(hours / 24), 'day')
}

function CookieHelpPopover(): React.JSX.Element {
  const steps = [
    translate(
      'auto.components.settings.AccountsPane.f5d8d2a6a1',
      'Open platform.minimax.io/console/usage in your browser and sign in.'
    ),
    translate('auto.components.settings.AccountsPane.24560fe830', 'Open DevTools.'),
    translate(
      'auto.components.settings.AccountsPane.4cab0fa42d',
      'Go to the Network tab and enable Preserve log.'
    ),
    translate('auto.components.settings.AccountsPane.bee4e63e1c', 'Reload the page.'),
    translate(
      'auto.components.settings.AccountsPane.87f814af6f',
      'Filter for remains and select the coding_plan/remains request.'
    ),
    translate(
      'auto.components.settings.AccountsPane.435df0ee51',
      'Under Request Headers, copy the Cookie value.'
    ),
    translate('auto.components.settings.AccountsPane.7492fb3bba', 'Paste it here and click Save.')
  ]
  return (
    <div className="space-y-3 p-3 text-xs">
      <div className="space-y-1">
        <p className="font-medium">
          {translate('auto.components.settings.AccountsPane.9fec52de4b', 'How to copy the cookie')}
        </p>
        <p className="text-muted-foreground">
          {translate(
            'auto.components.settings.AccountsPane.4e32e030b2',
            'Stored locally. Yiru sends it only to platform.minimax.io for usage refreshes.'
          )}
        </p>
      </div>
      <ol className="text-muted-foreground list-decimal space-y-1 pl-4">
        {steps.map((step) => (
          <li key={step}>{step}</li>
        ))}
      </ol>
    </div>
  )
}

export function MiniMaxAccountsSection({
  settings,
  updateSettings
}: MiniMaxAccountsSectionProps): React.JSX.Element {
  const now = useNow(30_000)
  const limits = useAppStore((state) => state.rateLimits.minimax)
  const recordFeatureInteraction = useAppStore((state) => state.recordFeatureInteraction)
  const [cookieDraft, setCookieDraft] = useState('')
  const [isConfigured, setIsConfigured] = useState(false)
  const [isBusy, setIsBusy] = useState(false)

  useEffect(() => {
    void shellClient.minimaxCredentials
      .getStatus()
      .then((status) => setIsConfigured(status.configured))
      .catch((error: unknown) => {
        console.error('Failed to load MiniMax credential status:', error)
      })
  }, [])

  const updateCookie = async (operation: 'save' | 'clear'): Promise<void> => {
    if (operation === 'save' && !cookieDraft.trim()) {
      toast.error(
        translate('auto.components.settings.AccountsPane.2f24f244a4', 'MiniMax cookie is required.')
      )
      return
    }
    setIsBusy(true)
    try {
      const status =
        operation === 'save'
          ? await shellClient.minimaxCredentials.saveCookie(cookieDraft.trim())
          : await shellClient.minimaxCredentials.clearCookie()
      if (operation === 'save' && !status.configured) {
        throw new Error(
          translate(
            'auto.components.settings.AccountsPane.8e6f0cb1d8',
            'MiniMax cookie was not saved.'
          )
        )
      }
      setIsConfigured(status.configured)
      setCookieDraft('')
      recordFeatureInteraction('usage-tracking')
      if (operation === 'save') {
        toast.success(
          translate('auto.components.settings.AccountsPane.8d61637a77', 'MiniMax cookie saved.')
        )
      }
    } catch (error) {
      toast.error(
        translate(
          'auto.components.settings.AccountsPane.b43e761fe5',
          'MiniMax cookie update failed.'
        ),
        { description: String((error as Error)?.message ?? error) }
      )
    } finally {
      setIsBusy(false)
    }
  }

  return (
    <section id="accounts-minimax" className="scroll-mt-6 space-y-4">
      <div className="flex items-start justify-between gap-3">
        <div className="space-y-1">
          <h3 className="flex items-center gap-2 text-sm font-semibold">
            <MiniMaxIcon size={16} />
            {translate('auto.components.settings.AccountsPane.5d63bbfbec', 'MiniMax')}
          </h3>
          <p className="text-muted-foreground text-xs">
            {translate(
              'auto.components.settings.AccountsPane.15e831350e',
              'Configure MiniMax usage tracking from platform.minimax.io.'
            )}
          </p>
        </div>
        <a
          href={MINIMAX_CONSOLE_URL}
          target="_blank"
          rel="noopener noreferrer"
          onClick={(event) => {
            event.preventDefault()
            openHttpLink(MINIMAX_CONSOLE_URL, { event })
          }}
          className="text-muted-foreground hover:text-foreground focus-visible:text-foreground focus-visible:bg-accent inline-flex items-center gap-1 text-xs outline-none"
        >
          {translate('auto.components.settings.AccountsPane.0d8e77bc40', 'Open console')}
          <ExternalLink className="size-3" />
        </a>
      </div>
      <div
        className={cn(
          'flex items-start gap-3 border bg-muted/20 p-3',
          isConfigured ? 'border-border/60' : 'border-border/40'
        )}
      >
        <ShieldCheck
          className={cn(
            'mt-0.5 size-4 shrink-0',
            isConfigured ? 'text-foreground' : 'text-muted-foreground'
          )}
        />
        <div className="space-y-0.5">
          <p className="text-xs font-medium">
            {isConfigured
              ? translate('auto.components.settings.AccountsPane.0b8c1c7e02', 'Stored locally')
              : translate('auto.components.settings.AccountsPane.1fd1b1b6b4', 'Cookie not set')}
          </p>
          <p className="text-muted-foreground text-xs">
            {translate(
              'auto.components.settings.AccountsPane.5e08b0fe57',
              'Stored locally and sent only to platform.minimax.io for usage refreshes.'
            )}
          </p>
        </div>
      </div>
      <SearchableSetting
        title={translate(
          'auto.components.settings.AccountsPane.21d6eb141e',
          'MiniMax Session Cookie'
        )}
        description={translate(
          'auto.components.settings.AccountsPane.33bba5ad83',
          'Paste your MiniMax session cookie for local rate-limit fetching.'
        )}
        keywords={['minimax', 'cookie', 'session', 'rate limit', 'status bar']}
        className="space-y-2"
      >
        <div className="flex items-center justify-between gap-2">
          <div className="flex items-center gap-2">
            <Label>
              {translate(
                'auto.components.settings.AccountsPane.21d6eb141e',
                'MiniMax Session Cookie'
              )}
            </Label>
            <Badge
              variant={isConfigured ? 'secondary' : 'outline'}
              className="text-muted-foreground h-5 gap-1 px-2 text-[10px] font-medium"
            >
              {isConfigured ? <Lock className="size-3" /> : <LockOpen className="size-3" />}
              {isConfigured
                ? translate('auto.components.settings.AccountsPane.73ea15f24b', 'Saved')
                : translate('auto.components.settings.AccountsPane.23afe8f226', 'Not saved')}
            </Badge>
          </div>
          <Popover>
            <PopoverTrigger
              render={
                <Button variant="quiet" size="xs" className="h-6 gap-1 px-2 text-xs">
                  <HelpCircle className="size-3" />
                  {translate('auto.components.settings.AccountsPane.43d7a45b97', 'How to copy')}
                </Button>
              }
            />
            <PopoverContent align="end" side="bottom" sideOffset={6} className="w-80 p-0">
              <CookieHelpPopover />
            </PopoverContent>
          </Popover>
        </div>
        <div className="flex gap-2">
          <Input
            type="password"
            value={cookieDraft}
            onChange={(event) => setCookieDraft(event.target.value)}
            placeholder={translate(
              'auto.components.settings.AccountsPane.b8a4f21c3e',
              'Paste the Cookie header from DevTools'
            )}
            spellCheck={false}
            className="flex-1 text-xs"
          />
          <Button
            size="xs"
            onClick={() => void updateCookie('save')}
            disabled={isBusy || !cookieDraft.trim()}
            className="h-7 shrink-0 text-xs"
          >
            {isBusy ? <LoadingIndicator className="size-3" /> : null}
            {isConfigured
              ? translate('auto.components.settings.AccountsPane.f38b9cc4bd', 'Replace')
              : translate('auto.components.settings.AccountsPane.590a3130f9', 'Save')}
          </Button>
          {isConfigured ? (
            <Button
              variant="quiet"
              size="xs"
              onClick={() => void updateCookie('clear')}
              disabled={isBusy}
              className="h-7 shrink-0 text-xs"
            >
              {translate('auto.components.settings.AccountsPane.316ca4e610', 'Forget cookie')}
            </Button>
          ) : null}
        </div>
        <p className="text-muted-foreground text-xs">
          {translate(
            'auto.components.settings.AccountsPane.79418c782a',
            'Open platform.minimax.io/console/usage in your browser, sign in, then copy the Cookie request header from DevTools (Network → any remains request → Cookie).'
          )}
        </p>
        {isConfigured && limits?.status === 'ok' && limits.error === null ? (
          <p className="text-muted-foreground text-xs">
            {translate(
              'auto.components.settings.AccountsPane.53f7b8c7a2',
              'Last refresh: {{value0}}',
              { value0: formatRelativeRefresh(limits.updatedAt, now) }
            )}
          </p>
        ) : null}
        <p className="text-muted-foreground text-xs">
          {translate(
            'auto.components.settings.AccountsPane.31d24a4e87',
            'Cookie expires when you sign out in the browser.'
          )}
        </p>
      </SearchableSetting>
      <div className="border-border/60 bg-muted/20 space-y-3 border p-3">
        <div className="space-y-1">
          <h4 className="text-muted-foreground text-xs font-semibold">
            {translate('auto.components.settings.AccountsPane.9dd50d3f75', 'Advanced')}
          </h4>
          <p className="text-muted-foreground text-xs">
            {translate(
              'auto.components.settings.AccountsPane.174fb408f9',
              'Leave these defaults alone unless MiniMax usage refresh points at the wrong workspace or model.'
            )}
          </p>
        </div>
        <SearchableSetting
          title={translate('auto.components.settings.AccountsPane.bf160bb6c0', 'Group ID override')}
          description={translate(
            'auto.components.settings.AccountsPane.b1e2743313',
            'Optional. Leave blank to use minimax_group_id_v2 from the cookie.'
          )}
          keywords={['minimax', 'group', 'id', 'rate limit']}
          className="space-y-2"
        >
          <Label>
            {translate('auto.components.settings.AccountsPane.bf160bb6c0', 'Group ID override')}
          </Label>
          <Input
            type="text"
            value={settings.minimaxGroupId}
            onChange={(event) => updateSettings({ minimaxGroupId: event.target.value })}
            placeholder={translate(
              'auto.components.settings.AccountsPane.0747d6391a',
              'Use group ID from cookie'
            )}
            spellCheck={false}
            className="text-xs"
          />
        </SearchableSetting>
        <SearchableSetting
          title={translate('auto.components.settings.AccountsPane.4ff2af7524', 'Usage model names')}
          description={translate(
            'auto.components.settings.AccountsPane.5cf4b0f85f',
            'Optional comma-separated model names. Leave as general unless MiniMax returns a model-specific error.'
          )}
          keywords={['minimax', 'model', 'general', 'rate limit']}
          className="space-y-2"
        >
          <Label>
            {translate('auto.components.settings.AccountsPane.4ff2af7524', 'Usage model names')}
          </Label>
          <Input
            type="text"
            value={settings.minimaxUsageModels}
            onChange={(event) => updateSettings({ minimaxUsageModels: event.target.value })}
            placeholder={translate('auto.components.settings.AccountsPane.3c92b0d31c', 'general')}
            spellCheck={false}
            className="text-xs"
          />
        </SearchableSetting>
      </div>
    </section>
  )
}
