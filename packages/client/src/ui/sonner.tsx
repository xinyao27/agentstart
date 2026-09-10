import {
  Alert02Icon,
  CircleCheckIcon,
  CircleXIcon,
  InformationCircleIcon
} from '@hugeicons/core-free-icons'
import { HugeiconsIcon } from '@hugeicons/react'
import { Toaster as Sonner, type ToasterProps } from 'sonner'
import { LoadingIndicator } from '~renderer/loading/indicator'

const Toaster = ({ theme = 'system', ...props }: ToasterProps) => {
  return (
    <Sonner
      theme={theme}
      position="bottom-right"
      // Why: AgentStart has persistent bottom chrome, so bottom-right toasts need
      // breathing room above the status bar instead of sitting on its edge.
      // mobileOffset keeps that clearance below Sonner's 600px breakpoint
      // (narrow/resized windows and the web client), which otherwise reverts
      // to Sonner's default 16px and lets toasts crowd the status bar again.
      offset={{ bottom: 'calc(2.5rem + env(safe-area-inset-bottom, 0px))' }}
      mobileOffset={{ bottom: 'calc(2.5rem + env(safe-area-inset-bottom, 0px))' }}
      className="toaster group"
      icons={{
        success: <HugeiconsIcon icon={CircleCheckIcon} className="size-4" />,
        info: <HugeiconsIcon icon={InformationCircleIcon} className="size-4" />,
        warning: <HugeiconsIcon icon={Alert02Icon} className="size-4" />,
        error: <HugeiconsIcon icon={CircleXIcon} className="size-4" />,
        loading: <LoadingIndicator className="size-4" />
      }}
      style={
        {
          '--normal-bg': 'var(--popover)',
          '--normal-text': 'var(--popover-foreground)',
          '--normal-border': 'var(--border)',
          '--border-radius': 'var(--radius)',
          '--width': 'min(26rem, calc(100vw - 2rem))'
        } as React.CSSProperties
      }
      {...props}
    />
  )
}

export { Toaster }
