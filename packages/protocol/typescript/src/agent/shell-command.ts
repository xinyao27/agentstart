export type StartupHostPlatform =
  | 'aix'
  | 'android'
  | 'darwin'
  | 'freebsd'
  | 'haiku'
  | 'linux'
  | 'openbsd'
  | 'sunos'
  | 'win32'
  | 'cygwin'
  | 'netbsd'

export type AgentStartupShell = 'posix' | 'powershell' | 'cmd'

export type StartupCommandError = 'unclosed-quote'

export type StartupCommandTokens =
  | { ok: true; tokens: string[] }
  | { ok: false; error: StartupCommandError }

// Why: startup arguments need grouping, not shell expansion; keeping this
// parser literal avoids platform-specific interpolation and command execution.
function tokenizePosixStartupCommand(value: string): StartupCommandTokens {
  const tokens: string[] = []
  let token = ''
  let tokenStarted = false
  let quote: '"' | "'" | null = null
  let index = 0

  while (index < value.length) {
    const char = value[index]
    if (quote) {
      if (char === '\\' && quote === '"' && index + 1 < value.length) {
        token += value[index + 1]
        index += 2
        continue
      }
      if (char === quote) {
        quote = null
        tokenStarted = true
        index += 1
        continue
      }
      token += char
      index += 1
      continue
    }

    if (char === '"' || char === "'") {
      quote = char
      tokenStarted = true
      index += 1
      continue
    }
    if (char === '\\' && index + 1 < value.length) {
      token += value[index + 1]
      tokenStarted = true
      index += 2
      continue
    }
    if (/\s/.test(char)) {
      if (tokenStarted) {
        tokens.push(token)
        token = ''
        tokenStarted = false
      }
      index += 1
      continue
    }

    token += char
    tokenStarted = true
    index += 1
  }

  if (quote) {
    return { ok: false, error: 'unclosed-quote' }
  }
  if (tokenStarted) {
    tokens.push(token)
  }
  return { ok: true, tokens }
}

function tokenizeWindowsStartupCommand(
  value: string,
  shell: Exclude<AgentStartupShell, 'posix'>
): StartupCommandTokens {
  const tokens: string[] = []
  let token = ''
  let quote: "'" | '"' | null = null
  let tokenStarted = false
  for (let index = 0; index < value.length; index += 1) {
    const char = value[index]
    const escape = shell === 'cmd' ? '^' : '`'
    if (char === escape && index + 1 < value.length) {
      token += value[index + 1]
      tokenStarted = true
      index += 1
      continue
    }
    if (quote) {
      if (char === quote) {
        if (shell === 'powershell' && quote === "'" && value[index + 1] === "'") {
          token += "'"
          index += 1
        } else {
          quote = null
        }
      } else {
        token += char
      }
      tokenStarted = true
      continue
    }
    if (char === "'" || char === '"') {
      quote = char
      tokenStarted = true
    } else if (/\s/.test(char)) {
      if (tokenStarted) {
        tokens.push(token)
        token = ''
        tokenStarted = false
      }
    } else {
      token += char
      tokenStarted = true
    }
  }
  if (quote) {
    return { ok: false, error: 'unclosed-quote' }
  }
  if (tokenStarted) {
    tokens.push(token)
  }
  return { ok: true, tokens }
}

export function tokenizeStartupCommand(
  value: string,
  shell: AgentStartupShell
): StartupCommandTokens {
  return shell === 'posix'
    ? tokenizePosixStartupCommand(value)
    : tokenizeWindowsStartupCommand(value, shell)
}

export function resolveStartupShell(
  platform: StartupHostPlatform,
  shell?: AgentStartupShell
): AgentStartupShell {
  return shell ?? (platform === 'win32' ? 'powershell' : 'posix')
}

export function quoteStartupArg(value: string, shell: AgentStartupShell): string {
  if (shell === 'powershell') {
    return `'${value.replace(/'/g, "''")}'`
  }
  if (shell === 'cmd') {
    return `"${value.replace(/([\^&|<>()%!"])/g, '^$1')}"`
  }
  return `'${value.replace(/'/g, `'\\''`)}'`
}

export function commandSeparator(shell: AgentStartupShell): string {
  return shell === 'cmd' ? ' & ' : '; '
}

export type AgentCliArgsPlan =
  | { ok: true; suffix: string }
  | { ok: false; error: StartupCommandError }

export function planAgentCliArgsSuffix(
  agentArgs: string | null | undefined,
  shell: AgentStartupShell
): AgentCliArgsPlan {
  const trimmed = agentArgs?.trim()
  if (!trimmed) {
    return { ok: true, suffix: '' }
  }
  const tokenized = tokenizeStartupCommand(trimmed, shell)
  if (!tokenized.ok) {
    return { ok: false, error: tokenized.error }
  }
  return {
    ok: true,
    suffix: tokenized.tokens.map((token) => quoteStartupArg(token, shell)).join(' ')
  }
}

export function buildShellCommandFromArgv(
  args: readonly string[],
  shell: AgentStartupShell
): string {
  const command = args.map((arg) => quoteStartupArg(arg, shell)).join(' ')
  if (shell === 'powershell' && command) {
    return `& ${command}`
  }
  return command
}

export function clearEnvCommand(name: string, shell: AgentStartupShell): string {
  if (shell === 'powershell') {
    return `Remove-Item Env:${name} -ErrorAction SilentlyContinue`
  }
  if (shell === 'cmd') {
    return `set "${name}="`
  }
  return `unset ${name}`
}
