import { useEffect, useRef, useState } from 'react'
import type { JSX, MutableRefObject, RefObject } from 'react'
import { translate } from '~renderer/i18n/i18n'
import { CaretDown as ChevronDown, FlowArrow as Workflow } from '~renderer/icons/hugeicons'
import { useEventCallback } from '~renderer/react/use-event-callback'
import { ClaudeIcon, OpenAIIcon } from '~renderer/status-bar/icons'
import { cn } from '~renderer/ui/class-names'

import { arrowPathFromCoordTo } from './orchestration-bubble-path'
import { AgentRow, WorkspaceCard } from './orchestration-cards'
import type { AgentKey, RowFlash, RowMessages, RowPending, RowState } from './orchestration-types'

type ArrowLayout = {
  height: number
  paths: string[]
  width: number
}

export type OrchestrationBubble = {
  id: number
  path: string
  phase: 'ready' | 'in-flight' | 'landed'
}

export type OrchestrationStageRefs = {
  registerRow: (key: AgentKey, node: HTMLDivElement | null) => void
  rows: MutableRefObject<Partial<Record<AgentKey, HTMLDivElement | null>>>
  stage: RefObject<HTMLDivElement | null>
}

function measureArrowLayout(stage: HTMLDivElement): ArrowLayout | undefined {
  const coordinator = stage.querySelector('[data-feature-wall-card="coord"]')
  if (!(coordinator instanceof HTMLElement)) {
    return undefined
  }
  const stageRect = stage.getBoundingClientRect()
  const targets = [
    stage.querySelector('[data-feature-wall-card="child"]'),
    stage.querySelector('[data-feature-wall-card="child-claude"]')
  ]
  const paths = targets.flatMap((target) =>
    target instanceof HTMLElement ? [arrowPathFromCoordTo(coordinator, target, stageRect)] : []
  )
  return { height: stageRect.height, paths, width: stageRect.width }
}

function useArrowLayout(
  stageRef: RefObject<HTMLDivElement | null>,
  childCount: number
): ArrowLayout | undefined {
  const [layout, setLayout] = useState<ArrowLayout>()

  useEffect(() => {
    const stage = stageRef.current
    if (!stage || childCount < 2) {
      return undefined
    }
    let frameId = 0
    const measure = (): void => {
      cancelAnimationFrame(frameId)
      frameId = requestAnimationFrame(() => setLayout(measureArrowLayout(stage)))
    }
    const observer = new ResizeObserver(measure)
    observer.observe(stage)
    measure()
    return () => {
      cancelAnimationFrame(frameId)
      observer.disconnect()
    }
  }, [childCount, stageRef])

  return childCount >= 2 ? layout : undefined
}

function MessageBubble(props: { bubble: OrchestrationBubble }): JSX.Element {
  return (
    <div
      className={cn('feature-wall-bubble', props.bubble.phase)}
      style={{ offsetPath: `path("${props.bubble.path}")` }}
      aria-hidden
    >
      <svg
        viewBox="0 0 24 24"
        fill="none"
        stroke="currentColor"
        strokeWidth="2"
        strokeLinecap="round"
        strokeLinejoin="round"
      >
        <rect x="3" y="5" width="18" height="14" rx="2" />
        <path d="M3 7l9 6 9-6" />
      </svg>
    </div>
  )
}

