import type React from 'react'
import type { JSX } from 'react'
import { translate } from '~renderer/i18n/i18n'
import { LoadingIndicator } from '~renderer/loading/indicator'
import { cn } from '~renderer/ui/class-names'

import { ClaudeIcon } from '../status-bar/icons'
import { CodexInlineIcon } from './codex-inline-icon'
import type { RightLine, RUN_QUEUE } from './workbench-storyboard-types'

export function PlaywrightPane(props: { running: (typeof RUN_QUEUE)[number] }): JSX.Element {
  return (
    <>
      <TermLine>
        <Prompt>$</Prompt>
        <span className="text-foreground">
          {translate(
            'auto.components.feature.wall.WorkbenchAnimatedVisual.4371cc9931',
            'pnpm playwright test'
          )}
        </span>
      </TermLine>
      <TermLine muted>
        {translate(
          'auto.components.feature.wall.WorkbenchAnimatedVisual.0b20782e0f',
          'Running 12 tests using 4 workers'
        )}
      </TermLine>
      <TermLine>
        <PwCheck />
        <PwIdx>1</PwIdx>
        {translate(
          'auto.components.feature.wall.WorkbenchAnimatedVisual.defe550fe2',
          'login.spec.ts'
        )}
        <PwName>
          {' '}
          {translate(
            'auto.components.feature.wall.WorkbenchAnimatedVisual.3261c6853b',
            '› can sign in'
          )}
        </PwName>
        <PwDur>
          {translate('auto.components.feature.wall.WorkbenchAnimatedVisual.5c5cbd783f', '(1.2s)')}
        </PwDur>
      </TermLine>
      <TermLine>
        <PwCheck />
        <PwIdx>2</PwIdx>
        {translate(
          'auto.components.feature.wall.WorkbenchAnimatedVisual.623881d72e',
          'checkout.spec.ts'
        )}
        <PwName>
          {' '}
          {translate(
            'auto.components.feature.wall.WorkbenchAnimatedVisual.944199e54a',
            '› cart total updates'
          )}
        </PwName>
        <PwDur>
          {translate('auto.components.feature.wall.WorkbenchAnimatedVisual.7d9f1d5f7d', '(0.8s)')}
        </PwDur>
      </TermLine>
      <TermLine>
        <RunSpinner />
        <PwIdx>3</PwIdx>
        {props.running.name}
        <PwName> {props.running.desc}</PwName>
      </TermLine>
    </>
  )
}

export function ClaudeChecklistPane(): JSX.Element {
  return (
    <>
      <TermLine>
        <Prompt>$</Prompt>
        <span className="text-foreground">
          {translate('auto.components.feature.wall.WorkbenchAnimatedVisual.000106adfe', 'claude')}
        </span>
      </TermLine>
      <TermLine muted>
        <span className="mr-1.5 inline-flex align-[-2px]">
          <ClaudeIcon size={12} />
        </span>
        {translate(
          'auto.components.feature.wall.WorkbenchAnimatedVisual.431ca9842a',
          'Claude Code session started'
        )}
      </TermLine>
      <TermLine wrap>
        <span className="mr-1.5 text-[color:var(--warning)]">
          {translate('auto.components.feature.wall.WorkbenchAnimatedVisual.932c4b3a97', '>')}
        </span>
        {translate(
          'auto.components.feature.wall.WorkbenchAnimatedVisual.c0eb94125e',
          'review auth edge cases'
        )}
      </TermLine>
      <TermLine>
        <span className="mr-1.5 font-bold text-[color:var(--success)]">✓</span>
        <span className="text-foreground">
          {translate('auto.components.feature.wall.WorkbenchAnimatedVisual.9923847785', 'Read')}
        </span>
        <span className="text-muted-foreground ml-1.5 truncate">
          {translate(
            'auto.components.feature.wall.WorkbenchAnimatedVisual.b85eab49dd',
            'src/auth/session.ts'
          )}
        </span>
      </TermLine>
      <TermLine>
        <span className="mr-1.5 font-bold text-[color:var(--success)]">✓</span>
        <span className="text-foreground">
          {translate('auto.components.feature.wall.WorkbenchAnimatedVisual.17cfdc3344', 'Grep')}
        </span>
        <span className="text-muted-foreground ml-1.5 truncate">
          {translate(
            'auto.components.feature.wall.WorkbenchAnimatedVisual.0d93c298a7',
            'throw src/auth'
          )}
        </span>
      </TermLine>
      <TermLine>
        <RunSpinner />
        <span className="text-foreground">
          {translate('auto.components.feature.wall.WorkbenchAnimatedVisual.99f5224f1e', 'Edit')}
        </span>
        <span className="text-muted-foreground ml-1.5 truncate">
          {translate(
            'auto.components.feature.wall.WorkbenchAnimatedVisual.b85eab49dd',
            'src/auth/session.ts'
          )}
        </span>
      </TermLine>
    </>
  )
}

