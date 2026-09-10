import {
  CLAUDE_IDLE,
  CURSOR_NATIVE_TITLE_LOWER,
  GEMINI_IDLE,
  GEMINI_PERMISSION,
  GEMINI_SILENT_WORKING,
  GEMINI_WORKING,
  STRONG_IDLE_KEYWORDS_RE,
  STRONG_WORKING_KEYWORDS_RE,
  containsAny,
  containsBrailleSpinner,
  containsLegacyAgentName,
  isClaudeManagementTitle,
  isGeminiTerminalTitle,
  isPiAgentTitle,
  isPiTerminalTitle
} from './core'
import type { AgentStatus } from './core'
import { getPiCompatibleSyntheticAgentStatus } from './pi-compatible'
import { isGrokRotatingWorkingTitle } from './provider'
import { AGY_AGENT_NAME_RE, DROID_AGENT_NAME_RE, HERMES_AGENT_NAME_RE } from './tokens'

/**
 * Normalize high-churn agent titles into stable display labels before storage.
 */
export function normalizeTerminalTitle(title: string): string {
  if (!title) {
    return title
  }

  if (isGeminiTerminalTitle(title)) {
    const status = detectAgentStatusFromTitle(title)
    if (status === 'permission') {
      return `${GEMINI_PERMISSION} Gemini CLI`
    }
    if (status === 'working') {
      return `${GEMINI_WORKING} Gemini CLI`
    }
    if (status === 'idle') {
      return `${GEMINI_IDLE} Gemini CLI`
    }
  }

  // Why: Pi animates every 80ms; collapse frames while preserving status.
  if (isPiAgentTitle(title)) {
    const status = detectAgentStatusFromTitle(title)
    if (status === 'working') {
      return '\u280b Pi'
    }
    if (status === 'idle') {
      return 'Pi'
    }
  }

  // Why: Grok Build interpolates a rotating status/tool phrase between the
  // spinner and its name, so its working frames change the title many times per
  // turn. Collapse them to one stable label; idle/session titles carry no
  // spinner and pass through, so the meaningful final title still shows (#7863).
  if (isGrokRotatingWorkingTitle(title)) {
    return '\u280b Grok'
  }

  return title
}

export function detectAgentStatusFromTitle(title: string): AgentStatus | null {
  if (!title || isClaudeManagementTitle(title)) {
    return null
  }
  if (title.trim().toLowerCase() === CURSOR_NATIVE_TITLE_LOWER) {
    return null
  }

  if (title.includes(GEMINI_PERMISSION)) {
    return 'permission'
  }
  if (title.includes(GEMINI_WORKING) || title.includes(GEMINI_SILENT_WORKING)) {
    return 'working'
  }
  if (title.includes(GEMINI_IDLE)) {
    return 'idle'
  }

  // Why: resolve synthetic Pi/OMP permission/idle labels before the broader
  // Pi and braille-spinner checks below.
  const piCompatibleSyntheticAgentStatus = getPiCompatibleSyntheticAgentStatus(title)
  if (piCompatibleSyntheticAgentStatus) {
    return piCompatibleSyntheticAgentStatus
  }

  if (title.startsWith(`${CLAUDE_IDLE} `) || title === CLAUDE_IDLE) {
    return 'idle'
  }
  if (isPiTerminalTitle(title)) {
    return 'idle'
  }
  if (containsBrailleSpinner(title)) {
    return 'working'
  }

  const hasDroidAgentName = DROID_AGENT_NAME_RE.test(title)
  const hasHermesAgentName = HERMES_AGENT_NAME_RE.test(title)
  const hasAgyAgentName = AGY_AGENT_NAME_RE.test(title)
  const hasLegacyAgentName = containsLegacyAgentName(title)
  if (!hasLegacyAgentName && !hasDroidAgentName && !hasHermesAgentName && !hasAgyAgentName) {
    return null
  }
  if (containsAny(title, ['action required', 'permission', 'waiting'])) {
    return 'permission'
  }
  // Why: boundary-aware regexes avoid cwd/path and substring false positives.
  if (STRONG_IDLE_KEYWORDS_RE.test(title)) {
    return 'idle'
  }
  if (STRONG_WORKING_KEYWORDS_RE.test(title)) {
    return 'working'
  }
  if (title.startsWith('. ')) {
    return 'working'
  }
  if (title.startsWith('* ')) {
    return 'idle'
  }

  // Why: Droid hook events are authoritative; native name-only titles should
  // not turn a still-sleeping execute tool into completion.
  if (hasDroidAgentName && !hasLegacyAgentName) {
    return null
  }

  return 'idle'
}
