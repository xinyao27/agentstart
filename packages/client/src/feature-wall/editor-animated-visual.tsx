import { useEffect, useState } from 'react'
import type { JSX, ReactNode } from 'react'
import { translate } from '~renderer/i18n/i18n'
import {
  Code,
  Copy,
  List,
  ListChecks,
  ListNumbers,
  Paragraph,
  Quotes,
  TextB,
  TextHOne,
  TextHThree,
  TextHTwo,
  TextItalic
} from '~renderer/icons/hugeicons'
import { getShortcutPlatform } from '~renderer/keyboard-input/use-shortcut-label'
import { cn } from '~renderer/ui/class-names'

const PRE_HOVER_MS = 450
const TYPE_PER_CHAR_MS = 60
const MENU_HOLD_MS = 900
const CLICK_RIPPLE_MS = 220
const FINAL_HOLD_MS = 2200
const KBD_CLASS_DOC =
  'border border-border bg-card px-1.5 py-0.5 font-mono text-[10.5px] text-muted-foreground'

type EditorPhase =
  | 'idle'
  | 'heading-slash'
  | 'heading-menu'
  | 'heading-click'
  | 'heading'
  | 'code-line'
  | 'code-menu'
  | 'code-click'
  | 'complete'

type EditorStoryboard = {
  phase: EditorPhase
  heading: string
  command: string
}

const INITIAL_STORYBOARD: EditorStoryboard = { phase: 'idle', heading: '', command: '' }
const FINAL_STORYBOARD: EditorStoryboard = {
  phase: 'complete',
  heading: 'Ship checklist',
  command: '/code'
}

function useAnimatedEditorStoryboard(): EditorStoryboard {
  const [storyboard, setStoryboard] = useState(INITIAL_STORYBOARD)

  useEffect(() => {
    let cancelled = false
    const timers = new Set<number>()
    const wait = (durationMs: number): Promise<void> =>
      new Promise((resolve) => {
        const timer = window.setTimeout(() => {
          timers.delete(timer)
          resolve()
        }, durationMs)
        timers.add(timer)
      })
    const update = (next: EditorStoryboard): void => {
      if (!cancelled) {
        setStoryboard(next)
      }
    }
    const typeText = async (
      field: 'heading' | 'command',
      text: string,
      phase: EditorPhase
    ): Promise<void> => {
      for (let index = 1; index <= text.length && !cancelled; index += 1) {
        setStoryboard((current) => ({ ...current, phase, [field]: text.slice(0, index) }))
        await wait(TYPE_PER_CHAR_MS)
      }
    }

    const play = async (): Promise<void> => {
      while (!cancelled) {
        update(INITIAL_STORYBOARD)
        await wait(PRE_HOVER_MS)
        update({ phase: 'heading-slash', heading: '', command: '' })
        await typeText('command', '/', 'heading-slash')
        update({ phase: 'heading-menu', heading: '', command: '/' })
        await wait(MENU_HOLD_MS)
        update({ phase: 'heading-click', heading: '', command: '/' })
        await wait(CLICK_RIPPLE_MS)
        update({ phase: 'heading', heading: '', command: '' })
        await typeText('heading', FINAL_STORYBOARD.heading, 'heading')
        await wait(700)
        update({ phase: 'code-line', heading: FINAL_STORYBOARD.heading, command: '' })
        await wait(380)
        await typeText('command', FINAL_STORYBOARD.command, 'code-line')
        update({ phase: 'code-menu', heading: FINAL_STORYBOARD.heading, command: '/code' })
        await wait(MENU_HOLD_MS)
        update({ phase: 'code-click', heading: FINAL_STORYBOARD.heading, command: '/code' })
        await wait(CLICK_RIPPLE_MS)
        update(FINAL_STORYBOARD)
        await wait(FINAL_HOLD_MS)
      }
    }

    void play()
    return () => {
      cancelled = true
      for (const timer of timers) {
        window.clearTimeout(timer)
      }
    }
  }, [])

  return storyboard
}

const TOOLBAR_ICONS = [
  { id: 'paragraph', Icon: Paragraph },
  { id: 'heading-one', Icon: TextHOne },
  { id: 'heading-two', Icon: TextHTwo },
  { id: 'heading-three', Icon: TextHThree },
  { id: 'bold', Icon: TextB },
  { id: 'italic', Icon: TextItalic },
  { id: 'list', Icon: List },
  { id: 'numbered-list', Icon: ListNumbers },
  { id: 'check-list', Icon: ListChecks },
  { id: 'quote', Icon: Quotes }
]

function EditorToolbar(): JSX.Element {
  return (
    <div className="border-border bg-muted/30 flex items-center gap-0.5 border-b px-2 py-1.5">
      {TOOLBAR_ICONS.map(({ id, Icon }, index) => (
        <span
          key={id}
          className={cn(
            'text-muted-foreground inline-flex size-[22px] items-center justify-center rounded',
            (index === 4 || index === 6) && 'border-border ml-1 border-l pl-1'
          )}
        >
          <Icon className="size-[13px]" />
        </span>
      ))}
      <span className="text-muted-foreground ml-auto inline-flex items-center gap-1.5 font-mono text-[10px]">
        <span className="size-1.5 rounded-full bg-[color:var(--success)]" />
        {translate('auto.components.feature.wall.EditorAnimatedVisual.218503f9f3', 'autosaved')}
      </span>
    </div>
  )
}

