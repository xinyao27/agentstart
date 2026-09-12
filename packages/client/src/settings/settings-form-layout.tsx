import type React from 'react'
import { Badge } from '~renderer/ui/badge'
import { Button } from '~renderer/ui/button'
import { cn } from '~renderer/ui/class-names'

import { Label } from '../ui/label'
import { Switch } from '../ui/switch'

type SettingsSwitchProps = {
  checked: boolean
  onChange: () => void
  ariaLabel?: string
  ariaLabelledBy?: string
  disabled?: boolean
}

export function SettingsSwitch({
  checked,
  onChange,
  ariaLabel,
  ariaLabelledBy,
  disabled
}: SettingsSwitchProps): React.JSX.Element {
  return (
    <Switch
      checked={checked}
      aria-label={ariaLabel}
      aria-labelledby={ariaLabelledBy}
      disabled={disabled}
      onCheckedChange={onChange}
    />
  )
}

type SettingsRowProps = {
  label: React.ReactNode
  description?: React.ReactNode
  control: React.ReactNode
  /** Optional id applied to the label so the control can reference it via aria-labelledby. */
  labelId?: string
  /** When true, top-align label/description and control. Useful for tall control columns. */
  alignTop?: boolean
}

/** Two-column row grammar: left min-w-0 label+description, right shrink-0 control. */
export function SettingsRow({
  label,
  description,
  control,
  labelId,
  alignTop
}: SettingsRowProps): React.JSX.Element {
  return (
    <div
      className={cn(
        'flex gap-4',
        description ? 'py-3' : 'py-2',
        alignTop ? 'items-start' : 'items-center justify-between'
      )}
    >
      <div className={cn('min-w-0 flex-1', description ? 'space-y-1' : 'space-y-0.5')}>
        <Label id={labelId} className="select-text">
          {label}
        </Label>
        {description ? (
          <p className="text-muted-foreground text-xs select-text">{description}</p>
        ) : null}
      </div>
      <div className="shrink-0">{control}</div>
    </div>
  )
}

type SettingsSwitchRowProps = {
  label: React.ReactNode
  description?: React.ReactNode
  checked: boolean
  onChange: () => void
  ariaLabel?: string
  disabled?: boolean
}

export function SettingsSwitchRow({
  label,
  description,
  checked,
  onChange,
  ariaLabel,
  disabled
}: SettingsSwitchRowProps): React.JSX.Element {
  return (
    <SettingsRow
      label={label}
      description={description}
      control={
        <SettingsSwitch
          checked={checked}
          onChange={onChange}
          ariaLabel={ariaLabel ?? (typeof label === 'string' ? label : undefined)}
          disabled={disabled}
        />
      }
    />
  )
}

type SegmentedOption<T extends string | number> = {
  value: T
  label: React.ReactNode
  disabled?: boolean
  ariaLabel?: string
}

type SettingsSegmentedControlProps<T extends string | number> = {
  value: T
  onChange: (value: T) => void
  options: readonly SegmentedOption<T>[]
  ariaLabel?: string
  size?: 'sm' | 'md'
  equalWidth?: boolean
}

/** Canonical segmented control for theme/ligatures/cursor/shell/etc. */
export function SettingsSegmentedControl<T extends string | number>({
  value,
  onChange,
  options,
  ariaLabel,
  size = 'md',
  equalWidth = false
}: SettingsSegmentedControlProps<T>): React.JSX.Element {
  return (
    <div
      role="radiogroup"
      aria-label={ariaLabel}
      className={cn(
        'inline-flex items-center overflow-hidden rounded-lg border border-border bg-background/50 p-0.5',
        equalWidth && 'w-full'
      )}
    >
      {options.map((opt) => {
        const active = opt.value === value
        return (
          <Button
            variant="quiet"
            size={size === 'sm' ? 'xs' : 'sm'}
            key={String(opt.value)}
            type="button"
            role="radio"
            aria-checked={active}
            aria-label={opt.ariaLabel}
            disabled={opt.disabled}
            onClick={() => {
              if (!opt.disabled) {
                onChange(opt.value)
              }
            }}
            className={cn(
              'h-auto gap-0 border-0 text-center',
              size === 'sm' ? 'px-2.5 py-0.5' : 'py-1',
              equalWidth && 'flex-1',
              active
                ? 'bg-accent text-accent-foreground'
                : opt.disabled
                  ? 'cursor-not-allowed opacity-50'
                  : undefined
            )}
          >
            {opt.label}
          </Button>
        )
      })}
    </div>
  )
}

type SettingsBadgeProps = {
  tone?: 'neutral' | 'accent' | 'muted'
  children: React.ReactNode
  className?: string
}

/** Tokenized badge for status pills inside settings (e.g. Detected, Not installed). */
export function SettingsBadge({
  tone = 'neutral',
  children,
  className
}: SettingsBadgeProps): React.JSX.Element {
  return (
    <Badge
      size="xs"
      variant="outline"
      className={cn(
        'h-auto py-0.5 text-[10px]',
        tone === 'accent'
          ? 'border-foreground/20 bg-foreground/10 text-foreground'
          : tone === 'muted'
            ? 'border-border/40 bg-muted/30 text-muted-foreground'
            : 'border-border/50 bg-background/50 text-foreground/80',
        className
      )}
    >
      {children}
    </Badge>
  )
}

type SettingsSubsectionHeaderProps = {
  title: React.ReactNode
  description?: React.ReactNode
  action?: React.ReactNode
  className?: string
}

/** Consistent subsection header: h3 text-sm font-semibold + optional muted description. */
export function SettingsSubsectionHeader({
  title,
  description,
  action,
  className
}: SettingsSubsectionHeaderProps): React.JSX.Element {
  return (
    <div className={cn('flex items-start justify-between gap-3', className)}>
      <div className="space-y-1">
        <h3 className="text-sm font-semibold">{title}</h3>
        {description ? <p className="text-muted-foreground text-xs">{description}</p> : null}
      </div>
      {action ? <div className="shrink-0">{action}</div> : null}
    </div>
  )
}
