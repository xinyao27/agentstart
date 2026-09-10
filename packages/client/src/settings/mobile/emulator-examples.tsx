import { toast } from 'sonner'
import { translate } from '~renderer/i18n/i18n'
import { Copy, Sparkle as Sparkles } from '~renderer/icons/hugeicons'
import { shellClient } from '~renderer/runtime/shell-client'
import { Button } from '~renderer/ui/button'
import { cn } from '~renderer/ui/class-names'
import { Tooltip, TooltipContent, TooltipProvider, TooltipTrigger } from '~renderer/ui/tooltip'

const EMULATOR_EXAMPLE_PROMPTS = [
  'Using AgentStart CLI, attach to the active iPhone simulator, sign in with the test account, complete onboarding, and tell me where the flow feels confusing.',
  'With AgentStart CLI, run through the mobile checkout flow from product search to confirmation, capture any broken screens, and summarize the exact step that fails.',
  'Using AgentStart CLI, grant camera permission, scan a test QR code or inject a camera fixture, finish the account-linking flow, and report whether the app reaches the success state.'
] as const

async function copyPrompt(prompt: string): Promise<void> {
  try {
    await shellClient.ui.writeClipboardText(prompt)
    toast.success(
      translate('auto.components.settings.MobileEmulatorExamples.2b077b5544', 'Copied prompt.')
    )
  } catch (error) {
    toast.error(
      error instanceof Error
        ? error.message
        : translate(
            'auto.components.settings.MobileEmulatorExamples.1f608e7d60',
            'Failed to copy prompt.'
          )
    )
  }
}

type MobileEmulatorExamplesProps = {
  variant?: 'card' | 'inline'
}

export function MobileEmulatorExamples({
  variant = 'card'
}: MobileEmulatorExamplesProps): React.JSX.Element {
  return (
    <div
      className={cn(
        variant === 'card' ? 'rounded-xl border border-border/60 bg-card/50 p-4' : 'py-3'
      )}
    >
      <div className="flex items-center gap-2">
        <Sparkles className="text-muted-foreground size-3.5" />
        <p className="text-sm font-medium">
          {translate(
            'auto.components.settings.MobileEmulatorExamples.0820b3f84f',
            'Try it — example prompts'
          )}
        </p>
      </div>
      <p className="text-muted-foreground mt-1 text-xs">
        {translate(
          'auto.components.settings.MobileEmulatorExamples.4daa95f25a',
          'Paste any of these into Claude Code, Codex, or another agent in a project where the AgentStart CLI skill is installed.'
        )}
      </p>
      <ul className="mt-3 space-y-2">
        {EMULATOR_EXAMPLE_PROMPTS.map((prompt) => (
          <li
            key={prompt}
            className="border-border bg-background flex items-start gap-2 rounded-lg border px-3 py-2"
          >
            <p className="text-foreground/90 flex-1 text-[11px] leading-relaxed">
              {translate('auto.components.settings.MobileEmulatorExamples.b525ff2b12', '"')}
              {prompt}
              {translate('auto.components.settings.MobileEmulatorExamples.d151e25078', '"')}
            </p>
            <TooltipProvider>
              <Tooltip>
                <TooltipTrigger
                  render={
                    <Button
                      type="button"
                      variant="ghost"
                      size="icon-xs"
                      aria-label={translate(
                        'auto.components.settings.MobileEmulatorExamples.c12b253997',
                        'Copy example prompt'
                      )}
                      onClick={() => void copyPrompt(prompt)}
                    >
                      <Copy className="size-3.5" />
                    </Button>
                  }
                />
                <TooltipContent side="left" sideOffset={6}>
                  {translate('auto.components.settings.MobileEmulatorExamples.edf13dd03b', 'Copy')}
                </TooltipContent>
              </Tooltip>
            </TooltipProvider>
          </li>
        ))}
      </ul>
    </div>
  )
}
