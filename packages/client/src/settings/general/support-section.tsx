import { YIRU_GITHUB_STARGAZERS_URL } from '@yiru/protocol/hosted-review/yiru-repository'
import type React from 'react'
import { useEffect, useState } from 'react'
import { openHttpLink } from '~renderer/editor/http-link-routing'
import { translate } from '~renderer/i18n/i18n'
import { Star, ArrowSquareOut as ExternalLink } from '~renderer/icons/hugeicons'
import { LoadingIndicator } from '~renderer/loading/indicator'
import { useMountedRef } from '~renderer/react/use-mounted-ref'
import {
  checkShellYiruStarred,
  completeShellStarNag,
  starYiruFromShell
} from '~renderer/runtime/github-shell-client'
import { Button } from '~renderer/ui/button'
import { cn } from '~renderer/ui/class-names'
import { Label } from '~renderer/ui/label'
import { Separator } from '~renderer/ui/separator'

import { SettingsSubsectionHeader } from '../form-controls'
import { SearchableSetting } from '../searchable-setting'

type SupportState =
  | 'loading'
  | 'not-starred'
  | 'web-fallback'
  | 'opening-github'
  | 'starring'
  | 'starred'
  | 'hidden'

type GeneralSupportSectionProps = {
  hasPrecedingSections: boolean
}

export function GeneralSupportSection({
  hasPrecedingSections
}: GeneralSupportSectionProps): React.JSX.Element {
  const mountedRef = useMountedRef()
  // Why: the star state is derived from gh, not from settings, so it does not
  // live in the global settings store. 'hidden' covers already-starred users
  // so the section drops out for people who don't need to act.
  //
  // We start in 'loading' and render a placeholder at the exact same
  // dimensions as the resolved section. When gh resolves to 'hidden', the
  // placeholder collapses with a grid-rows transition so content above it
  // doesn't shift; anything below (nothing today, but future-proof) eases up.
  const [starState, setStarState] = useState<SupportState>('loading')

  useEffect(() => {
    let cancelled = false
    void checkShellYiruStarred().then((result) => {
      if (cancelled) {
        return
      }
      if (result === null) {
        setStarState('web-fallback')
      } else {
        setStarState(result ? 'starred' : 'not-starred')
      }
    })
    return () => {
      cancelled = true
    }
  }, [])

  const handleStarClick = async (event: React.MouseEvent<HTMLButtonElement>): Promise<void> => {
    if (starState === 'web-fallback') {
      setStarState('opening-github')
      openHttpLink(YIRU_GITHUB_STARGAZERS_URL, { event })
      if (mountedRef.current) {
        setStarState('web-fallback')
      }
      return
    }
    if (starState !== 'not-starred') {
      return
    }
    setStarState('starring')
    const ok = await starYiruFromShell('settings')
    if (!ok) {
      if (mountedRef.current) {
        setStarState('web-fallback')
      }
      return
    }
    if (mountedRef.current) {
      setStarState('starred')
    }
    // Why: clicking star anywhere should also permanently mute the
    // threshold-based nag so the user isn't re-prompted via the popup.
    await completeShellStarNag()
  }

  return (
    <SupportSection
      state={starState}
      hasPrecedingSections={hasPrecedingSections}
      onStarClick={handleStarClick}
    />
  )
}

type SupportSectionProps = {
  state: SupportState
  hasPrecedingSections: boolean
  onStarClick: (event: React.MouseEvent<HTMLButtonElement>) => void | Promise<void>
}

