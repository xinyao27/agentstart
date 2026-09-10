import type { JSX } from 'react'
import { translate } from '~renderer/i18n/i18n'
import { formatShortcutLabel, useShortcutLabel } from '~renderer/keyboard-input/use-shortcut-label'
import { Badge } from '~renderer/ui/badge'
import { Button } from '~renderer/ui/button'
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle
} from '~renderer/ui/dialog'

import type { FeatureTip } from './catalog'
import { CommandPaletteFeatureTipVisual } from './command-palette-feature-tip-visual'
import { FeatureTipActions } from './feature-tip-actions'

export function CommandPaletteTipDialog({
  open,
  tip,
  primaryBusy,
  onOpenChange,
  onPrimaryAction,
  onSkip,
  onRebindClick
}: {
  open: boolean
  tip: FeatureTip
  primaryBusy: boolean
  onOpenChange: (open: boolean) => void
  onPrimaryAction: () => void
  onSkip: () => void
  onRebindClick: () => void
}): JSX.Element {
  // Why: read the live binding so the title chip stays correct after a rebind
  // on every platform, matching the visual's key chips.
  const commandPaletteShortcutLabel = useShortcutLabel('app.commandPalette')
  const displayShortcutLabel =
    commandPaletteShortcutLabel !== 'Unassigned'
      ? commandPaletteShortcutLabel
      : formatShortcutLabel('app.commandPalette')
  // The tip's title uses "<shortcut>" as a placeholder token; split it so we
  // can render the live label as a styled <kbd> chip inline. Missing token
  // degrades to the plain title.
  const titleParts = tip.title.split('<shortcut>')
  const titlePrefix = titleParts[0]
  const titleSuffix = titleParts.slice(1).join('<shortcut>')

  // Why: match the horizontal layout (text left, visual/animation right) used by the
  // CLI tip for a consistent "feature education" presentation; keeps the palette demo
  // prominent on the right.
  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent
        className="!flex max-h-[calc(100vh-2rem)] flex-col gap-0 overflow-hidden bg-[color-mix(in_srgb,var(--foreground)_8%,var(--background))] p-0 sm:max-w-4xl md:!h-[min(27rem,calc(100vh-2rem))] md:!flex-row dark:bg-[color-mix(in_srgb,var(--foreground)_16%,var(--background))]"
        showCloseButton
        // Why: opening an informational tip should not move focus into its
        // optional shortcut-rebinding action.
        initialFocus={false}
      >
        <div className="scrollbar-sleek flex min-h-0 min-w-0 flex-1 flex-col justify-between overflow-y-auto px-8 py-9 md:shrink-0 md:basis-1/2">
          <DialogHeader className="gap-4 text-left">
            <div>
              {/* Why: uppercase eyebrow reads as a category label, not a feature launch. */}
              <Badge
                variant="outline"
                className="text-muted-foreground mb-3 rounded-md px-2 py-0.5 text-[10px] font-semibold tracking-[0.12em] uppercase"
              >
                {tip.eyebrow.toUpperCase()}
              </Badge>
              {/* Why: flow the shortcut chip as inline text (not a flex item) so the
                  short Mac label (⌘⇧J) stays on one line, while a wide label like
                  "Ctrl+Shift+J" wraps to the next line only when it doesn't fit —
                  instead of being pushed to the right edge on Win/Linux. */}
              <DialogTitle className="text-2xl leading-tight font-semibold tracking-tight md:text-[1.75rem]">
                {titlePrefix.trimEnd()}
                {displayShortcutLabel ? (
                  <>
                    {' '}
                    <kbd className="border-border bg-card text-foreground ml-0.5 inline-flex items-center rounded-md border px-2 py-0.5 align-middle font-mono text-base font-medium whitespace-nowrap">
                      {displayShortcutLabel}
                    </kbd>
                  </>
                ) : null}
                {titleSuffix ? ` ${titleSuffix}` : null}
              </DialogTitle>
              <DialogDescription className="mt-3 max-w-2xl space-y-3 text-sm leading-relaxed">
                <span className="block">{tip.description}</span>
                <span className="text-muted-foreground block">
                  {translate(
                    'auto.components.feature.tips.CommandPaletteTipDialog.8241897205',
                    'Rebind the shortcut anytime in'
                  )}{' '}
                  <Button
                    variant="ghost"
                    size="xs"
                    type="button"
                    onClick={onRebindClick}
                    className="text-foreground decoration-foreground/30 hover:decoration-foreground focus-visible:decoration-foreground inline h-auto appearance-none border-0 bg-transparent p-0 underline underline-offset-2 transition-colors"
                  >
                    {translate(
                      'auto.components.feature.tips.CommandPaletteTipDialog.c0bb9f869b',
                      'Settings → Shortcuts'
                    )}
                  </Button>
                  .
                </span>
              </DialogDescription>
            </div>
          </DialogHeader>

          <DialogFooter className="mt-8 flex sm:justify-stretch">
            <FeatureTipActions
              currentTip={tip}
              primaryBusy={primaryBusy}
              onPrimaryAction={onPrimaryAction}
              onSkip={onSkip}
              showSkip={false}
              fullWidth
            />
          </DialogFooter>
        </div>
        <div className="bg-muted/60 md:border-border/70 flex min-h-0 min-w-0 shrink-0 self-stretch overflow-hidden md:basis-1/2 md:border-l">
          <div className="h-full min-h-[23rem] w-full md:w-[29.4rem]">
            <CommandPaletteFeatureTipVisual />
          </div>
        </div>
      </DialogContent>
    </Dialog>
  )
}
