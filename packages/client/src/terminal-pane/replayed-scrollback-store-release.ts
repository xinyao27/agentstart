import {
  shouldPreserveTerminalScrollbackBuffers,
  type RepoConnection
} from '~renderer/terminal-workspace/scrollback-buffers'

export function canReleaseReplayedScrollbackFromStore(args: {
  hasScrollbackRefs: boolean
  worktreeId: string | undefined
  repos: readonly RepoConnection[]
}): boolean {
  return (
    args.hasScrollbackRefs || shouldPreserveTerminalScrollbackBuffers(args.worktreeId, args.repos)
  )
}
