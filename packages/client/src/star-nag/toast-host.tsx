import { YIRU_GITHUB_REPOSITORY_URL } from '@yiru/protocol/hosted-review/yiru-repository'
import { useEffect, useRef, useState } from 'react'
import { toast } from 'sonner'
import { openHttpLink } from '~renderer/editor/http-link-routing'
import { translate } from '~renderer/i18n/i18n'
import { Check, Star, ArrowSquareOut as ExternalLink, X } from '~renderer/icons/hugeicons'
import { LoadingIndicator } from '~renderer/loading/indicator'
import { shellClient } from '~renderer/runtime/shell-client'
import { Button } from '~renderer/ui/button'

type StarNagMode = 'gh' | 'web'
type StarNagToastStatus = 'idle' | 'busy' | 'starred' | 'opened'

type StarNagToastProps = {
  id: string | number
  mode: StarNagMode
  markResolved: () => void
  setDismissSuppressed: (suppressed: boolean) => void
}

function StarNagToast({
  id,
  mode: initialMode,
  markResolved,
  setDismissSuppressed
}: StarNagToastProps): React.JSX.Element {
  const [mode, setMode] = useState(initialMode)
  const [status, setStatus] = useState<StarNagToastStatus>('idle')
  const busy = status === 'busy'

  const close = (): void => {
    if (busy) {
      return
    }
    toast.dismiss(id)
  }

  const later = (): void => {
    if (busy) {
      return
    }
    markResolved()
    void shellClient.starNag.later()
    toast.dismiss(id)
  }

  const act = async (event: React.MouseEvent<HTMLButtonElement>): Promise<void> => {
    if (busy || status === 'starred') {
      return
    }
    setStatus('busy')
    setDismissSuppressed(true)
    if (mode === 'web') {
      try {
        openHttpLink(YIRU_GITHUB_REPOSITORY_URL, { event })
        await shellClient.starNag.openWeb()
        markResolved()
        setStatus('opened')
      } catch {
        setDismissSuppressed(false)
        setStatus('idle')
      }
      return
    }
    let ok = false
    try {
      ok = await shellClient.starNag.starYiru()
    } catch {
      ok = false
    }
    if (!ok) {
      setMode('web')
      setDismissSuppressed(false)
      setStatus('idle')
      return
    }
    markResolved()
    setStatus('starred')
  }

  const actionLabel =
    status === 'starred'
      ? translate('auto.components.star.nag.StarNagToastHost.starredThanks', 'Starred — thank you!')
      : status === 'opened'
        ? translate('auto.components.star.nag.StarNagToastHost.githubOpened', 'GitHub opened')
        : busy
          ? mode === 'web'
            ? translate('auto.components.star.nag.StarNagToastHost.opening', 'Opening…')
            : translate('auto.components.star.nag.StarNagToastHost.starring', 'Starring…')
          : mode === 'web'
            ? translate('auto.components.star.nag.StarNagToastHost.openGithub', 'Open GitHub')
            : translate('auto.components.star.nag.StarNagToastHost.starOnGithub', 'Star on GitHub')

  const completedStar = status === 'starred'
  const primaryActionClass = completedStar
    ? 'min-w-0 flex-1 gap-1.5 border-amber-400/40 bg-amber-400/15 text-amber-700 hover:bg-amber-400/15 dark:text-amber-200'
    : 'min-w-0 flex-1 gap-1.5 border-amber-400/60 bg-amber-400/15 text-amber-800 hover:bg-amber-400/25 dark:text-amber-100'

  return (
    <div className="border-border bg-popover text-popover-foreground relative w-[340px] max-w-[calc(100vw-32px)] overflow-hidden border p-3.5">
      <div className="flex items-start justify-between gap-3">
        <div className="min-w-0 space-y-1.5">
          <div className="flex items-center gap-2">
            <span
              className={
                completedStar
                  ? 'flex size-6 shrink-0 items-center justify-center border border-amber-400/40 bg-amber-400/10 text-amber-500'
                  : 'flex size-6 shrink-0 items-center justify-center border border-green-700/25 bg-green-700/10 text-green-700 dark:border-green-300/25 dark:bg-green-300/10 dark:text-green-300'
              }
              aria-hidden="true"
            >
              {completedStar ? (
                <Star className="size-3.5 fill-current" />
              ) : (
                <Check className="size-3.5" />
              )}
            </span>
            <div className="text-sm font-semibold">
              {translate(
                'auto.components.star.nag.StarNagToastHost.onboardingCompleted',
                'Onboarding completed!'
              )}
            </div>
          </div>
          <p className="text-muted-foreground text-sm leading-5">
            {translate(
              'auto.components.star.nag.StarNagToastHost.body',
              'If you’re enjoying Yiru so far, a GitHub star helps other developers discover it.'
            )}
          </p>
        </div>
        <Button
          variant="ghost"
          size="icon"
          className="size-7 shrink-0"
          onClick={close}
          disabled={busy}
          aria-label={translate('auto.components.star.nag.StarNagToastHost.dismiss', 'Dismiss')}
        >
          <X className="size-3.5" />
        </Button>
      </div>
      <div className="mt-3 flex gap-2">
        <Button
          variant="default"
          size="sm"
          className={primaryActionClass}
          onClick={(event) => void act(event)}
          disabled={busy || status === 'starred' || status === 'opened'}
        >
          {busy ? (
            <LoadingIndicator className="size-3.5" />
          ) : mode === 'web' ? (
            <ExternalLink className="size-3.5" />
          ) : (
            <Star className="size-3.5" />
          )}
          {actionLabel}
        </Button>
        <Button
          variant="secondary"
          size="sm"
          className="w-[84px]"
          onClick={later}
          disabled={busy || status === 'starred' || status === 'opened'}
        >
          {translate('auto.components.star.nag.StarNagToastHost.later', 'Later')}
        </Button>
      </div>
    </div>
  )
}

