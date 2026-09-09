export type ShellHydrationFailureReason =
  | 'none'
  | 'no_shell'
  | 'timeout'
  | 'spawn_error'
  | 'empty_path'

export type PathSource = 'shell_hydrate' | 'sync_seed_only'
