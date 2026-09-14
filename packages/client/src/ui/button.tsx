import { Button as ButtonPrimitive } from '@base-ui/react/button'
import { cva, type VariantProps } from 'class-variance-authority'
import * as React from 'react'
import { cn } from '~renderer/ui/class-names'

const buttonVariants = cva(
  // Why: every button suppresses the UA ring locally and replaces it with a flat border focus state.
  "inline-flex shrink-0 items-center justify-center gap-2 rounded-md border border-transparent cursor-pointer text-sm font-medium whitespace-nowrap transition-all outline-none focus-visible:border-ring disabled:pointer-events-none disabled:opacity-50 aria-disabled:cursor-not-allowed aria-disabled:opacity-50 aria-invalid:border-destructive [&_svg]:pointer-events-none [&_svg]:shrink-0 [&_svg:not([class*='size-'])]:size-4",
  {
    variants: {
      variant: {
        default:
          'bg-primary text-primary-foreground hover:bg-[color-mix(in_srgb,var(--primary)_90%,var(--background))]',
        destructive:
          'bg-destructive text-white hover:bg-[color-mix(in_srgb,var(--destructive)_90%,var(--background))] dark:bg-destructive',
        // Why: toolbar controls must keep an opaque resting surface in both themes.
        outline:
          'border border-border bg-background text-foreground hover:border-muted-foreground/35 hover:bg-accent hover:text-accent-foreground dark:border-input dark:bg-background dark:hover:bg-accent',
        // Why: workspace-panel toolbar controls need the standard outline interaction
        // states without painting a main-canvas background over the sidebar.
        'sidebar-outline':
          'border border-border bg-sidebar text-muted-foreground hover:border-muted-foreground/35 hover:bg-accent hover:text-accent-foreground dark:border-input dark:bg-sidebar dark:hover:bg-accent',
        // Why: titlebar chrome shares the row seams, so controls only draw vertical separators.
        'outline-transparent':
          'border border-y-0 border-border bg-transparent text-foreground hover:bg-accent hover:text-accent-foreground focus-visible:border-border focus-visible:bg-accent focus-visible:text-accent-foreground dark:border-input dark:hover:bg-accent dark:focus-visible:border-input',
        // Why: segmented titlebar actions rest quietly and use the primary color only for current state.
        'titlebar-segment':
          'border border-y-0 border-border bg-transparent text-muted-foreground hover:bg-accent hover:text-accent-foreground focus-visible:border-border focus-visible:bg-accent focus-visible:text-accent-foreground aria-[current=page]:text-primary dark:border-input dark:hover:bg-accent dark:focus-visible:border-input',
        // Why: the leading tools sit inside their own tinted track, so their
        // segment paints a neutral wash on hover and lifts the current one onto
        // the island's own plane rather than tinting it with the brand color;
        // the cap's hairline rides the box-shadow so no border joins the focus
        // state, which stays a background-only change.
        'workspace-tool':
          '!rounded-md border-0 bg-transparent text-muted-foreground transition-[background-color,color,box-shadow] duration-150 ease-out hover:bg-muted hover:text-foreground focus-visible:bg-muted focus-visible:text-foreground aria-[current=page]:bg-background aria-[current=page]:text-primary aria-[current=page]:shadow-[0_0_0_1px_var(--border),0_1px_2px_color-mix(in_srgb,black_7%,transparent),0_0_4px_color-mix(in_srgb,black_4%,transparent)]',
        secondary:
          'bg-secondary text-secondary-foreground hover:bg-[color-mix(in_srgb,var(--secondary)_80%,var(--background))]',
        ghost: 'hover:bg-accent hover:text-accent-foreground dark:hover:bg-accent',
        // Why: muted toolbar/icon chrome that should rest quieter than ghost without
        // call sites repeating text-muted-foreground + hover/focus overrides.
        quiet:
          'text-muted-foreground hover:bg-accent hover:text-foreground focus-visible:bg-accent focus-visible:text-foreground dark:hover:bg-accent',
        // Why: tab-strip arrows use accent-only focus so their transparent
        // chrome never reads as a bordered control beside the tab viewport.
        'tab-strip-scroll':
          'text-muted-foreground hover:bg-accent hover:text-foreground focus-visible:border-transparent focus-visible:bg-accent focus-visible:text-foreground disabled:opacity-35 dark:hover:bg-accent',
        // Why: data visualizations use the whole plot as the activation target without button chrome.
        chart: 'text-foreground',
        // Why: color-picking controls use their geometry as data, so this variant
        // owns the exact compact chrome sanctioned for that single domain.
        'color-field': 'border-0 p-0 transition-[background-color] duration-200',
        'color-swatch': 'border-0 p-0 transition-transform hover:scale-105 active:scale-95',
        // Why: actions revealed over an accent row need contrast from the row
        // surface while remaining transparent at rest.
        'row-action':
          'text-muted-foreground hover:bg-background hover:text-foreground focus-visible:bg-background focus-visible:text-foreground',
        // Why: command/listbox rows share selected-state chrome, including a
        // border that remains legible while the user types.
        'picker-row':
          'text-foreground hover:bg-accent hover:text-accent-foreground aria-selected:border-border aria-selected:bg-accent aria-selected:text-accent-foreground',
        // Why: visual choices need full-card activation while preserving the
        // same semantic hover, focus, and persistent selection grammar as rows.
        'choice-card':
          'border-border bg-background text-foreground hover:bg-accent hover:text-accent-foreground focus-visible:bg-accent aria-pressed:border-primary aria-pressed:bg-accent',
        // Why: inline actions floating above an editor need opaque popover
        // paint while retaining the standard outline interaction states.
        'popover-outline':
          'border border-border bg-popover text-muted-foreground hover:border-muted-foreground/35 hover:bg-accent hover:text-accent-foreground focus-visible:bg-accent focus-visible:text-accent-foreground',
        // Why: status actions cannot reserve a border seam, so focus uses background contrast.
        'status-bar': 'border-0 font-normal hover:bg-accent/70 focus-visible:bg-accent/70',
        'status-bar-icon':
          'border-0 text-muted-foreground hover:bg-accent hover:text-accent-foreground focus-visible:bg-accent focus-visible:text-accent-foreground aria-[current=page]:text-primary',
        'status-bar-quiet':
          'border-0 font-normal text-muted-foreground hover:bg-accent hover:text-foreground focus-visible:bg-accent focus-visible:text-foreground',
        link: 'text-primary underline-offset-4 hover:underline'
      },
      size: {
        default: 'h-9 px-4 py-2 has-[>svg]:px-3',
        // Why: multi-line list actions need content-driven height without bypassing Button chrome.
        'list-row': 'h-auto px-3 py-2',
        'picker-row': 'h-auto gap-2 px-2 py-1.5 text-left text-sm font-normal whitespace-normal',
        'choice-card':
          'h-auto w-full flex-col items-stretch justify-start gap-0 p-3 text-left font-normal whitespace-normal',
        'choice-row':
          'h-auto w-full justify-start gap-0 p-3.5 text-left font-normal whitespace-normal',
        chart: 'h-auto w-full p-0 whitespace-normal',
        'chart-plot': 'h-48 w-full p-0 whitespace-normal',
        'sidebar-row':
          'h-auto w-full justify-start gap-2 px-2 py-1.5 text-left text-sm whitespace-normal',
        'row-trigger':
          "h-auto gap-1 p-0 text-left text-xs font-normal whitespace-normal [&_svg:not([class*='size-'])]:size-3",
        'popover-hint': 'h-auto gap-2 px-3 py-1.5 text-left',
        xs: "h-6 gap-1 rounded-md px-2 text-xs has-[>svg]:px-1.5 [&_svg:not([class*='size-'])]:size-3",
        // Why: status actions fill the footer while their content retains compact spacing.
        'status-bar': "h-full gap-1.5 px-1 py-0.5 text-xs [&_svg:not([class*='size-'])]:size-3",
        sm: 'h-8 gap-1.5 rounded-md px-3 has-[>svg]:px-2.5',
        // Why: the tool cap is sized to its track's content box, so the selected
        // surface keeps a 3px inset from the track edge instead of filling it.
        'workspace-tool': 'size-6 p-0',
        lg: 'h-10 rounded-md px-6 has-[>svg]:px-4',
        icon: 'size-9',
        'icon-xs': "size-6 rounded-md [&_svg:not([class*='size-'])]:size-3",
        'icon-toolbar': "size-7 [&_svg:not([class*='size-'])]:size-3.5",
        'icon-palette-control': "size-[30px] p-0 [&_svg:not([class*='size-'])]:size-[18px]",
        'icon-palette-page': "size-7 [&_svg:not([class*='size-'])]:size-[18px]",
        'icon-palette-swatch': 'size-[26px] p-0',
        'icon-status-bar': "h-full w-5 [&_svg:not([class*='size-'])]:size-3",
        'icon-status-bar-wide': "h-full w-6 [&_svg:not([class*='size-'])]:size-3",
        'icon-sm': 'size-8',
        'icon-lg': 'size-10',
        // Why: titlebar controls share the row height while retaining compact horizontal rhythm.
        'icon-titlebar': "h-full w-7 [&_svg:not([class*='size-'])]:size-4",
        'icon-titlebar-compact': "h-full w-6 [&_svg:not([class*='size-'])]:size-4",
        'icon-titlebar-wide': "h-full w-9 [&_svg:not([class*='size-'])]:size-4"
      },
      seam: {
        default: '',
        // Why: adjacent titlebar regions let the following control own their one shared seam.
        'merge-next': 'border-r-0'
      }
    },
    defaultVariants: {
      variant: 'default',
      size: 'default',
      seam: 'default'
    }
  }
)

type ButtonProps =
  // Base UI's Button typing allows a callback className; keep the wrapper's
  // className a plain string so it stays compatible with the cva call below.
  Omit<ButtonPrimitive.Props, 'className'> &
    VariantProps<typeof buttonVariants> & { className?: string }

function Button({
  className,
  ref,
  seam = 'default',
  variant = 'default',
  size = 'default',
  ...props
}: ButtonProps): React.JSX.Element {
  // Base UI Button supports `render` natively, replacing the Slot/asChild idiom.
  return (
    <ButtonPrimitive
      ref={ref}
      data-slot="button"
      data-variant={variant}
      data-size={size}
      className={cn(buttonVariants({ variant, size, seam, className }))}
      {...props}
    />
  )
}

export { Button, buttonVariants }
