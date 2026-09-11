export type TabId = 'claude' | 'diff' | 'browser'

export type WorktreeStatus = 'idle' | 'running' | 'review' | 'merged'

export type AgentRow = {
  name: string
  detail: string
}

export type WorktreeRow = {
  branch: string
  status: WorktreeStatus
  active: boolean
  agents: AgentRow[]
}

export type CursorPoint = {
  /** Percentage of the window box, so the cursor tracks any width. */
  x: number
  y: number
}

/** Why: a pane column is a tab group with its own strip and one active tab —
    splitting moves a tab into a new group (see tab-move-to-pane-column.ts). */
export type PaneGroup = {
  tabs: TabId[]
  activeTab: TabId
}

export type DemoState = {
  worktrees: WorktreeRow[]
  groups: PaneGroup[]
  promptChars: number
  working: boolean
  /** How many entries of SESSION_TRANSCRIPT the session has printed so far. */
  transcript: number
  answered: boolean
  diffLines: number
  /** Shared by both surfaces — the phone drives it, the desktop mirrors it. */
  browserReloading: boolean
  browserFresh: boolean
  composerText: string
  composerActive: boolean
  touchOnPhone: boolean
  followUp: string | null
  followUpWorking: boolean
  cursor: CursorPoint
  cursorPressed: boolean
  phoneVisible: boolean
}

export const PROJECT_NAME = 'storefront'
export const ACTIVE_BRANCH = 'fix/stale-search'
export const AGENT_VERSION = 'v2.1.206'
export const AGENT_USER = 'Xinyao'
export const AGENT_MODEL = 'Opus 5 · Claude Max'
export const AGENT_CWD = '~/code/storefront'
export const PROMPT = 'search results come back stale'
export const FOLLOW_UP = 'add a test for the race'
export const SESSION_ANSWER =
  'The fetch was never awaited, so a slower earlier query could resolve last.'

export const SEARCH_QUERY = 'running shoes'

export type SearchResult = {
  name: string
  price: string
}

// Why: before the fix the rows answer the previous query — that mismatch is
// what a stale-results race actually looks like on screen.
export const STALE_RESULTS: SearchResult[] = [
  { name: 'Wool beanie', price: '$24' },
  { name: 'Knit scarf', price: '$32' },
  { name: 'Lined gloves', price: '$28' }
]

export const FRESH_RESULTS: SearchResult[] = [
  { name: 'Trail runner', price: '$120' },
  { name: 'Road runner', price: '$95' },
  { name: 'Track spike', price: '$89' }
]

export const BASE_WORKTREES: WorktreeRow[] = [
  { branch: 'feat/apple-pay', status: 'running', active: false, agents: [] },
  { branch: 'fix/cart-total', status: 'review', active: false, agents: [] },
  { branch: 'chore/bump-deps', status: 'merged', active: false, agents: [] }
]

export type DiffLine = {
  kind: 'add' | 'del' | 'context' | 'meta'
  number: number
  text: string
  /** Character range that actually changed, for the word-level emphasis tier. */
  emphasis?: [number, number]
}

export const DIFF_FILE = 'search/use-search.ts'

export const DIFF_LINES: DiffLine[] = [
  { kind: 'meta', number: 0, text: '@@ -44,8 +44,8 @@ useSearch()' },
  { kind: 'context', number: 44, text: '  const [results, setResults] = useState([])' },
  { kind: 'context', number: 45, text: '  const [loading, setLoading] = useState(false)' },
  { kind: 'context', number: 46, text: '' },
  { kind: 'context', number: 47, text: '  const run = async (query) => {' },
  { kind: 'context', number: 48, text: '    setLoading(true)' },
  { kind: 'del', number: 49, text: '    const results = fetchResults(query)' },
  // Why: emphasis marks only the inserted keyword — that is the entire fix.
  {
    kind: 'add',
    number: 49,
    text: '    const results = await fetchResults(query)',
    emphasis: [20, 25]
  },
  { kind: 'context', number: 50, text: '    setResults(results)' },
  { kind: 'del', number: 51, text: '    setLoading(true)', emphasis: [15, 19] },
  { kind: 'add', number: 51, text: '    setLoading(false)', emphasis: [15, 20] },
  { kind: 'context', number: 52, text: '  }' }
]

/**
 * Why: the pane replays real Claude Code output, so a beat is one of the shapes
 * the brainless components model — a tool line or an edit hunk — rather than a
 * line of prose the view has to pattern-match. `wide` marks the entries the
 * phone drops: a six-line hunk cannot be read at 170px without scrolling
 * sideways, and the phone's job in this story is to follow along and reply.
 */
export type SessionEntry =
  | { kind: 'tool'; tool: string; arg: string; result: string; wide?: false }
  | {
      kind: 'edit'
      file: string
      summary: string
      lines: { type: 'add' | 'del' | 'ctx'; n?: number; text: string }[]
      wide: true
    }

export const SESSION_TRANSCRIPT: SessionEntry[] = [
  { kind: 'tool', tool: 'Read', arg: DIFF_FILE, result: 'Read 68 lines' },
  {
    kind: 'edit',
    file: DIFF_FILE,
    summary: 'Updated with 2 additions and 2 removals',
    wide: true,
    lines: [
      { type: 'ctx', n: 48, text: '    setLoading(true)' },
      { type: 'del', n: 49, text: '    const results = fetchResults(query)' },
      { type: 'add', n: 49, text: '    const results = await fetchResults(query)' },
      { type: 'ctx', n: 50, text: '    setResults(results)' },
      { type: 'del', n: 51, text: '    setLoading(true)' },
      { type: 'add', n: 51, text: '    setLoading(false)' }
    ]
  },
  { kind: 'tool', tool: 'Bash', arg: 'pnpm check', result: '✓ typecheck ✓ lint ✓ build' }
]

export const TAB_LABELS: Record<TabId, string> = {
  claude: 'claude',
  diff: 'Diff',
  browser: 'Browser'
}

export const initialState: DemoState = {
  worktrees: BASE_WORKTREES,
  groups: [{ tabs: ['claude'], activeTab: 'claude' }],
  promptChars: 0,
  working: false,
  transcript: 0,
  answered: false,
  diffLines: 0,
  browserReloading: false,
  browserFresh: false,
  composerText: '',
  composerActive: false,
  touchOnPhone: false,
  followUp: null,
  followUpWorking: false,
  cursor: { x: 58, y: 62 },
  cursorPressed: false,
  phoneVisible: false
}
