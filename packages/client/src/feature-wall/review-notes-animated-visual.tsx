import { useEffect, useState } from 'react'
import type { JSX } from 'react'
import { translate } from '~renderer/i18n/i18n'
import { LoadingIndicator } from '~renderer/loading/indicator'
import { cn } from '~renderer/ui/class-names'

import { ReviewNotesVisualStyles } from './review-animated-visual-notes-styles'
import {
  ClaudeLogo,
  CodexLogo,
  CornerEnterIcon,
  MessageIcon,
  NOTE_TARGETS,
  ReviewAnimatedVisualButton,
  SendIcon
} from './review-animated-visual-shared'
import { ReviewDiffRows } from './review-notes-diff-rows'

type NotesPhase =
  | 'idle'
  | 'composing'
  | 'saved'
  | 'send-menu'
  | 'terminal-started'
  | 'terminal-loaded'
  | 'terminal-acknowledged'
  | 'terminal-fixing'

type NotesStoryboard = {
  phase: NotesPhase
  activeTargetIndex: number
  visibleNoteCount: number
  draft: string
}

const EMPTY_NOTES_STORYBOARD: NotesStoryboard = {
  phase: 'idle',
  activeTargetIndex: 0,
  visibleNoteCount: 0,
  draft: ''
}
const COMPLETE_NOTES_STORYBOARD: NotesStoryboard = {
  phase: 'terminal-fixing',
  activeTargetIndex: NOTE_TARGETS.length - 1,
  visibleNoteCount: NOTE_TARGETS.length,
  draft: ''
}

