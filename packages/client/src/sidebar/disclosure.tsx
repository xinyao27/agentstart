import type React from 'react'
import { translate } from '~renderer/i18n/i18n'
import { CaretDown as ChevronDown } from '~renderer/icons/hugeicons'
import { Button } from '~renderer/ui/button'
import { cn } from '~renderer/ui/class-names'

type SidebarDisclosureProps = {
  expanded: boolean
  className?: string
  onClick?: React.MouseEventHandler<HTMLButtonElement>
  onPointerDown?: React.PointerEventHandler<HTMLButtonElement>
  label?: string
  itemLabel?: string
  dataAttribute?: 'repo-header-collapse'
}

const DISCLOSURE_CLASS_NAME =
  'flex size-5 shrink-0 items-center justify-center rounded-md text-muted-foreground transition-colors hover:bg-accent hover:text-accent-foreground focus-visible:outline-none'

export function SidebarDisclosure({
  expanded,
  className,
  onClick,
  onPointerDown,
  label,
  itemLabel,
  dataAttribute
}: SidebarDisclosureProps): React.JSX.Element {
  const icon = (
    <ChevronDown
      aria-hidden="true"
      className={cn(
        'size-3.5 transition-transform motion-reduce:transition-none',
        !expanded && '-rotate-90'
      )}
    />
  )

  if (!onClick) {
    return (
      <span className={cn(DISCLOSURE_CLASS_NAME, className)} aria-hidden="true">
        {icon}
      </span>
    )
  }

  return (
    <Button
      variant="ghost"
      size="xs"
      type="button"
      className={cn(
        'p-0 h-auto border-0 focus-visible:bg-accent',
        DISCLOSURE_CLASS_NAME,
        className
      )}
      aria-label={
        label ??
        (itemLabel
          ? expanded
            ? translate(
                'auto.components.sidebar.SidebarDisclosure.collapse',
                'Collapse {{value0}}',
                { value0: itemLabel }
              )
            : translate('auto.components.sidebar.SidebarDisclosure.expand', 'Expand {{value0}}', {
                value0: itemLabel
              })
          : undefined)
      }
      aria-expanded={expanded}
      data-repo-header-collapse-affordance={
        dataAttribute === 'repo-header-collapse' ? '' : undefined
      }
      onClick={onClick}
      onPointerDown={onPointerDown}
    >
      {icon}
    </Button>
  )
}
