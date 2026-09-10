function quotePosixShell(value: string): string {
  return `'${value.replace(/'/g, "'\\''")}'`
}

export function buildWslLoginShellCommand(command: string): string {
  const quotedCommand = quotePosixShell(command)
  return [
    '_agentstart_wsl_shell=$(getent passwd "$(id -un)" 2>/dev/null | cut -d: -f7)',
    'if [ -z "$_agentstart_wsl_shell" ] || [ ! -x "$_agentstart_wsl_shell" ]; then',
    '  _agentstart_wsl_shell="${SHELL:-/bin/bash}"',
    'fi',
    'if [ -z "$_agentstart_wsl_shell" ] || [ ! -x "$_agentstart_wsl_shell" ]; then',
    '  _agentstart_wsl_shell=/bin/sh',
    'fi',
    '_agentstart_wsl_shell_name=$(basename "$_agentstart_wsl_shell" | tr "[:upper:]" "[:lower:]")',
    'case "$_agentstart_wsl_shell_name" in',
    `  sh|dash) exec "$_agentstart_wsl_shell" -lc ${quotedCommand} ;;`,
    `  bash|zsh|ksh|mksh|ash) exec "$_agentstart_wsl_shell" -ilc ${quotedCommand} ;;`,
    `  *) exec /bin/sh -lc ${quotedCommand} ;;`,
    'esac'
  ].join('\n')
}
