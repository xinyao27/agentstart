import { createElement } from 'react'
import logo from '~renderer/assets/brand/agentstart-wordmark.png?url'
import type { IconProps } from '~renderer/icons/hugeicons'
import { cn } from '~renderer/ui/class-names'

export function AgentStartLogoSettingsIcon({ className }: IconProps): React.JSX.Element {
  return createElement('img', {
    src: logo,
    alt: '',
    'aria-hidden': true,
    className: cn('object-contain', className)
  })
}
