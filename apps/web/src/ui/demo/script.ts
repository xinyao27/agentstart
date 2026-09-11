import {
  ACTIVE_BRANCH,
  BASE_WORKTREES,
  DIFF_LINES,
  FOLLOW_UP,
  PROMPT,
  SESSION_TRANSCRIPT
} from './state'
import type { DemoState } from './state'

export type Frame = {
  ms: number
  patch: Partial<DemoState>
}

const withActiveBranch = (
  status: 'idle' | 'running' | 'review',
  agents: { name: string; detail: string }[] = []
): Partial<DemoState> => ({
  worktrees: [{ branch: ACTIVE_BRANCH, status, active: true, agents }, ...BASE_WORKTREES]
})

// Why: stepping several characters per frame keeps the script short while the
// prompt still reads as typed rather than pasted.
const promptTyping: Frame[] = Array.from({ length: Math.ceil(PROMPT.length / 2) }, (_, index) => ({
  ms: 45,
  patch: { promptChars: Math.min((index + 1) * 2, PROMPT.length) }
}))

// Why: a real turn prints its tool lines one at a time with the working line
// still running underneath, so the transcript grows against a live spinner
// rather than appearing all at once when the turn ends.
const workProgress: Frame[] = [
  { ms: 600, patch: { working: true } },
  ...SESSION_TRANSCRIPT.map((_, index) => ({ ms: 800, patch: { transcript: index + 1 } }))
]

// Why: typed from the phone; the desktop composer shows the same characters
// because both read state.composerText.
const composerTyping: Frame[] = Array.from(
  { length: Math.ceil(FOLLOW_UP.length / 2) },
  (_, index) => ({
    ms: 55,
    patch: { composerText: FOLLOW_UP.slice(0, Math.min((index + 1) * 2, FOLLOW_UP.length)) }
  })
)

// Why: per-line reveal scales with the hunk — at the old 240ms a twelve-line
// diff would hold the beat for nearly three seconds.
const diffReveal: Frame[] = DIFF_LINES.map((_, index) => ({
  ms: 95,
  patch: { diffLines: index + 1 }
}))

/**
 * One task followed from the worktree tree, through an agent session, a tab
 * switch and a split, onto the phone — the three things the page shows, in one
 * thread.
 */
export const frames: Frame[] = [
  // 1 · Workspace — the task gets its own worktree under the project.
  { ms: 650, patch: {} },
  { ms: 500, patch: withActiveBranch('idle') },
  { ms: 550, patch: withActiveBranch('running') },
  // Why: opening the session adds the agent level beneath the worktree.
  { ms: 450, patch: withActiveBranch('running', [{ name: 'claude', detail: '0s' }]) },

  // 2 · Claude — the session opens and takes a prompt.
  { ms: 500, patch: { groups: [{ tabs: ['claude', 'diff', 'browser'], activeTab: 'claude' }] } },
  ...promptTyping,
  { ms: 350, patch: {} },
  ...workProgress,
  { ms: 500, patch: { working: false, answered: true } },

  // 3 · Browser — verify the behaviour before reading the change. The rows are
  // still answering the previous query until the page picks the fix up.
  { ms: 550, patch: { cursor: { x: 42, y: 16 } } },
  { ms: 170, patch: { cursorPressed: true } },
  {
    ms: 260,
    patch: {
      cursorPressed: false,
      groups: [{ tabs: ['claude', 'diff', 'browser'], activeTab: 'browser' }]
    }
  },
  { ms: 900, patch: {} },
  { ms: 700, patch: { browserReloading: true } },
  { ms: 550, patch: { browserReloading: false, browserFresh: true } },
  { ms: 900, patch: {} },

  // 4 · Diff — behaviour confirmed, now read what actually changed.
  { ms: 550, patch: { cursor: { x: 34, y: 16 } } },
  { ms: 170, patch: { cursorPressed: true } },
  {
    ms: 260,
    patch: {
      cursorPressed: false,
      groups: [{ tabs: ['claude', 'diff', 'browser'], activeTab: 'diff' }]
    }
  },
  ...diffReveal,

  // 5 · Split — pull the diff alongside the running app.
  { ms: 300, patch: { cursorPressed: true } },
  { ms: 800, patch: { cursor: { x: 88, y: 55 } } },
  {
    ms: 320,
    patch: {
      cursorPressed: false,
      // Why: dragging the tab out creates a second group — its own strip.
      groups: [
        { tabs: ['claude', 'browser'], activeTab: 'browser' },
        { tabs: ['diff'], activeTab: 'diff' }
      ]
    }
  },
  { ms: 900, patch: withActiveBranch('review', [{ name: 'claude', detail: '4s' }]) },

  // 6 · Mobile — step back to the agent first, then pick up the phone. Both
  // surfaces render one SessionView from this state, so the desktop mirrors
  // every keystroke without the script saying so twice.
  { ms: 550, patch: { cursor: { x: 27, y: 16 } } },
  { ms: 170, patch: { cursorPressed: true } },
  {
    ms: 300,
    patch: {
      cursorPressed: false,
      groups: [
        { tabs: ['claude', 'browser'], activeTab: 'claude' },
        { tabs: ['diff'], activeTab: 'diff' }
      ]
    }
  },
  { ms: 700, patch: { phoneVisible: true } },
  { ms: 600, patch: { touchOnPhone: true } },
  { ms: 350, patch: { composerActive: true } },
  ...composerTyping,
  { ms: 450, patch: {} },
  {
    ms: 500,
    patch: {
      composerText: '',
      composerActive: false,
      touchOnPhone: false,
      followUp: FOLLOW_UP,
      followUpWorking: true
    }
  },
  { ms: 1900, patch: { followUpWorking: false } },
  { ms: 1400, patch: {} }
]
