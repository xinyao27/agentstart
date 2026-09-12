import { createElement } from 'react'
import type { IconProps } from '~renderer/icons/hugeicons'
import logo from '~renderer/public/favicon.png?url'
import { cn } from '~renderer/ui/class-names'

export function AgentStartLogoSettingsIcon({ className }: IconProps): React.JSX.Element {
  return createElement('img', {
    src: logo,
    alt: '',
    'aria-hidden': true,
    className: cn('bg-muted rounded-md object-contain', className)
  })
}
