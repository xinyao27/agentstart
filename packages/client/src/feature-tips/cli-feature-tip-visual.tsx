import { useEffect, useState, type JSX } from 'react'
import { AgentsOrchestrationVisual } from '~renderer/feature-wall/agents-orchestration-visual'
import {
  ORCHESTRATION_CLI_COMMAND_LOOP_MS,
  ORCHESTRATION_CLI_COMMAND_TIMINGS_MS
} from '~renderer/feature-wall/agents-orchestration/orchestration-types'
import { translate } from '~renderer/i18n/i18n'
import { usePrefersReducedMotion } from '~renderer/react/use-prefers-reduced-motion'
import { cn } from '~renderer/ui/class-names'

const CLI_AGENT_COMMANDS = [
  'agentstart worktree create --name auth-pr-1',
  'agentstart worktree create --name auth-pr-2',
  'agentstart orchestration dispatch --task pr1 --to w1',
  'agentstart orchestration dispatch --task pr2 --to w2'
]

export function CliFeatureTipVisual(): JSX.Element {
  const reducedMotion = usePrefersReducedMotion()
  const [animatedVisibleCommandCount, setAnimatedVisibleCommandCount] = useState(0)
  // Why: reduced-motion users should see the static completed state without a
  // post-render state repair; only the animated path needs timer-backed state.
  const visibleCommandCount = reducedMotion
    ? CLI_AGENT_COMMANDS.length
    : animatedVisibleCommandCount

  useEffect(() => {
    if (reducedMotion) {
      return
    }

    let cancelled = false
    const timeouts: number[] = []
    const later = (fn: () => void, ms: number): void => {
      timeouts.push(window.setTimeout(() => !cancelled && fn(), ms))
    }

    // Why: terminal lines mirror the orchestration tour beat timings so the
    // shell shows each command as the parent agent runs it.
    const runOnce = (): void => {
      setAnimatedVisibleCommandCount(0)
      ORCHESTRATION_CLI_COMMAND_TIMINGS_MS.forEach((ms, index) => {
        later(() => setAnimatedVisibleCommandCount(index + 1), ms)
      })
      later(runOnce, ORCHESTRATION_CLI_COMMAND_LOOP_MS)
    }

    runOnce()
    return () => {
      cancelled = true
      timeouts.forEach((id) => window.clearTimeout(id))
    }
  }, [reducedMotion])

  return (
    <div
      className="bg-muted/60 relative flex min-h-[27rem] flex-col overflow-hidden px-6 py-7"
      aria-hidden="true"
    >
      <div className="border-border/70 bg-card relative rounded-lg border">
        <div className="border-border/70 flex items-center gap-2 border-b px-3 py-2">
          <span className="bg-muted-foreground/35 size-2 rounded-full" />
          <span className="bg-muted-foreground/25 size-2 rounded-full" />
          <span className="bg-muted-foreground/20 size-2 rounded-full" />
        </div>
        <div className="text-foreground space-y-1.5 px-3 py-3 font-mono text-[10.5px] leading-[1.35]">
          <div className="text-muted-foreground truncate">
            <span className="text-foreground mr-1.5">●</span>
            {translate(
              'auto.components.feature.tips.CliFeatureTipVisual.22e62f3bab',
              'Claude Code session started'
            )}
          </div>
          {CLI_AGENT_COMMANDS.map((command, index) => {
            const isVisible = index < visibleCommandCount
            const isCurrentLine = isVisible && index === visibleCommandCount - 1
            return (
              <div
                key={command}
                className={cn(
                  'truncate',
                  isVisible
                    ? 'animate-[cli-tip-command-line_160ms_ease-out_both] motion-reduce:animate-none'
                    : 'invisible'
                )}
              >
                <span className="text-foreground">
                  {translate('auto.components.feature.tips.CliFeatureTipVisual.badb4fc342', '>')}
                </span>
                <span>{command}</span>
                {isCurrentLine ? (
                  <span className="bg-foreground/70 ml-0.5 inline-block h-3 w-1 translate-y-0.5 animate-[cli-tip-caret_0.9s_steps(1,end)_infinite] rounded-sm motion-reduce:translate-y-0 motion-reduce:animate-none" />
                ) : null}
              </div>
            )
          })}
        </div>
      </div>

      <div className="cli-tip-orchestration-frame border-border/70 bg-background relative mt-5 flex h-[17rem] items-center justify-center overflow-hidden rounded-lg border px-5">
        <div className="origin-center">
          <AgentsOrchestrationVisual
            activeStepId="orchestration"
            reducedMotion={reducedMotion}
            widthPx={350}
            heightPx={252}
            orchestrationCreatedChildCount={Math.min(visibleCommandCount, 2)}
            orchestrationLoopMs={ORCHESTRATION_CLI_COMMAND_LOOP_MS}
            orchestrationShowResponseBeats={false}
          />
        </div>
      </div>
    </div>
  )
}
