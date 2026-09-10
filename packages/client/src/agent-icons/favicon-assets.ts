import type { TuiAgent } from '@agentstart/protocol/agent/types'
import ampUrl from '~renderer/agent-icons/amp.png?url'
import anteUrl from '~renderer/agent-icons/ante.png?url'
import antigravityUrl from '~renderer/agent-icons/antigravity.png?url'
import augUrl from '~renderer/agent-icons/aug.png?url'
import autohandUrl from '~renderer/agent-icons/autohand.png?url'
import clineUrl from '~renderer/agent-icons/cline.png?url'
import codebuffUrl from '~renderer/agent-icons/codebuff.png?url'
import commandCodeUrl from '~renderer/agent-icons/command-code.png?url'
import continueUrl from '~renderer/agent-icons/continue.png?url'
import crushUrl from '~renderer/agent-icons/crush.png?url'
import cursorUrl from '~renderer/agent-icons/cursor.png?url'
import devinUrl from '~renderer/agent-icons/devin.png?url'
import geminiUrl from '~renderer/agent-icons/gemini.png?url'
import gooseUrl from '~renderer/agent-icons/goose.png?url'
import grokUrl from '~renderer/agent-icons/grok.png?url'
import hermesUrl from '~renderer/agent-icons/hermes.png?url'
import kimiUrl from '~renderer/agent-icons/kimi.png?url'
import kiroUrl from '~renderer/agent-icons/kiro.png?url'
import mimoCodeUrl from '~renderer/agent-icons/mimo-code.png?url'
import mistralVibeUrl from '~renderer/agent-icons/mistral-vibe.png?url'
import openclawUrl from '~renderer/agent-icons/openclaw.png?url'
import qwenCodeUrl from '~renderer/agent-icons/qwen-code.png?url'
import rovoUrl from '~renderer/agent-icons/rovo.png?url'

// Why: these agents have no hand-authored SVG glyph, so previously their icons
// loaded live from Google's favicon service. That service is unreachable in some
// regions (e.g. mainland China) and offline, leaving broken images across the
// agent settings page, tab title bar, and status bar (#8451). Bundle the favicon
// PNGs at build time so the icons render without any network dependency.
// The PNGs live in the source-only client package so every browser host bundles the same
// offline-safe favicon set without reaching into a host implementation.
export const AGENT_FAVICON_ASSETS: Partial<Record<TuiAgent, string>> = {
  grok: grokUrl,
  'mimo-code': mimoCodeUrl,
  ante: anteUrl,
  gemini: geminiUrl,
  antigravity: antigravityUrl,
  goose: gooseUrl,
  amp: ampUrl,
  kiro: kiroUrl,
  crush: crushUrl,
  aug: augUrl,
  autohand: autohandUrl,
  cline: clineUrl,
  codebuff: codebuffUrl,
  'command-code': commandCodeUrl,
  continue: continueUrl,
  cursor: cursorUrl,
  kimi: kimiUrl,
  'mistral-vibe': mistralVibeUrl,
  'qwen-code': qwenCodeUrl,
  rovo: rovoUrl,
  hermes: hermesUrl,
  devin: devinUrl,
  openclaw: openclawUrl
}
