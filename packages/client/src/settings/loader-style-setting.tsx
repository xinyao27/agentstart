import {
  LOADER_STYLES,
  normalizeLoaderStyle,
  type LoaderStyle
} from '@yiru/protocol/settings/loader'
import { translate } from '~renderer/i18n/i18n'
import { LoadingIndicatorPreview } from '~renderer/loading/indicator'
import { Button } from '~renderer/ui/button'
import { cn } from '~renderer/ui/class-names'

import { Label } from '../ui/label'

type LoaderStyleSettingProps = {
  value: LoaderStyle | undefined
  onChange: (value: LoaderStyle) => void
}

function handleLoaderStyleKeyDown(
  event: React.KeyboardEvent<HTMLButtonElement>,
  currentIndex: number,
  onChange: (value: LoaderStyle) => void
): void {
  let nextIndex: number | null = null
  if (event.key === 'ArrowRight' || event.key === 'ArrowDown') {
    nextIndex = (currentIndex + 1) % LOADER_STYLES.length
  } else if (event.key === 'ArrowLeft' || event.key === 'ArrowUp') {
    nextIndex = (currentIndex - 1 + LOADER_STYLES.length) % LOADER_STYLES.length
  } else if (event.key === 'Home') {
    nextIndex = 0
  } else if (event.key === 'End') {
    nextIndex = LOADER_STYLES.length - 1
  }
  if (nextIndex === null) {
    return
  }

  event.preventDefault()
  onChange(LOADER_STYLES[nextIndex])
  event.currentTarget.parentElement
    ?.querySelectorAll<HTMLButtonElement>('[role="radio"]')
    [nextIndex]?.focus()
}

function getLoaderStyleLabel(loaderStyle: LoaderStyle): string {
  switch (loaderStyle) {
    case 'working':
      return translate('settings.appearance.loader.orbWorking', 'Working')
    case 'searching':
      return translate('settings.appearance.loader.orbSearching', 'Searching')
    case 'solving':
      return translate('settings.appearance.loader.orbSolving', 'Solving')
    case 'listening':
      return translate('settings.appearance.loader.orbListening', 'Listening')
    case 'composing':
      return translate('settings.appearance.loader.orbComposing', 'Composing')
    case 'shaping':
      return translate('settings.appearance.loader.orbShaping', 'Shaping')
    case 'S1':
      return translate('settings.appearance.loader.orbS1', 'S1 · Thinking')
    case 'S2':
      return translate('settings.appearance.loader.orbS2', 'S2 · Processing')
    case 'S3':
      return translate('settings.appearance.loader.orbS3', 'S3 · Working')
    case 'S4':
      return translate('settings.appearance.loader.orbS4', 'S4 · Searching')
    case 'S5':
      return translate('settings.appearance.loader.orbS5', 'S5 · Finalizing')
    case 'B1':
      return translate('settings.appearance.loader.orbB1', 'B1 · Thinking')
    case 'B2':
      return translate('settings.appearance.loader.orbB2', 'B2 · Searching')
    case 'B3':
      return translate('settings.appearance.loader.orbB3', 'B3 · Generating')
    case 'B4':
      return translate('settings.appearance.loader.orbB4', 'B4 · Solving')
    case 'B5':
      return translate('settings.appearance.loader.orbB5', 'B5 · Routing')
    case 'C1':
      return translate('settings.appearance.loader.orbC1', 'C1 · Loading')
    case 'C2':
      return translate('settings.appearance.loader.orbC2', 'C2 · Listening')
    case 'C3':
      return translate('settings.appearance.loader.orbC3', 'C3 · Streaming')
    case 'C4':
      return translate('settings.appearance.loader.orbC4', 'C4 · Analyzing')
    case 'C5':
      return translate('settings.appearance.loader.orbC5', 'C5 · Compiling')
    case 'M1':
      return translate('settings.appearance.loader.orbM1', 'M1 · Shaping')
    case 'M2':
      return translate('settings.appearance.loader.orbM2', 'M2 · Expanding')
    case 'M3':
      return translate('settings.appearance.loader.orbM3', 'M3 · Unfolding')
    case 'M4':
      return translate('settings.appearance.loader.orbM4', 'M4 · Transforming')
    case 'M5':
      return translate('settings.appearance.loader.orbM5', 'M5 · Dispersing')
  }
}

export function LoaderStyleSetting({
  value,
  onChange
}: LoaderStyleSettingProps): React.JSX.Element {
  const selected = normalizeLoaderStyle(value)
  const title = translate('settings.appearance.loader.title', 'Loader')

  return (
    <div className="space-y-3 py-3">
      <div className="space-y-1">
        <Label>{title}</Label>
        <p className="text-muted-foreground text-xs">
          {translate(
            'settings.appearance.loader.description',
            'Choose the dotted agent-state animation used across Yiru.'
          )}
        </p>
      </div>
      <div role="radiogroup" aria-label={title} className="grid grid-cols-4 gap-2">
        {LOADER_STYLES.map((loaderStyle, index) => {
          const active = loaderStyle === selected
          const label = getLoaderStyleLabel(loaderStyle)
          return (
            <Button
              variant="outline"
              size="default"
              key={loaderStyle}
              type="button"
              role="radio"
              aria-checked={active}
              tabIndex={active ? 0 : -1}
              data-current={active ? 'true' : undefined}
              onClick={() => onChange(loaderStyle)}
              onKeyDown={(event) => handleLoaderStyleKeyDown(event, index, onChange)}
              className={cn(
                'focus-visible:border-foreground focus-visible:bg-accent focus-visible:text-accent-foreground focus-visible:border-2 flex min-h-16 flex-col gap-1.5 px-2 text-center transition-colors',
                active ? 'border-ring bg-accent text-accent-foreground' : 'text-muted-foreground'
              )}
            >
              <LoadingIndicatorPreview loaderStyle={loaderStyle} className="size-7" />
              <span className="text-[11px] font-medium">{label}</span>
            </Button>
          )
        })}
      </div>
    </div>
  )
}
