import type { StartupHostPlatform } from '../shell-command'
import type { TuiAgent } from '../types'

export type AgentPromptInjectionMode =
  | 'argv'
  | 'flag-prompt'
  | 'flag-prompt-interactive'
  | 'flag-interactive'
  | 'hermes-query'
  | 'stdin-after-start'

export type DraftPasteReadySignal =
  | 'render-quiet-after-bracketed-paste'
  | 'codex-composer-prompt'
  | 'render-cursor-after-bracketed-paste'

export type TuiAgentConfig = {
  detectCmd: string
  /** Additional executable names that identify the same agent on PATH. */
  detectCmdAliases?: readonly string[]
  launchCmd: string
  /** Platform-specific launch command when the public binary name differs. */
  launchCmdByPlatform?: Partial<Record<StartupHostPlatform, string>>
  expectedProcess: string
  promptInjectionMode: AgentPromptInjectionMode
  /** Option terminator required before positional prompts that may look like CLI syntax. */
  argvPromptSeparator?: '--'
  // Why: native draft seeding avoids waiting for an empirical paste-readiness signal.
  draftPromptFlag?: string
  // Why: Pi-family overlays can seed the editor without submitting or waiting for paste readiness.
  draftPromptEnvVar?: string
  // Why: trust menus consume pasted drafts; the runtime prepares agent-owned trust before spawn.
  preflightTrust?: 'cursor' | 'copilot' | 'codex'
  /** Why: most TUIs need both bracketed-paste enablement and a quiet render
   * window before pasted bytes reliably land in the composer. Codex can use
   * a stronger signal from its own renderer: chat_composer.rs writes the
   * `›` prompt only when the composer row exists, so Yiru can paste as soon
   * as that prompt appears after bracketed paste is enabled. */
  draftPasteReadySignal?: DraftPasteReadySignal
  /** Windows Shift+Enter override. Omitted agents keep the legacy Esc+CR path
   * because the renderer cannot infer every local or remote TUI's decoder. */
  windowsShiftEnterEncoding?: 'csi-u'
}