function useAnimatedNotesStoryboard(): NotesStoryboard {
  const [storyboard, setStoryboard] = useState(EMPTY_NOTES_STORYBOARD)

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
    const update = (patch: Partial<NotesStoryboard>): void => {
      if (!cancelled) {
        setStoryboard((current) => ({ ...current, ...patch }))
      }
    }
    const typeDraft = async (text: string): Promise<void> => {
      for (let index = 1; index <= text.length && !cancelled; index += 1) {
        update({ draft: text.slice(0, index) })
        await wait(18)
      }
    }
    const play = async (): Promise<void> => {
      while (!cancelled) {
        setStoryboard(EMPTY_NOTES_STORYBOARD)
        await wait(520)
        for (let index = 0; index < NOTE_TARGETS.length && !cancelled; index += 1) {
          update({ phase: 'composing', activeTargetIndex: index, draft: '' })
          await typeDraft(NOTE_TARGETS[index].body)
          await wait(360)
          update({ phase: 'saved', visibleNoteCount: index + 1, draft: '' })
          await wait(620)
        }
        update({ phase: 'send-menu' })
        await wait(960)
        update({ phase: 'terminal-started' })
        await wait(520)
        update({ phase: 'terminal-loaded' })
        await wait(520)
        update({ phase: 'terminal-acknowledged' })
        await wait(720)
        update({ phase: 'terminal-fixing' })
        await wait(4000)
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

function TerminalStoryboard({ phase }: { phase: NotesPhase }): JSX.Element {
  const showLoaded = ['terminal-loaded', 'terminal-acknowledged', 'terminal-fixing'].includes(phase)
  const showAcknowledged = ['terminal-acknowledged', 'terminal-fixing'].includes(phase)
  return (
    <div className="ravs-term-body">
      <div className="ravs-term-line ravs-term-muted">
        {translate(
          'auto.components.feature.wall.ReviewNotesAnimatedVisual.sessionStarted',
          '● Claude Code session started'
        )}
      </div>
      {showLoaded ? (
        <div className="ravs-term-line">
          <span className="ravs-term-check">✓</span>
          <span className="ravs-term-muted">
            {translate(
              'auto.components.feature.wall.ReviewNotesAnimatedVisual.notesLoaded',
              'Loaded {{value0}} review notes from AgentStart',
              { value0: NOTE_TARGETS.length }
            )}
          </span>
        </div>
      ) : null}
      {showAcknowledged
        ? NOTE_TARGETS.map((target, index) => (
            <div className="ravs-term-line" key={target.summary}>
              <span className="ravs-term-glyph">•</span>
              <span className="ravs-term-muted">
                {translate(
                  'auto.components.feature.wall.ReviewNotesAnimatedVisual.reviewNote',
                  'Review note {{value0}}:',
                  { value0: index + 1 }
                )}
              </span>{' '}
              {target.summary}
            </div>
          ))
        : null}
      {phase === 'terminal-fixing' ? (
        <div className="ravs-term-line">
          <LoadingIndicator className="text-foreground mr-1.5 size-2 align-[-1px]" />
          <span className="ravs-term-muted">
            {translate(
              'auto.components.feature.wall.ReviewNotesAnimatedVisual.fixingIssues',
              'Fixing both issues...'
            )}
          </span>
        </div>
      ) : null}
    </div>
  )
}

function ReviewNotesFrame({ storyboard }: { storyboard: NotesStoryboard }): JSX.Element {
  const terminalVisible = storyboard.phase.startsWith('terminal-')
  const composing = storyboard.phase === 'composing'
  const sendMenuVisible = storyboard.phase === 'send-menu'

  return (
    <div className="ravs-window" data-page="notes">
      <div className="ravs-difftoolbar">
        <span className="ravs-diff-path">
          {translate(
            'auto.components.feature.wall.ReviewNotesAnimatedVisual.1eee3a397e',
            'src/server/migrate.ts (diff)'
          )}
        </span>
        <span className={cn('ravs-ai-chip', storyboard.visibleNoteCount > 0 && 'is-visible')}>
          <ReviewAnimatedVisualButton className="ravs-count-btn">
            <MessageIcon />{' '}
            {translate(
              'auto.components.feature.wall.ReviewNotesAnimatedVisual.5cb213f967',
              'AI notes'
            )}{' '}
            <span className="ravs-count-num">{storyboard.visibleNoteCount}</span>
          </ReviewAnimatedVisualButton>
          <ReviewAnimatedVisualButton className="ravs-send-btn">
            <SendIcon />
          </ReviewAnimatedVisualButton>
        </span>
      </div>
      <div className="ravs-diffbody">
        <div className={cn('ravs-diffscroll', terminalVisible && 'is-hidden')}>
          <ReviewDiffRows visibleNoteCount={storyboard.visibleNoteCount} />
        </div>
        <div className={cn('ravs-term', terminalVisible && 'is-visible')} aria-hidden>
          <TerminalStoryboard phase={storyboard.phase} />
        </div>
        <div
          className={cn('ravs-popover', composing && 'is-visible')}
          style={{ top: storyboard.activeTargetIndex === 0 ? 82 : 170 }}
        >
          <div className="ravs-pop-label">
            {translate('auto.components.feature.wall.ReviewNotesAnimatedVisual.a7a89d8f94', 'Line')}{' '}
            {storyboard.activeTargetIndex + 1}
          </div>
          <div className="ravs-pop-input">
            {storyboard.draft}
            {composing ? <span className="ravs-caret" /> : null}
          </div>
          <div className="ravs-pop-footer">
            <ReviewAnimatedVisualButton className="ravs-pop-btn is-cancel">
              {translate(
                'auto.components.feature.wall.ReviewNotesAnimatedVisual.271ea0cbf3',
                'Cancel'
              )}
            </ReviewAnimatedVisualButton>
            <ReviewAnimatedVisualButton className="ravs-pop-btn is-add" focusBorder>
              {translate(
                'auto.components.feature.wall.ReviewNotesAnimatedVisual.ea4e45b71b',
                'Add note'
              )}
              <CornerEnterIcon />
            </ReviewAnimatedVisualButton>
          </div>
        </div>
        <div className={cn('ravs-send-menu', sendMenuVisible && 'is-visible')}>
          <div className="ravs-menu-section">
            {translate(
              'auto.components.feature.wall.ReviewNotesAnimatedVisual.294aaff104',
              'Send notes to'
            )}
          </div>
          <div className={cn('ravs-menu-row', sendMenuVisible && 'is-hot')}>
            <ClaudeLogo />
            <span>
              {translate(
                'auto.components.feature.wall.ReviewNotesAnimatedVisual.09094f25e2',
                'Claude Code'
              )}
            </span>
          </div>
          <div className="ravs-menu-row">
            <CodexLogo />
            <span>
              {translate(
                'auto.components.feature.wall.ReviewNotesAnimatedVisual.5dbd27c4c2',
                'Codex'
              )}
            </span>
          </div>
        </div>
      </div>
      <ReviewNotesVisualStyles />
    </div>
  )
}

function AnimatedReviewNotes(): JSX.Element {
  return <ReviewNotesFrame storyboard={useAnimatedNotesStoryboard()} />
}

export function ReviewNotesAnimatedVisual({
  reducedMotion
}: {
  reducedMotion: boolean
}): JSX.Element {
  return reducedMotion ? (
    <ReviewNotesFrame storyboard={COMPLETE_NOTES_STORYBOARD} />
  ) : (
    <AnimatedReviewNotes />
  )
}
