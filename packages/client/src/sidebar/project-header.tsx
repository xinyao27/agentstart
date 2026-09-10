import React from 'react'
import { cn } from '~renderer/ui/class-names'

import { ProjectWorkspaceRailStart } from './project-workspace-rail'

type SidebarProjectHeaderIconProps = React.HTMLAttributes<HTMLDivElement> & {
  'data-repo-header-drag-handle'?: string
  'data-project-group-header-drag-handle'?: string
}

type SidebarProjectHeaderProps = React.HTMLAttributes<HTMLDivElement> & {
  paddingLeft: number
  icon?: React.ReactNode
  iconClassName?: string
  iconProps?: SidebarProjectHeaderIconProps
  label: React.ReactNode
  labelAfter?: React.ReactNode
  hasWorkspaceRail?: boolean
  ref?: React.Ref<HTMLDivElement>
}

export function SidebarProjectHeader({
  paddingLeft,
  icon,
  iconClassName,
  iconProps,
  label,
  labelAfter,
  hasWorkspaceRail = false,
  children,
  className,
  ref,
  style,
  ...props
}: SidebarProjectHeaderProps): React.JSX.Element {
  const { className: iconPropsClassName, ...restIconProps } = iconProps ?? {}

  return (
    <div
      ref={ref}
      className={cn(
        // Why: project headers and workspace rows are the same sidebar row
        // role, so they share one row box: a 20px label line inside the
        // workspace card's `py-1` and 1px border.
        'group relative flex h-[30px] w-full items-center gap-1.5 pr-2 text-left transition-all outline-none hover:bg-accent focus-visible:bg-accent',
        className
      )}
      style={{ ...style, paddingLeft }}
      {...props}
    >
      {hasWorkspaceRail ? <ProjectWorkspaceRailStart paddingLeftPx={paddingLeft} /> : null}
      {icon ? (
        <div
          className={cn(
            'flex size-4 shrink-0 items-center justify-center rounded-[4px]',
            iconClassName,
            iconPropsClassName
          )}
          {...restIconProps}
        >
          {icon}
        </div>
      ) : null}

      <div className="min-w-0 flex-1">
        <div className="flex min-w-0 items-center gap-1.5">
          <div className="min-w-0 truncate text-[13px] leading-none font-semibold">{label}</div>
          {labelAfter}
        </div>
      </div>

      {children}
    </div>
  )
}
