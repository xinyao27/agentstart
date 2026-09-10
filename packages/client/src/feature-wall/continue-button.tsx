import type { JSX } from 'react'
import { ArrowElbowDownLeft as CornerDownLeft } from '~renderer/icons/hugeicons'
import { Button } from '~renderer/ui/button'

export function FeatureWallContinueButton(props: {
  label: string
  enableKeyboardShortcut: boolean
  shortcutModifierLabel: string
  onClick: () => void
}): JSX.Element {
  return (
    <Button type="button" variant="default" className="gap-2 px-5" onClick={props.onClick}>
      {props.label}
      {props.enableKeyboardShortcut ? (
        <span className="border-primary-foreground/20 ml-1 inline-flex items-center gap-0.5 rounded border px-1.5 py-0.5 text-[10px] leading-none font-medium text-current/80">
          <span>{props.shortcutModifierLabel}</span>
          <CornerDownLeft className="size-3" />
        </span>
      ) : null}
    </Button>
  )
}
