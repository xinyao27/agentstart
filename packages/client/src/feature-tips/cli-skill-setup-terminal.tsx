import { toast } from 'sonner'
import { AGENTSTART_CLI_ORCHESTRATION_DEBUG_SKILL_INSTALL_COMMAND } from '~renderer/agent/feature-install-commands'
import { translate } from '~renderer/i18n/i18n'
import { Copy } from '~renderer/icons/hugeicons'
import { OnboardingInlineCommandTerminal } from '~renderer/onboarding/inline-command-terminal'
import { shellClient } from '~renderer/runtime/shell-client'
import { Button } from '~renderer/ui/button'
import { Tooltip, TooltipContent, TooltipTrigger } from '~renderer/ui/tooltip'

export function CliSkillSetupTerminal(): React.JSX.Element {
  const handleCopySkillCommand = async (): Promise<void> => {
    try {
      await shellClient.ui.writeClipboardText(
        AGENTSTART_CLI_ORCHESTRATION_DEBUG_SKILL_INSTALL_COMMAND
      )
      toast.success(
        translate(
          'auto.components.feature.tips.CliSkillSetupTerminal.b8ad063571',
          'Copied the skill install command.'
        )
      )
    } catch (error) {
      toast.error(
        error instanceof Error
          ? error.message
          : translate(
              'auto.components.feature.tips.CliSkillSetupTerminal.6ff813fc1d',
              'Failed to copy skill command.'
            )
      )
    }
  }

  return (
    <div className="min-w-0">
      <div className="border-border bg-muted/35 flex min-w-0 items-center gap-2 rounded-md border px-3 py-2">
        <code className="scrollbar-sleek text-muted-foreground min-w-0 flex-1 overflow-x-auto font-mono text-xs whitespace-nowrap">
          {AGENTSTART_CLI_ORCHESTRATION_DEBUG_SKILL_INSTALL_COMMAND}
        </code>
        <Tooltip>
          <TooltipTrigger
            render={
              <Button
                variant="ghost"
                size="icon-sm"
                className="shrink-0"
                onClick={() => void handleCopySkillCommand()}
                aria-label={translate(
                  'auto.components.feature.tips.CliSkillSetupTerminal.5eca672aac',
                  'Copy skill install command'
                )}
              >
                <Copy className="size-4" />
              </Button>
            }
          />
          <TooltipContent side="top" sideOffset={4}>
            {translate(
              'auto.components.feature.tips.CliSkillSetupTerminal.5c3aee22c0',
              'Copy command'
            )}
          </TooltipContent>
        </Tooltip>
      </div>
      <OnboardingInlineCommandTerminal
        command={AGENTSTART_CLI_ORCHESTRATION_DEBUG_SKILL_INSTALL_COMMAND}
        title={translate(
          'auto.components.feature.tips.CliSkillSetupTerminal.84e9576dac',
          'Skill setup'
        )}
        ariaLabel={translate(
          'auto.components.feature.tips.CliSkillSetupTerminal.43b60ec5c3',
          'AgentStart CLI and orchestration skill install terminal'
        )}
        description={translate(
          'auto.components.feature.tips.CliSkillSetupTerminal.1953e90447',
          'Press Enter to install the AgentStart CLI orchestration skill for your agents.'
        )}
        terminalHeightPx={280}
        terminalTopMarginPx={8}
        descriptionPaddingClassName="px-4 py-2"
        autoScrollIntoView={false}
        worktreeId="feature-tip-cli-skills-terminal"
      />
    </div>
  )
}