export function TermLine(props: {
  children: React.ReactNode
  muted?: boolean
  wrap?: boolean
}): JSX.Element {
  return (
    <div
      className={cn(
        'leading-[1.45]',
        props.muted ? 'text-muted-foreground' : null,
        props.wrap ? 'whitespace-pre-wrap break-words' : 'truncate whitespace-pre'
      )}
    >
      {props.children}
    </div>
  )
}

export function Prompt(props: { children: React.ReactNode; claude?: boolean }): JSX.Element {
  return (
    <span
      className={cn(
        'mr-1.5',
        props.claude ? 'text-[color:var(--warning)]' : 'text-[color:var(--success)]'
      )}
    >
      {props.children}
    </span>
  )
}

function PwCheck(): JSX.Element {
  return <span className="mr-1.5 font-bold text-[color:var(--success)]">✓</span>
}

function PwIdx(props: { children: React.ReactNode }): JSX.Element {
  return <span className="text-muted-foreground mr-1.5">{props.children}</span>
}

function PwName(props: { children: React.ReactNode }): JSX.Element {
  return <span className="text-muted-foreground">{props.children}</span>
}

function PwDur(props: { children: React.ReactNode }): JSX.Element {
  return <span className="text-muted-foreground ml-2">{props.children}</span>
}

function RunSpinner(): JSX.Element {
  return <LoadingIndicator className="text-foreground mr-1.5 size-2 align-[-1px]" />
}

export function RightPaneScrollback(props: {
  lines: readonly RightLine[]
  isCodex?: boolean
  promptAccentClass?: string
}): JSX.Element {
  return (
    <>
      {props.lines.map((line, i) => {
        // Why: preserving the submitted command keeps the terminal view realistic after submitting.
        if (line.kind === 'submitted-command') {
          return (
            <TermLine key={i}>
              <Prompt>$</Prompt>
              <span className="text-foreground">{line.text}</span>
            </TermLine>
          )
        }
        if (line.kind === 'session-started') {
          return (
            <TermLine key={i} muted>
              {props.isCodex ? (
                <span className="mr-1.5 inline-flex align-[-2px]">
                  <CodexInlineIcon />
                </span>
              ) : (
                <span className="text-foreground mr-1.5">●</span>
              )}
              {props.isCodex
                ? translate(
                    'auto.components.feature.wall.WorkbenchAnimatedVisual.fc84f17fe7',
                    'Codex session started'
                  )
                : translate(
                    'auto.components.feature.wall.WorkbenchAnimatedVisual.431ca9842a',
                    'Claude Code session started'
                  )}
            </TermLine>
          )
        }
        if (line.kind === 'submitted-prompt') {
          return (
            <TermLine key={i} wrap>
              <span
                className={cn('mr-1.5', props.promptAccentClass ?? 'text-[color:var(--warning)]')}
              >
                {translate('auto.components.feature.wall.WorkbenchAnimatedVisual.932c4b3a97', '>')}
              </span>
              {line.text}
            </TermLine>
          )
        }
        if (line.kind === 'thinking') {
          return (
            <TermLine key={i}>
              <RunSpinner />
              <span className="text-muted-foreground">
                {translate(
                  'auto.components.feature.wall.WorkbenchAnimatedVisual.633a91e358',
                  'Thinking…'
                )}
              </span>
            </TermLine>
          )
        }
        if (line.kind === 'agent-action') {
          return (
            <TermLine key={i}>
              {line.working ? (
                <RunSpinner />
              ) : (
                <span className="mr-1.5 font-bold text-[color:var(--success)]">✓</span>
              )}
              <span className="text-foreground">{line.action}</span>
              <span className="text-muted-foreground ml-1.5 truncate">{line.target}</span>
            </TermLine>
          )
        }
        return (
          <TermLine key={i}>
            {line.withGlyph ? (
              props.isCodex ? (
                <span className="mr-1.5 inline-flex align-[-2px]">
                  <CodexInlineIcon />
                </span>
              ) : (
                <span className="mr-1.5 text-[color:var(--warning)]">●</span>
              )
            ) : null}
            <span
              className="bg-foreground/[0.18] inline-block h-[7px] align-[1px]"
              style={{ width: `${line.widthPct}%` }}
            />
          </TermLine>
        )
      })}
    </>
  )
}
