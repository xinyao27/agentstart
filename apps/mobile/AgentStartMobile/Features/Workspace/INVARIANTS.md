# Workspace invariants

## Entries

- A paired host opens a grouped Workspace list scoped to that host.
- Search, pull-to-refresh, reconnect, section collapse, lineage collapse, open tabs and long-press
  actions remain reachable without changing the row's tap target.
- Opening a Workspace requests `worktree.activate` with `notifyClients: false` before the Session
  hydrates, so a phone never pulls another paired client into the selected Workspace.

## Mutations

- Sleep, pin/unpin and delete use the server-authoritative Workspace identifier `id:<worktreeId>`.
- A Workspace accepts at most one in-flight lifecycle mutation; repeated taps are ignored.
- Every successful mutation refetches `worktree.ps`; the server snapshot, not local optimistic state,
  owns the final list.
- Delete always sends `force: true` and requires a second user
  confirmation that includes both display name and branch.
- A failed mutation keeps the Workspace in the list and presents a localized retryable error. It
  never silently reports success.

## Creation

- Home and Workspace List open the same feature-owned creation sheet against one connected host.
- Repository options, detected agents, disabled agents and command overrides come from the selected
  host; the phone does not assume its own installed tools.
- A blank name uses the lowercase marine-creature fallback. Known branch and
  remote conflicts retry with `-2` through `-25`; ambiguous transport failures never retry.
- A successful create refetches `worktree.list` and enters the server-created Workspace by stable
  ID; a response that is not present in the authoritative list is never treated as complete.
- Create From resolves branches and hosted reviews on the selected host. The client carries the
  server-proven base ref, comparison ref, linked review identity and valid push target into create;
  it never invents a remote ref from display text.
- A same-repository GitHub review whose head branch was deleted may fall back to the surviving pull
  ref SHA. That path must not retain the now-missing `origin` push target, while fork review targets
  remain intact.
- A setup script with `ask` policy blocks creation until the user explicitly runs or skips it. Run
  requires the content-hash trust prompt, and only the user's always-trust choice persists approval.

## Lifecycle

- The list polls only while its navigation destination is alive and cancels polling, tab streams
  and clocks when it disappears.
- Workspace polling, open-tab subscriptions, view-settings reads, and capability probes only run
  while the host snapshot is connected; an explicit Disconnect therefore cannot be undone by a
  stale list refresh or capability task.
- Foreground and network revival remain owned by the shared runtime session; the feature only asks
  for an explicit reconnect after user intent.
- Workspaces and open tabs are keyed by stable server IDs; list indices are never identities.
- Empty-list copy is explicit: search misses say “No matching workspaces”, active view
  filters say “No workspaces match filters”, and a connected empty host says “No workspaces”. A
  cached empty list during reconnect does not claim that the host has no workspaces.

## Visual contract

- `DESIGN.md` remains canonical for type sizes, row height, spacing, colors and icons.
- Every project icon is centered in the same fixed-width section column, and every project name
  starts at the same horizontal anchor; the project rail does not participate in icon alignment.
- Ordinary list glyphs are muted, unread activity is amber, and hosted-review glyphs retain their
  open, closed, and merged state colors instead of inheriting the default foreground.
- The action sheet uses Hugeicons Free semantic icons for every action.
- Functional chrome uses iOS 26 Liquid Glass; content rows and backgrounds do not receive decorative
  glass.
- Loaders and action chrome are neutral gray. Blue is not an action or loading color.