function CursorIcon(): JSX.Element {
  return (
    <svg width={16} height={16} viewBox="0 0 16 16" aria-hidden focusable="false">
      <path
        d="M2 1.5 L2 12 L5 9 L7.2 14.5 L9.5 13.6 L7.3 8 L11.5 8 Z"
        fill="var(--background)"
        stroke="var(--foreground)"
        strokeWidth={1}
        strokeLinejoin="round"
      />
    </svg>
  )
}

function SlashRow({
  icon: Icon,
  label,
  shortcut,
  active,
  clicking
}: {
  icon: typeof TextHOne
  label: string
  shortcut: string
  active?: boolean
  clicking?: boolean
}): JSX.Element {
  return (
    <div
      className={cn(
        'relative grid h-6 grid-cols-[18px_1fr_auto] items-center gap-2 px-2 py-1 pl-1.5 rounded-[5px]',
        active && 'bg-foreground/[0.07]'
      )}
    >
      <Icon className="text-muted-foreground size-[13px]" />
      <span className="leading-none whitespace-nowrap">{label}</span>
      <span className="text-muted-foreground font-mono text-[10.5px]">{shortcut}</span>
      {active ? (
        <span className="pointer-events-none absolute top-1.5 left-3">
          <CursorIcon />
          {clicking ? (
            <span className="border-foreground/50 absolute -top-1.5 -left-1.5 size-7 animate-[editor-cursor-ripple_460ms_ease-out_forwards] rounded-full border-2" />
          ) : null}
        </span>
      ) : null}
    </div>
  )
}

function SlashMenu({
  mode,
  clicking
}: {
  mode: 'heading' | 'code'
  clicking: boolean
}): JSX.Element {
  return (
    <div
      className="border-border bg-card pointer-events-none absolute left-10 z-10 min-w-[220px] border p-1.5 text-[12px]"
      style={{ top: mode === 'heading' ? 184 : 226 }}
    >
      <div className="text-muted-foreground px-2 pt-1.5 pb-1 text-[9.5px] font-bold tracking-[0.06em] uppercase">
        {mode === 'heading'
          ? translate('auto.components.feature.wall.EditorAnimatedVisual.1fb29ad710', 'Headings')
          : translate(
              'auto.components.feature.wall.EditorAnimatedVisual.abbdeea15d',
              'Basic blocks'
            )}
      </div>
      {mode === 'heading' ? (
        <>
          <SlashRow
            icon={TextHOne}
            label={translate(
              'auto.components.feature.wall.EditorAnimatedVisual.722170663a',
              'Heading 1'
            )}
            shortcut="#"
            active
            clicking={clicking}
          />
          <SlashRow
            icon={TextHTwo}
            label={translate(
              'auto.components.feature.wall.EditorAnimatedVisual.a26a68d30c',
              'Heading 2'
            )}
            shortcut="##"
          />
        </>
      ) : (
        <SlashRow
          icon={Code}
          label={translate(
            'auto.components.feature.wall.EditorAnimatedVisual.8268b2376b',
            'Code Block'
          )}
          shortcut="```"
          active
          clicking={clicking}
        />
      )}
    </div>
  )
}

function CodeBlock(): JSX.Element {
  return (
    <div className="border-border bg-muted/30 mt-1.5 overflow-hidden border font-mono text-[11.5px] leading-[1.55]">
      <div className="border-border bg-muted/40 flex items-center justify-between border-b px-2.5 py-1.5">
        <span className="text-muted-foreground text-[10px] font-semibold">typescript</span>
        <span className="text-muted-foreground inline-flex items-center gap-1 text-[9.5px]">
          <Copy className="size-3" />
          {translate('auto.components.feature.wall.EditorAnimatedVisual.copy', 'Copy')}
        </span>
      </div>
      <div className="bg-background flex flex-col gap-0.5 px-3 py-2">
        <div>
          <span className="text-fuchsia-600">await</span>{' '}
          <span className="text-[color:var(--info)]">runSmokeTests</span>({'{'} env:{' '}
          <span className="text-green-600">&apos;staging&apos;</span> {'}'})
        </div>
        <div>
          <span className="text-fuchsia-600">await</span>{' '}
          <span className="text-[color:var(--info)]">publish</span>({'{'} tag:{' '}
          <span className="text-green-600">&apos;v0.4.0&apos;</span> {'}'})
        </div>
      </div>
    </div>
  )
}

function DocTitle({ children }: { children: ReactNode }): JSX.Element {
  return <div className="mb-2.5 text-[22px] leading-[1.15] font-bold">{children}</div>
}

