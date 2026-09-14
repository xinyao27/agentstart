import { translate } from '~renderer/i18n/i18n'
import { Sparkle as Sparkles, Square } from '~renderer/icons/hugeicons'
import { LoadingIndicator } from '~renderer/loading/indicator'
import { Button } from '~renderer/ui/button'
import { cn } from '~renderer/ui/class-names'
import { Textarea } from '~renderer/ui/textarea'
import { Tooltip, TooltipContent, TooltipTrigger } from '~renderer/ui/tooltip'

export function SourceControlCommitComposer({
  commitMessage,
  describedBy,
  generateDisabledReason,
  isDisabled,
  isGenerateDisabled,
  isGenerating,
  onCancelGenerate,
  onCommitMessageChange,
  onGenerate,
  rows,
  showGenerate
}: {
  commitMessage: string
  describedBy?: string
  generateDisabledReason?: string
  isDisabled: boolean
  isGenerateDisabled: boolean
  isGenerating: boolean
  onCancelGenerate: () => void
  onCommitMessageChange: (message: string) => void
  onGenerate: () => void
  rows: number
  showGenerate: boolean
}): React.JSX.Element {
  return (
    <div className="relative">
      <Textarea
        rows={rows}
        value={commitMessage}
        disabled={isDisabled}
        onChange={(event) => onCommitMessageChange(event.target.value)}
        placeholder={translate(
          'auto.components.workspacePanel.SourceControl.0d0a8359d3',
          'Message'
        )}
        aria-label={translate(
          'auto.components.workspacePanel.SourceControl.b94112eb9e',
          'Commit message'
        )}
        aria-describedby={describedBy}
        // Why: reserve space for the absolute Generate action and match Input surface tokens.
        className={cn(
          'mt-0.5 min-h-14 w-full resize-none appearance-none border border-input bg-background px-2 py-1.5 text-xs text-foreground outline-none placeholder:text-muted-foreground/70 focus-visible:border-ring disabled:cursor-not-allowed disabled:border-input disabled:bg-background disabled:text-foreground dark:bg-input/30 dark:disabled:bg-input/30',
          showGenerate ? 'pr-8' : ''
        )}
      />
      {showGenerate ? (
        isGenerating ? (
          <Tooltip>
            <TooltipTrigger
              render={
                <Button
                  variant="ghost"
                  size="icon-xs"
                  type="button"
                  onClick={onCancelGenerate}
                  title={translate(
                    'auto.components.workspacePanel.SourceControl.527e130b6f',
                    'Stop generating'
                  )}
                  aria-label={translate(
                    'auto.components.workspacePanel.SourceControl.ddc1fbd690',
                    'Stop generating commit message'
                  )}
                  className="group absolute top-1.5 right-1.5"
                >
                  <LoadingIndicator className="size-3.5 group-hover:hidden group-focus-visible:hidden" />
                  <Square className="hidden size-3.5 fill-current group-hover:block group-focus-visible:block" />
                </Button>
              }
            />
            <TooltipContent side="left" sideOffset={6}>
              {translate(
                'auto.components.workspacePanel.SourceControl.37a81f29ad',
                'Generating commit message. Click to stop.'
              )}
            </TooltipContent>
          </Tooltip>
        ) : (
          <Tooltip>
            <TooltipTrigger
              render={
                <Button
                  variant="quiet"
                  size="icon-xs"
                  type="button"
                  aria-disabled={isGenerateDisabled}
                  onClick={(event) => {
                    if (isGenerateDisabled) {
                      event.preventDefault()
                      return
                    }
                    onGenerate()
                  }}
                  title={
                    generateDisabledReason ??
                    translate(
                      'auto.components.workspacePanel.SourceControl.b16b8f0e4b',
                      'ai commit msg'
                    )
                  }
                  aria-label={translate(
                    'auto.components.workspacePanel.SourceControl.461575b9bc',
                    'Generate commit message with AI'
                  )}
                  className={cn(
                    'absolute right-1.5 top-1.5 border hover:bg-muted/60 ',
                    isGenerateDisabled &&
                      'cursor-not-allowed opacity-40 hover:bg-transparent hover:text-muted-foreground'
                  )}
                >
                  <Sparkles className="size-3.5" />
                </Button>
              }
            />
            <TooltipContent side="left" sideOffset={6}>
              {generateDisabledReason ??
                translate(
                  'auto.components.workspacePanel.SourceControl.b16b8f0e4b',
                  'ai commit msg'
                )}
            </TooltipContent>
          </Tooltip>
        )
      ) : null}
    </div>
  )
}
