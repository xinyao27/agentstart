import { isAICSSLoaderVariant } from '@agentstart/protocol/settings/loader'
import {
  DEFAULT_LOADER_STYLE,
  normalizeLoaderStyle,
  type LoaderStyle
} from '@agentstart/protocol/settings/loader'
import { createContext, useContext } from 'react'
import type React from 'react'
import { cn } from '~renderer/ui/class-names'

import { LoaderOrb } from './orb'
import { ThinkingOrbLoader } from './thinking-orb'

const LoadingIndicatorStyleContext = createContext<LoaderStyle>(DEFAULT_LOADER_STYLE)

type LoadingIndicatorBaseProps = Omit<React.ComponentPropsWithoutRef<'span'>, 'children'> & {
  size?: number | string
}

type LoadingIndicatorPreviewProps = LoadingIndicatorBaseProps & {
  loaderStyle: LoaderStyle
}

function removeLegacySpinClass(className: string | undefined): string | undefined {
  // Why: the orb owns its motion; a leftover icon class would rotate the whole canvas.
  return className
    ?.split(/\s+/)
    .filter((token) => token && token !== 'animate-spin')
    .join(' ')
}

function LoadingIndicatorVisual({
  loaderStyle,
  size,
  className,
  style,
  role,
  'aria-label': ariaLabel,
  'aria-hidden': ariaHidden,
  ...props
}: LoadingIndicatorPreviewProps): React.JSX.Element {
  const dimension = typeof size === 'number' ? `${size}px` : size
  // Why: loading is neutral process chrome, so every variant stays monochrome across themes.
  return (
    <span
      {...props}
      data-slot="loading-indicator"
      data-loader-style={loaderStyle}
      role={role ?? (ariaLabel ? 'status' : undefined)}
      aria-label={ariaLabel}
      aria-hidden={ariaLabel ? undefined : (ariaHidden ?? true)}
      className={cn(
        'relative inline-block size-4 shrink-0 overflow-visible align-middle leading-none',
        removeLegacySpinClass(className),
        'text-foreground'
      )}
      style={{
        ...style,
        ...(dimension ? { width: dimension, height: dimension } : {})
      }}
    >
      {isAICSSLoaderVariant(loaderStyle) ? (
        <LoaderOrb variant={loaderStyle} />
      ) : (
        <ThinkingOrbLoader state={loaderStyle} />
      )}
    </span>
  )
}

type LoadingIndicatorStyleProviderProps = React.ComponentPropsWithRef<'div'> & {
  loaderStyle: LoaderStyle | undefined
}

export function LoadingIndicatorStyleProvider({
  loaderStyle,
  children,
  ...props
}: LoadingIndicatorStyleProviderProps): React.JSX.Element {
  const normalizedLoaderStyle = normalizeLoaderStyle(loaderStyle)
  return (
    <LoadingIndicatorStyleContext.Provider value={normalizedLoaderStyle}>
      <div {...props}>{children}</div>
    </LoadingIndicatorStyleContext.Provider>
  )
}

export function LoadingIndicator(props: LoadingIndicatorBaseProps): React.JSX.Element {
  const configuredStyle = useContext(LoadingIndicatorStyleContext)
  return <LoadingIndicatorVisual {...props} loaderStyle={configuredStyle} />
}

export function LoadingIndicatorPreview({
  loaderStyle,
  ...props
}: LoadingIndicatorPreviewProps): React.JSX.Element {
  return <LoadingIndicatorVisual {...props} loaderStyle={normalizeLoaderStyle(loaderStyle)} />
}
