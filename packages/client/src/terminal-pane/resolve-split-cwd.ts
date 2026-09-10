type PaneCwdEntry = { cwd: string; confirmed: boolean }

export type PaneCwdMap = Map<number, PaneCwdEntry>

export async function resolveSplitCwd(args: {
  paneCwdMap: PaneCwdMap
  sourcePaneId: number
  sourcePtyId: string | null
  fallbackCwd: string
}): Promise<string> {
  const { paneCwdMap, sourcePaneId, fallbackCwd } = args

  // 1) Live OSC 7 wins — no IPC round-trip needed.
  const cached = paneCwdMap.get(sourcePaneId)
  if (cached?.confirmed && cached.cwd) {
    return cached.cwd
  }

  // Why: the multiplex snapshot carries cwd into the pane's OSC cache. If a
  // shell has not published one, keep split creation host-agnostic and fall
  // back to the worktree root instead of opening a second transport.
  if (cached?.cwd) {
    return cached.cwd
  }

  return fallbackCwd
}
