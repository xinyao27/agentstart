import type { JSX, ReactNode } from 'react'
import { translate } from '~renderer/i18n/i18n'
import { cn } from '~renderer/ui/class-names'

import {
  BROWSER_STORYBOARD_PROMPT,
  browserPhaseAtLeast,
  type BrowserStoryboardPhase
} from './browser-storyboard-timeline'

type TerminalEntry =
  | { kind: 'prompt'; text: string }
  | { kind: 'working' }
  | { kind: 'ok'; content: ReactNode }
  | { kind: 'tool'; tool: string; argument: string }
  | { kind: 'tool-muted'; tool: string; muted: string }

function terminalEntries(): readonly { entry: TerminalEntry; minPhase: BrowserStoryboardPhase }[] {
  return [
    { entry: { kind: 'prompt', text: BROWSER_STORYBOARD_PROMPT }, minPhase: 'working' },
    { entry: { kind: 'working' }, minPhase: 'working' },
    {
      entry: {
        kind: 'ok',
        content: (
          <>
            {translate(
              'auto.components.feature.wall.BrowserAnimatedVisual.4fa59ca545',
              '✓ Updated'
            )}{' '}
            <code className="text-[color:var(--success)]">
              {translate(
                'auto.components.feature.wall.BrowserAnimatedVisual.051c97d15a',
                '.pp-card[data-card="starter"] .pp-cta'
              )}
            </code>
          </>
        )
      },
      minPhase: 'updated'
    },
    {
      entry: { kind: 'prompt', text: 'Let me click Try free to verify it still works.' },
      minPhase: 'verify-intent'
    },
    {
      entry: { kind: 'tool', tool: 'click', argument: '"Try free"' },
      minPhase: 'click-press'
    },
    {
      entry: { kind: 'tool-muted', tool: 'screenshot', muted: '(capturing page)' },
      minPhase: 'screenshot-line'
    },
    {
      entry: {
        kind: 'ok',
        content: translate(
          'auto.components.feature.wall.BrowserAnimatedVisual.eb88125c6f',
          '✓ Verified — Try free still works.'
        )
      },
      minPhase: 'verified'
    }
  ]
}

export function BrowserStoryboardTerminal(props: { phase: BrowserStoryboardPhase }): JSX.Element {
  return (
    <div className="flex flex-1 flex-col gap-1 px-2 py-2 leading-snug">
      {terminalEntries().map(({ entry, minPhase }, index) => (
        <TerminalLine key={index} visible={browserPhaseAtLeast(props.phase, minPhase)}>
          <TerminalEntryView entry={entry} />
        </TerminalLine>
      ))}
    </div>
  )
}

function TerminalEntryView(props: { entry: TerminalEntry }): JSX.Element {
  const { entry } = props
  if (entry.kind === 'prompt') {
    return (
      <span className="text-card-foreground">
        <span className="text-muted-foreground">
          {translate('auto.components.feature.wall.BrowserAnimatedVisual.f2034c4930', '>')}
        </span>{' '}
        {entry.text}
      </span>
    )
  }
  if (entry.kind === 'working') {
    return (
      <span className="text-muted-foreground inline-flex items-center gap-1.5">
        <span className="size-1.5 animate-pulse bg-[color:var(--success)]" />
        {translate('auto.components.feature.wall.BrowserAnimatedVisual.0ce7c24b4d', 'Working…')}
      </span>
    )
  }
  if (entry.kind === 'ok') {
    return <span className="text-[color:var(--success)]">{entry.content}</span>
  }
  if (entry.kind === 'tool') {
    return (
      <span>
        <span className="text-primary">{entry.tool}</span>{' '}
        <span className="text-[color:var(--success)]">{entry.argument}</span>
      </span>
    )
  }
  return (
    <span>
      <span className="text-primary">{entry.tool}</span>{' '}
      <span className="text-muted-foreground">{entry.muted}</span>
    </span>
  )
}

function TerminalLine(props: { visible: boolean; children: ReactNode }): JSX.Element {
  return (
    <span
      className={cn('transition-opacity duration-300', props.visible ? 'opacity-100' : 'opacity-0')}
    >
      {props.children}
    </span>
  )
}