function DocBlock({
  children,
  listItem
}: {
  children: ReactNode
  listItem?: boolean
}): JSX.Element {
  return (
    <div
      className={cn(
        'relative mt-1.5 min-h-[18px] py-px text-[13px] leading-[1.55]',
        listItem &&
          'pl-[18px] before:absolute before:top-[9px] before:left-1.5 before:size-1 before:bg-foreground/55'
      )}
    >
      {children}
    </div>
  )
}

function EditorVisualFrame({ storyboard }: { storyboard: EditorStoryboard }): JSX.Element {
  const editorShortcutPrefix = getShortcutPlatform() === 'darwin' ? '⌘' : 'Ctrl+'
  const headingStarted = !['idle', 'heading-slash', 'heading-menu', 'heading-click'].includes(
    storyboard.phase
  )
  const codeLineVisible = ['code-line', 'code-menu', 'code-click'].includes(storyboard.phase)
  const menuMode = ['heading-menu', 'heading-click'].includes(storyboard.phase)
    ? 'heading'
    : ['code-menu', 'code-click'].includes(storyboard.phase)
      ? 'code'
      : null

  return (
    <div className="border-border bg-card text-foreground relative overflow-visible rounded-xl border">
      <div className="border-border bg-muted/40 flex h-7 items-center gap-1.5 border-b px-3">
        <span className="size-2.5 rounded-full bg-rose-400/70" />
        <span className="size-2.5 rounded-full bg-[color-mix(in_srgb,var(--warning)_70%,transparent)]" />
        <span className="size-2.5 rounded-full bg-[color-mix(in_srgb,var(--success)_70%,transparent)]" />
        <span className="text-muted-foreground ml-2 font-mono text-[11px]">
          {translate(
            'auto.components.feature.wall.EditorAnimatedVisual.cda56c5915',
            'notes / launch-plan.md'
          )}
        </span>
      </div>
      <EditorToolbar />
      <div
        className="bg-background relative overflow-hidden px-6 pt-4 pb-5"
        style={{ minHeight: 280 }}
      >
        <DocTitle>
          {translate('auto.components.feature.wall.EditorAnimatedVisual.5a55c00a81', 'Launch plan')}
        </DocTitle>
        <DocBlock>
          {translate(
            'auto.components.feature.wall.EditorAnimatedVisual.22ae7b4d9d',
            "A quick note for the team — pulling together what's left before we ship."
          )}
        </DocBlock>
        <DocBlock listItem>
          {translate(
            'auto.components.feature.wall.EditorAnimatedVisual.95f0c3a46f',
            'Smoke-test the install flow on a fresh machine.'
          )}
        </DocBlock>
        <DocBlock listItem>
          {translate(
            'auto.components.feature.wall.EditorAnimatedVisual.4426aab46f',
            'Update the docs index once the new tile lands.'
          )}
        </DocBlock>
        <div
          className={cn(
            'relative mt-1.5 min-h-[18px] py-px',
            headingStarted ? 'text-[18px] leading-[1.2] font-bold' : 'font-mono text-[12.5px]'
          )}
        >
          {headingStarted ? storyboard.heading : storyboard.command}
          <span className="ml-px inline-block h-[1em] w-px animate-pulse bg-current align-[-2px]" />
        </div>
        {codeLineVisible ? (
          <div className="relative mt-1.5 min-h-[18px] py-px font-mono text-[12.5px]">
            {storyboard.command}
            <span className="ml-px inline-block h-[1em] w-px animate-pulse bg-current align-[-2px]" />
          </div>
        ) : null}
        {storyboard.phase === 'complete' ? <CodeBlock /> : null}
        {menuMode ? (
          <SlashMenu mode={menuMode} clicking={storyboard.phase.endsWith('click')} />
        ) : null}
      </div>
      <div className="border-border bg-card text-muted-foreground border-t px-3 py-2 text-[11px]">
        {translate('auto.components.feature.wall.EditorAnimatedVisual.3fe42a1da0', 'Type')}
        <kbd className={KBD_CLASS_DOC}>/</kbd>{' '}
        {translate('auto.components.feature.wall.EditorAnimatedVisual.8341391520', 'for blocks ·')}{' '}
        <kbd className={KBD_CLASS_DOC}>{editorShortcutPrefix}B</kbd>{' '}
        {translate('auto.components.feature.wall.EditorAnimatedVisual.8521536429', 'bold ·')}{' '}
        <kbd className={KBD_CLASS_DOC}>{editorShortcutPrefix}I</kbd>{' '}
        {translate('auto.components.feature.wall.EditorAnimatedVisual.7a763daf2f', 'italic')}
      </div>
    </div>
  )
}

function AnimatedEditorVisual(): JSX.Element {
  return <EditorVisualFrame storyboard={useAnimatedEditorStoryboard()} />
}

export function EditorAnimatedVisual({ reducedMotion }: { reducedMotion: boolean }): JSX.Element {
  return reducedMotion ? (
    <EditorVisualFrame storyboard={FINAL_STORYBOARD} />
  ) : (
    <AnimatedEditorVisual />
  )
}