export const TUI_AGENT_CONFIG: Record<TuiAgent, TuiAgentConfig> = {
  claude: {
    detectCmd: 'claude',
    launchCmd: 'claude',
    expectedProcess: 'claude',
    promptInjectionMode: 'argv',
    // Why: `claude --prefill <text>` lands the TUI with `<text>` in the
    // input box, nothing submitted. Strictly better than the paste-after-
    // ready fallback because it eliminates the readiness race entirely.
    // See legacy PR #926 for context.
    draftPromptFlag: '--prefill'
  },
  openclaude: {
    detectCmd: 'openclaude',
    launchCmd: 'openclaude',
    expectedProcess: 'openclaude',
    promptInjectionMode: 'argv',
    draftPromptFlag: '--prefill'
  },
  codex: {
    detectCmd: 'codex',
    launchCmd: 'codex',
    expectedProcess: 'codex',
    promptInjectionMode: 'argv',
    preflightTrust: 'codex',
    draftPasteReadySignal: 'codex-composer-prompt'
  },
  autohand: {
    detectCmd: 'autohand',
    launchCmd: 'autohand',
    expectedProcess: 'autohand',
    promptInjectionMode: 'stdin-after-start'
  },
  ante: {
    detectCmd: 'ante',
    launchCmd: 'ante',
    expectedProcess: 'ante',
    // Why: `ante --prompt` is Ante's documented headless mode (runs the task
    // once and exits), so Yiru launches the bare interactive TUI and injects
    // the composed prompt after startup to keep the hosted session alive.
    promptInjectionMode: 'stdin-after-start'
  },
  trae: {
    // Why: the unrelated bytedance/trae-agent package owns `trae-cli`; only
    // TRAE CN's CLI ships the unambiguous `traecli` executable.
    detectCmd: 'traecli',
    launchCmd: 'traecli',
    expectedProcess: 'traecli',
    promptInjectionMode: 'argv',
    // Why: Cobra otherwise treats prompts beginning with a flag or subcommand as CLI syntax.
    argvPromptSeparator: '--'
  },
  opencode: {
    detectCmd: 'opencode',
    launchCmd: 'opencode',
    expectedProcess: 'opencode',
    promptInjectionMode: 'flag-prompt',
    // Why: opencode enables bracketed paste before its composer mounts; wait
    // for post-\x1b[?2004h show-cursor (\x1b[?25h) so paste hits mounted input.
    draftPasteReadySignal: 'render-cursor-after-bracketed-paste'
  },
  'mimo-code': {
    detectCmd: 'mimo',
    launchCmd: 'mimo',
    expectedProcess: 'mimo',
    promptInjectionMode: 'flag-prompt',
    // Why: mimo-code shares opencode's flag-prompt paste route, so it gets the
    // same cursor-gated signal by parity (its startup stream is not separately
    // validated); the quiet-window fallback bounds the risk if it differs.
    draftPasteReadySignal: 'render-cursor-after-bracketed-paste'
  },
  pi: {
    detectCmd: 'pi',
    launchCmd: 'pi',
    expectedProcess: 'pi',
    promptInjectionMode: 'argv',
    // Why: the installed Pi overlay reads this on session_start and seeds the editor.
    draftPromptEnvVar: 'YIRU_PI_PREFILL'
  },
  omp: {
    detectCmd: 'omp',
    launchCmd: 'omp',
    expectedProcess: 'omp',
    promptInjectionMode: 'argv',
    draftPromptEnvVar: 'YIRU_OMP_PREFILL'
  },
  gemini: {
    detectCmd: 'gemini',
    launchCmd: 'gemini',
    expectedProcess: 'gemini',
    promptInjectionMode: 'flag-prompt-interactive'
  },
  antigravity: {
    detectCmd: 'agy',
    launchCmd: 'agy',
    expectedProcess: 'agy',
    promptInjectionMode: 'flag-prompt-interactive'
  },
  aider: {
    detectCmd: 'aider',
    launchCmd: 'aider',
    expectedProcess: 'aider',
    promptInjectionMode: 'stdin-after-start'
  },
  goose: {
    detectCmd: 'goose',
    launchCmd: 'goose',
    expectedProcess: 'goose',
    promptInjectionMode: 'stdin-after-start'
  },
  amp: {
    detectCmd: 'amp',
    launchCmd: 'amp',
    expectedProcess: 'amp',
    promptInjectionMode: 'stdin-after-start'
  },
  kilo: {
    detectCmd: 'kilo',
    launchCmd: 'kilo',
    expectedProcess: 'kilo',
    promptInjectionMode: 'stdin-after-start'
  },
  kiro: {
    // Why: the official Kiro installer (https://cli.kiro.dev/install) places a
    // binary named `kiro-cli` on PATH — there is no `kiro` binary. Keep the
    // TuiAgent id as 'kiro' for stored preferences, but detect/launch/identify
    // the real binary name so the agent is recognized as active.
    detectCmd: 'kiro-cli',
    // Why: trust flags are accepted by Kiro's chat subcommand, not the
    // top-level kiro-cli command. Keep TUI startup explicit so default args
    // like --trust-all-tools are appended where the installed CLI accepts them.
    launchCmd: 'kiro-cli chat --tui',
    expectedProcess: 'kiro-cli',
    promptInjectionMode: 'stdin-after-start'
  },
  crush: {
    detectCmd: 'crush',
    launchCmd: 'crush',
    expectedProcess: 'crush',
    promptInjectionMode: 'stdin-after-start'
  },
  aug: {
    // Why: the published @augmentcode/auggie npm package installs a binary
    // named `auggie` (not `aug`). Keep the TuiAgent id as 'aug' for stored
    // preferences, but detect/launch/identify the real binary name.
    detectCmd: 'auggie',
    launchCmd: 'auggie',
    expectedProcess: 'auggie',
    promptInjectionMode: 'stdin-after-start'
  },
  cline: {
    detectCmd: 'cline',
    launchCmd: 'cline',
    expectedProcess: 'cline',
    promptInjectionMode: 'stdin-after-start'
  },
  codebuff: {
    detectCmd: 'codebuff',
    launchCmd: 'codebuff',
    expectedProcess: 'codebuff',
    promptInjectionMode: 'stdin-after-start'
  },
  'command-code': {
    // Why: `npm i -g command-code` installs two binaries — `command-code` and
    // the shorter alias `cmd`. Use the full `command-code` name so detection
    // does not collide with Windows' built-in `cmd.exe` shell, which
    // agent-process-recognition normalizes to `cmd` after stripping the .exe.
    detectCmd: 'command-code',
    // Why: Command Code's documented positional prompt starts the turn, while
    // paste-after-start can leave the prompt sitting in the composer. `--trust`
    // mirrors the preflight trust behavior Yiru applies to other first-run
    // TUIs so launch prompts do not consume the task text.
    launchCmd: 'command-code --trust',
    expectedProcess: 'command-code',
    promptInjectionMode: 'argv'
  },
  continue: {
    // Why: Continue's CLI binary is `cn`; `continue` is a shell builtin in
    // bash/zsh, so using it here can resolve to the shell keyword instead of
    // the coding agent.
    detectCmd: 'cn',
    launchCmd: 'cn',
    expectedProcess: 'cn',
    promptInjectionMode: 'stdin-after-start'
  },
  cursor: {
    detectCmd: 'cursor-agent',
    launchCmd: 'cursor-agent',
    expectedProcess: 'cursor-agent',
    promptInjectionMode: 'argv',
    // Why: cursor-agent's first-launch trust menu ([a]/[w]/[q]) used to
    // swallow our bracketed paste. Pre-writing the same `.workspace-trusted`
    // marker the CLI itself writes after the user accepts (see
    // runtime trust preparation) makes the menu skip entirely, so the draft
    // URL paste lands in the input as intended.
    preflightTrust: 'cursor'
  },
  droid: {
    detectCmd: 'droid',
    launchCmd: 'droid',
    expectedProcess: 'droid',
    promptInjectionMode: 'argv',
    // Why: Droid decodes CSI-u on Windows and treats Yiru's legacy Esc+CR
    // fallback as plain Enter, which submits instead of inserting a newline.
    windowsShiftEnterEncoding: 'csi-u'
  },
  kimi: {
    detectCmd: 'kimi',
    launchCmd: 'kimi',
    expectedProcess: 'kimi',
    promptInjectionMode: 'stdin-after-start'
  },
  'mistral-vibe': {
    // Why: Mistral's installer and PyPI package expose `vibe` even though the
    // package/project name is mistral-vibe. Keep the old name as an alias for
    // manually wrapped installs.
    detectCmd: 'vibe',
    detectCmdAliases: ['mistral-vibe'],
    launchCmd: 'vibe',
    expectedProcess: 'vibe',
    promptInjectionMode: 'stdin-after-start'
  },
  'qwen-code': {
    // Why: the upstream package is QwenLM/qwen-code, but its installed CLI
    // executable on PATH is `qwen`, so detect/launch/recognition must use that.
    detectCmd: 'qwen',
    launchCmd: 'qwen',
    expectedProcess: 'qwen',
    promptInjectionMode: 'stdin-after-start'
  },
  rovo: {
    detectCmd: 'rovo',
    launchCmd: 'rovo',
    expectedProcess: 'rovo',
    promptInjectionMode: 'stdin-after-start'
  },
  hermes: {
    detectCmd: 'hermes',
    // Why: bare `hermes` opens the classic REPL in recent Hermes releases;
    // `--tui` starts the full-screen agent UI Yiru is designed to host.
    launchCmd: 'hermes --tui',
    expectedProcess: 'hermes',
    // Why: Hermes owns prompt delivery through its startup-query contract,
    // which submits only after the TUI composer and session are ready.
    promptInjectionMode: 'hermes-query'
  },
  openclaw: {
    detectCmd: 'openclaw',
    launchCmd: 'openclaw',
    expectedProcess: 'openclaw',
    promptInjectionMode: 'stdin-after-start'
  },
  copilot: {
    detectCmd: 'copilot',
    launchCmd: 'copilot',
    expectedProcess: 'copilot',
    // Why: `copilot --prompt <text>` runs non-interactively and exits on
    // completion, which would kill the TUI session Yiru is hosting.
    // `-i/--interactive <prompt>` starts an interactive session with the
    // initial prompt pre-executed — the behavior Yiru needs.
    promptInjectionMode: 'flag-interactive',
    // Why: Copilot's first-launch trust menu used to swallow our bracketed
    // paste. Pre-appending the workspace path to `trustedFolders` in
    // ~/.copilot/config.json (the same array Copilot's own
    // `addTrustedFolder` writes after the user accepts) makes the menu skip
    // entirely. See runtime trust preparation for the file layout.
    preflightTrust: 'copilot'
  },
  grok: {
    detectCmd: 'grok',
    launchCmd: 'grok',
    expectedProcess: 'grok',
    // Why: Grok CLI accepts an initial prompt as a positional argv
    // (`grok "fix the bug"`). Prefer argv over stdin-after-start so multi-line
    // / special-character prompts are not typed as raw PTY keystrokes, and so
    // clipboard-derived launch text is not mangled by line-edit shortcuts.
    promptInjectionMode: 'argv',
    // Why: prompts such as `help` or `--version` otherwise select Grok CLI
    // syntax instead of starting an interactive turn with that literal text.
    argvPromptSeparator: '--'
  },
  devin: {
    detectCmd: 'devin',
    launchCmd: 'devin',
    expectedProcess: 'devin',
    // Why: `devin -- <prompt>` auto-submits immediately (docs.devin.ai/cli).
    // `stdin-after-start` starts the REPL with no argv prompt; Yiru then sends
    // `followupPrompt` to the PTY as plain input + Enter after startup (not
    // bracketed paste). Use `draftPrompt` / agent-paste-draft for review-before-send.
    promptInjectionMode: 'stdin-after-start'
  }
}

export function getTuiAgentDetectCommands(config: TuiAgentConfig): string[] {
  return [config.detectCmd, ...(config.detectCmdAliases ?? [])]
}

export function getTuiAgentLaunchCommand(
  config: TuiAgentConfig,
  platform: StartupHostPlatform,
  opts?: { isRemote?: boolean }
): string {
  // Why: remote Linux launches use the relay's public command instead of a
  // platform-specific local override.
  if (opts?.isRemote && platform === 'linux') {
    return config.launchCmd
  }
  return config.launchCmdByPlatform?.[platform] ?? config.launchCmd
}