export function OrchestrationStage(props: {
  bubble?: OrchestrationBubble
  childCount: number
  rowFlash: RowFlash
  rowMessages: RowMessages
  rowPending: RowPending
  rowState: RowState
  stageRefs: OrchestrationStageRefs
}): JSX.Element {
  const { bubble, childCount, rowFlash, rowMessages, rowPending, rowState, stageRefs } = props
  const { registerRow, stage } = stageRefs
  const arrowLayout = useArrowLayout(stage, childCount)

  return (
    <div
      ref={stage}
      className="feature-wall-orch-stage relative grid"
      style={{
        gridTemplateColumns: 'minmax(0, 1fr)',
        gridAutoRows: 'min-content',
        rowGap: 28,
        paddingRight: 56,
        alignItems: 'start',
        alignContent: 'center',
        height: '100%'
      }}
    >
      <div className="relative flex min-w-0 flex-col gap-1.5">
        <WorkspaceCard
          variant="coordinator"
          name={translate(
            'auto.components.feature.wall.agents.orchestration.StatusesPage.79971d1539',
            'redesign auth flow'
          )}
          dataCard="coord"
          rows={[
            <AgentRow
              key="coord-claude"
              agentKey="coord-claude"
              icon={<ClaudeIcon size={13} />}
              state={rowState['coord-claude']}
              message={rowMessages['coord-claude']}
              flashKey={rowFlash['coord-claude'] ?? 0}
              registerRef={(node) => registerRow('coord-claude', node)}
            />
          ]}
        />

        <div
          className="flex justify-start"
          style={{ marginLeft: 'var(--feature-wall-child-indent, 28px)' }}
        >
          <span
            className="border-border bg-card text-muted-foreground inline-flex items-center gap-1 rounded-md border px-1.5"
            style={{ height: 18, fontSize: 10, fontWeight: 500 }}
            aria-label={translate(
              'auto.components.feature.wall.agents.orchestration.OrchestrationPage.862605d066',
              '2 child workspaces'
            )}
          >
            <Workflow className="size-2.5" aria-hidden />
            <span className="truncate">
              {translate(
                'auto.components.feature.wall.agents.orchestration.OrchestrationPage.30b509a467',
                '2 children'
              )}
            </span>
            <ChevronDown className="size-2.5" aria-hidden />
          </span>
        </div>

        <div
          className="feature-wall-children-wrapper"
          data-visible={childCount > 0 ? 'true' : undefined}
          style={{
            width: 'calc(100% - var(--feature-wall-child-indent, 28px))',
            marginLeft: 'auto',
            display: 'flex',
            flexDirection: 'column',
            gap: 8
          }}
        >
          {childCount >= 1 ? (
            <div className="feature-wall-child-card-shell">
              <WorkspaceCard
                variant="default"
                name="PR 1/2: migrate users.sql"
                dataCard="child"
                childPadding
                rows={[
                  <AgentRow
                    key="child-codex"
                    agentKey="child-codex"
                    icon={<OpenAIIcon size={13} />}
                    state={rowState['child-codex']}
                    message={rowMessages['child-codex']}
                    flashKey={rowFlash['child-codex'] ?? 0}
                    pending={rowPending['child-codex']}
                    spawnRow
                    registerRef={(node) => registerRow('child-codex', node)}
                  />
                ]}
              />
            </div>
          ) : null}
          {childCount >= 2 ? (
            <div className="feature-wall-child-card-shell">
              <WorkspaceCard
                variant="default"
                name="PR 2/2: withSession middleware"
                dataCard="child-claude"
                childPadding
                rows={[
                  <AgentRow
                    key="child-claude"
                    agentKey="child-claude"
                    icon={<ClaudeIcon size={13} />}
                    state={rowState['child-claude']}
                    message={rowMessages['child-claude']}
                    flashKey={rowFlash['child-claude'] ?? 0}
                    pending={rowPending['child-claude']}
                    spawnRow
                    registerRef={(node) => registerRow('child-claude', node)}
                  />
                ]}
              />
            </div>
          ) : null}
        </div>
      </div>

      {arrowLayout ? (
        <svg
          className="feature-wall-orch-arrows"
          aria-hidden
          viewBox={`0 0 ${arrowLayout.width} ${arrowLayout.height}`}
          width={arrowLayout.width}
          height={arrowLayout.height}
          preserveAspectRatio="none"
        >
          {arrowLayout.paths.map((path) => (
            <path key={path} d={path} />
          ))}
        </svg>
      ) : null}
      <div aria-hidden style={{ position: 'absolute', inset: 0, pointerEvents: 'none', zIndex: 3 }}>
        {bubble ? <MessageBubble bubble={bubble} /> : null}
      </div>
    </div>
  )
}

export function useOrchestrationStageRefs(): OrchestrationStageRefs {
  const rows = useRef<Partial<Record<AgentKey, HTMLDivElement | null>>>({})
  const stage = useRef<HTMLDivElement | null>(null)
  const registerRow = useEventCallback((key: AgentKey, node: HTMLDivElement | null): void => {
    rows.current[key] = node
  })
  return { registerRow, rows, stage }
}
