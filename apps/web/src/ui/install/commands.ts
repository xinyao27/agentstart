export type InstallCommand = {
  label: string
  command: string
}

/**
 * Why: the homepage block and the install page quote the same two one-liners, and a
 * drifted copy here is an install command that does not run. Both views read them
 * from this module rather than carrying their own.
 */
export const installCommands: readonly InstallCommand[] = [
  {
    label: 'macOS and Linux',
    command: 'curl -fsSL https://agentstart.ai/install.sh | sh'
  },
  {
    label: 'Windows',
    command: 'irm https://agentstart.ai/install.ps1 | iex'
  }
]