export function StarNagToastHost(): null {
  const activeToastIdRef = useRef<string | number | null>(null)
  const activeToastResolvedRef = useRef<(() => void) | null>(null)

  useEffect(() => {
    const dismissActiveToast = (): void => {
      if (activeToastIdRef.current === null) {
        return
      }
      activeToastResolvedRef.current?.()
      toast.dismiss(activeToastIdRef.current)
    }
    const unsubscribeShow = shellClient.starNag.onShow((payload) => {
      if (payload?.surface !== 'toast') {
        return
      }
      dismissActiveToast()
      let resolved = false
      let dismissSuppressed = false
      const markResolved = (): void => {
        resolved = true
      }
      const setDismissSuppressed = (suppressed: boolean): void => {
        dismissSuppressed = suppressed
      }
      activeToastResolvedRef.current = markResolved
      const id = toast.custom(
        (toastId) => (
          <StarNagToast
            id={toastId}
            mode={payload.mode === 'web' ? 'web' : 'gh'}
            markResolved={markResolved}
            setDismissSuppressed={setDismissSuppressed}
          />
        ),
        {
          duration: Infinity,
          closeButton: false,
          dismissible: false,
          unstyled: true,
          onDismiss: () => {
            if (activeToastIdRef.current === id) {
              activeToastIdRef.current = null
              activeToastResolvedRef.current = null
            }
            if (!resolved && !dismissSuppressed) {
              void shellClient.starNag.dismiss()
            }
          },
          onAutoClose: () => {
            if (activeToastIdRef.current === id) {
              activeToastIdRef.current = null
              activeToastResolvedRef.current = null
            }
          }
        }
      )
      activeToastIdRef.current = id
    })
    const unsubscribeHide = shellClient.starNag.onHide(dismissActiveToast)
    return () => {
      unsubscribeShow()
      unsubscribeHide()
    }
  }, [])

  return null
}
