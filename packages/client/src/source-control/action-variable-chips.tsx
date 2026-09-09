import {
  SOURCE_CONTROL_ACTION_VARIABLES,
  type SourceControlActionId
} from '@yiru/protocol/source-control/ai-actions'
import type React from 'react'
import { translate } from '~renderer/i18n/i18n'
import { BracketsCurly as Braces } from '~renderer/icons/hugeicons'

import { Button } from '../ui/button'
import { HoverCard, HoverCardContent, HoverCardTrigger } from '../ui/hover-card'
import { getSourceControlActionVariableInfo } from './ai/action-copy'

type SourceControlActionVariableChipsProps = {
  actionId: SourceControlActionId
  disabled?: boolean
  variablePreviews?: Partial<Record<string, string>>
  onInsert: (variable: string) => void
}

function hasVariablePreview(
  variablePreviews: Partial<Record<string, string>> | undefined,
  variable: string
): boolean {
  return Boolean(
    variablePreviews &&
    Object.prototype.hasOwnProperty.call(variablePreviews, variable) &&
    variablePreviews[variable] !== undefined &&
    variablePreviews[variable] !== null
  )
}

function SourceControlVariableDetails({
  variable,
  preview
}: {
  variable: string
  preview?: string
}): React.JSX.Element {
  if (preview !== undefined) {
    if (variable === 'basePrompt') {
      return (
        <pre className="font-mono text-[11px] leading-relaxed break-words whitespace-pre-wrap">
          {preview ||
            translate(
              'auto.components.source.control.SourceControlActionVariableChips.4bf6d88039',
              '(empty)'
            )}
        </pre>
      )
    }

    return (
      <div className="space-y-1.5">
        <div className="text-muted-foreground font-mono text-[11px]">{`{${variable}}`}</div>
        <pre className="bg-background/60 p-2 font-mono text-[11px] leading-relaxed break-words whitespace-pre-wrap">
          {preview ||
            translate(
              'auto.components.source.control.SourceControlActionVariableChips.4bf6d88039',
              '(empty)'
            )}
        </pre>
      </div>
    )
  }

  const info = getSourceControlActionVariableInfo()[variable]
  return (
    <div className="max-w-80 space-y-2 text-left leading-relaxed">
      <div className="space-y-0.5">
        <div className="font-mono text-[11px]">{`{${variable}}`}</div>
        <div className="text-muted-foreground">{info.description}</div>
      </div>
      <div className="space-y-1">
        <div className="text-muted-foreground text-[10px] font-semibold tracking-wide uppercase">
          {translate(
            'auto.components.source.control.SourceControlActionVariableChips.6b921a0ac2',
            'Example'
          )}
        </div>
        <pre className="bg-background/60 p-2 font-mono text-[11px] leading-relaxed break-words whitespace-pre-wrap">
          {info.example}
        </pre>
      </div>
    </div>
  )
}

export function SourceControlActionVariableChips({
  actionId,
  disabled = false,
  variablePreviews,
  onInsert
}: SourceControlActionVariableChipsProps): React.JSX.Element {
  return (
    <div className="flex flex-wrap items-center gap-1.5">
      <span className="text-muted-foreground inline-flex items-center gap-1 text-[11px]">
        <Braces className="size-3" />
        {translate(
          'auto.components.source.control.SourceControlActionVariableChips.1b77798d5f',
          'Variables'
        )}
      </span>
      {SOURCE_CONTROL_ACTION_VARIABLES[actionId].map((variable) => {
        const preview = hasVariablePreview(variablePreviews, variable)
          ? variablePreviews?.[variable]
          : undefined
        return (
          <HoverCard key={variable}>
            <HoverCardTrigger
              delay={150}
              closeDelay={120}
              render={
                <span className="inline-flex">
                  <Button
                    type="button"
                    variant="ghost"
                    size="xs"
                    disabled={disabled}
                    className="h-5 px-1.5 font-mono text-[10px]"
                    onClick={() => onInsert(variable)}
                  >
                    {`{${variable}}`}
                  </Button>
                </span>
              }
            />
            <HoverCardContent
              side="top"
              sideOffset={6}
              className="scrollbar-sleek max-h-[min(18rem,calc(100vh-2rem))] w-[min(32rem,calc(100vw-2rem))] overflow-y-auto p-2 text-left text-xs"
            >
              <SourceControlVariableDetails variable={variable} preview={preview} />
            </HoverCardContent>
          </HoverCard>
        )
      })}
    </div>
  )
}
