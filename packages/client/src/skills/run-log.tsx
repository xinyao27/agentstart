import { translate } from '~renderer/i18n/i18n'
import { CaretDown as ChevronDown } from '~renderer/icons/hugeicons'
import type { SkillUpdateRun } from '~renderer/skills/freshness-model'
import { Button } from '~renderer/ui/button'
import { Collapsible, CollapsibleContent, CollapsibleTrigger } from '~renderer/ui/collapsible'
import { ScrollArea } from '~renderer/ui/scroll-area'

export function SkillRunLog({ output }: { output: string }): React.JSX.Element | null {
  if (!output.trim()) {
    return null
  }
  return (
    <Collapsible>
      <CollapsibleTrigger
        render={
          <Button type="button" variant="ghost" size="xs" className="group -ml-2 gap-1.5">
            <ChevronDown className="size-3.5 transition-transform group-data-[state=open]:rotate-180" />
            {translate('auto.components.skills.SkillRunLog.showLog', 'Show log')}
          </Button>
        }
      />
      <CollapsibleContent className="mt-1">
        {/* Why: max-height lives on the viewport — the root has no definite height
            for the viewport's h-full to resolve against, so a root-level cap would
            let the content paint past the box instead of scrolling. */}
        <ScrollArea className="border-border bg-muted border" viewportClassName="max-h-40">
          <pre className="text-muted-foreground px-3 py-2.5 font-mono text-[11px] leading-relaxed break-words whitespace-pre-wrap">
            {output.trim()}
          </pre>
        </ScrollArea>
      </CollapsibleContent>
    </Collapsible>
  )
}

/** Operation-neutral copy for the install and remove surfaces; the update
 *  dialog keeps its own wording because it also explains partial convergence. */
export function describeSkillRunFailure(run: Extract<SkillUpdateRun, { state: 'error' }>): string {
  switch (run.kind) {
    case 'launch-failed':
      return translate(
        'auto.components.skills.SkillRunLog.launchFailed',
        'The skills command could not start: {{value0}}',
        { value0: run.detail }
      )
    case 'command-exited':
      return run.exitCode == null
        ? translate(
            'auto.components.skills.SkillRunLog.commandExitedUnknown',
            'The skills command stopped unexpectedly.'
          )
        : translate(
            'auto.components.skills.SkillRunLog.commandExited',
            'The skills command exited with code {{value0}}.',
            { value0: run.exitCode }
          )
    case 'incomplete':
      return translate(
        'auto.components.skills.SkillRunLog.incomplete',
        'The command finished, but the skills did not land on disk.'
      )
  }
}