function SupportSection({
  state,
  hasPrecedingSections,
  onStarClick
}: SupportSectionProps): React.JSX.Element {
  // Why: 'hidden' means gh is unavailable or the user had already starred on a
  // previous session. Collapse the whole section, including its leading
  // Separator, so the settings pane doesn't carry an empty strip.
  const collapsed = state === 'hidden'

  return (
    <section
      className={cn(
        'grid transition-[grid-template-rows,opacity] duration-300 ease-out',
        collapsed ? 'grid-rows-[0fr] opacity-0' : 'grid-rows-[1fr] opacity-100'
      )}
      aria-hidden={collapsed}
    >
      <div className="min-h-0 overflow-hidden">
        <div className="space-y-8">
          {hasPrecedingSections ? <Separator /> : null}
          <div className="space-y-4">
            <SettingsSubsectionHeader
              title={translate(
                'auto.components.settings.GeneralSupportSection.55a87e5fd1',
                'Support Yiru'
              )}
            />
            {state === 'loading' ? <SupportRowSkeleton /> : null}
            {state !== 'loading' && state !== 'hidden' ? (
              <SupportRow state={state} onStarClick={onStarClick} />
            ) : null}
          </div>
        </div>
      </div>
    </section>
  )
}

function SupportRowSkeleton(): React.JSX.Element {
  return (
    <div className="flex items-center justify-between gap-4 py-2" aria-hidden="true">
      <div className="bg-muted/50 h-4 w-36 animate-pulse" />
      <div className="bg-muted/50 h-8 w-24 animate-pulse" />
    </div>
  )
}

function SupportRow({
  state,
  onStarClick
}: {
  state: 'not-starred' | 'web-fallback' | 'opening-github' | 'starring' | 'starred'
  onStarClick: (event: React.MouseEvent<HTMLButtonElement>) => void | Promise<void>
}): React.JSX.Element {
  // Why: the left-hand label is the setting's identity and must not change
  // when the user clicks. The right-hand control is what changes: before
  // starring it is a button; after success it becomes a small confirmation.
  return (
    <SearchableSetting
      title={translate(
        'auto.components.settings.GeneralSupportSection.6922c1fa2b',
        'Star Yiru on GitHub'
      )}
      description={translate(
        'auto.components.settings.GeneralSupportSection.511782265b',
        'Support the project with a GitHub star.'
      )}
      keywords={['star', 'github', 'support', 'feedback', 'like']}
      className="flex items-center justify-between gap-4 py-2"
    >
      <Label>
        {translate(
          'auto.components.settings.GeneralSupportSection.6922c1fa2b',
          'Star Yiru on GitHub'
        )}
      </Label>
      {state === 'starred' ? (
        <SupportRowThanks />
      ) : (
        <Button
          variant="default"
          size="sm"
          onClick={(event) => void onStarClick(event)}
          disabled={state === 'starring' || state === 'opening-github'}
          className="shrink-0 gap-1.5"
        >
          {state === 'starring' || state === 'opening-github' ? (
            <LoadingIndicator className="size-3.5" />
          ) : state === 'web-fallback' ? (
            <ExternalLink className="size-3.5" />
          ) : (
            <Star className="size-3.5 fill-amber-400 text-amber-400" />
          )}
          {state === 'starring'
            ? translate('auto.components.settings.GeneralSupportSection.397719bee5', 'Starring...')
            : state === 'opening-github'
              ? translate('auto.components.settings.GeneralSupportSection.cb65c75b11', 'Opening...')
              : state === 'web-fallback'
                ? translate(
                    'auto.components.settings.GeneralSupportSection.f2d4f877b2',
                    'Open GitHub'
                  )
                : translate('auto.components.settings.GeneralSupportSection.964acc6bb4', 'Star')}
        </Button>
      )}
    </SearchableSetting>
  )
}

function SupportRowThanks(): React.JSX.Element {
  // Why: match the size="sm" button's h-8 / gap-1.5 / px-3 dimensions so the
  // row height stays identical when the button is swapped out.
  return (
    <div
      className="animate-in fade-in slide-in-from-right-1 inline-flex h-8 shrink-0 items-center gap-1.5 px-3 text-sm font-medium text-amber-400/90 duration-300"
      role="status"
      aria-live="polite"
    >
      <Star className="size-3.5 fill-amber-400/80 text-amber-400/80" aria-hidden="true" />
      {translate(
        'auto.components.settings.GeneralSupportSection.af7d9f4396',
        'Thanks for the support!'
      )}
    </div>
  )
}
