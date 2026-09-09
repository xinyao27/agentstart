function quotePosixShell(value: string): string {
  return `'${value.replace(/'/g, "'\\''")}'`
}

export function buildWslLoginShellCommand(command: string): string {
  const quotedCommand = quotePosixShell(command)
  return [
    '_yiru_wsl_shell=$(getent passwd "$(id -un)" 2>/dev/null | cut -d: -f7)',
    'if [ -z "$_yiru_wsl_shell" ] || [ ! -x "$_yiru_wsl_shell" ]; then',
    '  _yiru_wsl_shell="${SHELL:-/bin/bash}"',
    'fi',
    'if [ -z "$_yiru_wsl_shell" ] || [ ! -x "$_yiru_wsl_shell" ]; then',
    '  _yiru_wsl_shell=/bin/sh',
    'fi',
    '_yiru_wsl_shell_name=$(basename "$_yiru_wsl_shell" | tr "[:upper:]" "[:lower:]")',
    'case "$_yiru_wsl_shell_name" in',
    `  sh|dash) exec "$_yiru_wsl_shell" -lc ${quotedCommand} ;;`,
    `  bash|zsh|ksh|mksh|ash) exec "$_yiru_wsl_shell" -ilc ${quotedCommand} ;;`,
    `  *) exec /bin/sh -lc ${quotedCommand} ;;`,
    'esac'
  ].join('\n')
}
