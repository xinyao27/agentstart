import type { JSX } from 'react'
import { FolderSimple as FolderGit2, Cursor as MousePointer2 } from '~renderer/icons/hugeicons'
import { cn } from '~renderer/ui/class-names'

// Why: these static marks replace storyboarded animations for setup steps whose
// meaning reads instantly as a single mark — quieter than a looping demo.
// Each compresses its step to one recognizable idea drawn from the old animation.

// Mac-style terminal traffic-light dots — the signature of a AgentStart terminal pane.
function TerminalDots(): JSX.Element {
  return (
    <span className="flex gap-[3px]">
      <span className="bg-foreground/15 size-[5px] rounded-full" />
      <span className="bg-foreground/15 size-[5px] rounded-full" />
      <span className="bg-foreground/15 size-[5px] rounded-full" />
    </span>
  )
}

// Why: a small, static mark of two parallel worktrees — quieter than an animated
// storyboard, which read as cluttered for a step whose meaning is just "two isolated spaces."
export function SetupWorkspacesVisual(): JSX.Element {
  return (
    <div aria-hidden className="relative h-28 w-[156px] shrink-0">
      <WorktreeGlyphPanel className="bg-muted/60 top-0 right-0" />
      <WorktreeGlyphPanel className="bg-muted bottom-0 left-0" />
    </div>
  )
}

function WorktreeGlyphPanel(props: { className?: string }): JSX.Element {
  return (
    <div
      className={cn(
        'absolute flex h-[70px] w-[108px] items-start gap-2 rounded-[10px] border border-border p-3',
        props.className
      )}
    >
      <span className="mt-0.5 size-2 shrink-0 rounded-full bg-emerald-500" />
      <span className="flex min-w-0 flex-1 flex-col gap-1.5">
        <span className="bg-foreground/10 h-[5px] w-4/5 rounded-full" />
        <span className="bg-foreground/10 h-[5px] w-1/2 rounded-full" />
      </span>
    </div>
  )
}

// Use AgentStart's browser: a browser pane with a cursor grabbing one highlighted
// element — the point-and-send-to-agent idea compressed into a single mark.
export function SetupBrowserVisual(): JSX.Element {
  return (
    <div aria-hidden className="relative h-28 w-[156px] shrink-0">
      <div className="border-border bg-muted absolute inset-x-0 inset-y-1 flex flex-col overflow-hidden rounded-[10px] border-[1.5px]">
        <div className="border-border flex items-center gap-1.5 border-b px-2 py-1.5">
          <TerminalDots />
          <span className="bg-foreground/10 ml-1 h-[5px] flex-1 rounded-full" />
        </div>
        <div className="flex flex-1 flex-col gap-1.5 p-2">
          <span className="bg-foreground/10 h-[5px] w-1/2 rounded-full" />
          <span className="relative mt-0.5 flex h-9 items-center rounded-[6px] border-[1.5px] border-emerald-500/45 bg-emerald-500/10 px-2">
            <span className="bg-foreground/15 h-[5px] w-3/5 rounded-full" />
            <MousePointer2 className="fill-foreground/70 text-foreground/70 absolute right-1 -bottom-1 size-3.5" />
          </span>
        </div>
      </div>
    </div>
  )
}

// Start work in multiple repos: two project cards, each a folder + name and a
// live worktree row (emerald dot) — your repos, each running their own work.
export function SetupMultipleReposVisual(): JSX.Element {
  return (
    <div aria-hidden className="flex w-[156px] shrink-0 flex-col gap-2.5">
      <RepoCard nameWidth="w-[62%]" worktreeWidth="w-[78%]" />
      <RepoCard nameWidth="w-[70%]" worktreeWidth="w-[66%]" />
    </div>
  )
}

function RepoCard(props: { nameWidth: string; worktreeWidth: string }): JSX.Element {
  return (
    <div className="bg-muted flex flex-col gap-2 rounded-[10px] border-[1.5px] border-emerald-500/35 p-2.5">
      <span className="flex items-center gap-1.5">
        <FolderGit2 className="text-muted-foreground size-[15px] shrink-0" />
        <span className={cn('h-[5px] bg-foreground/10 rounded-full', props.nameWidth)} />
      </span>
      <span className="flex items-center gap-1.5">
        <span className="size-2 shrink-0 rounded-full bg-emerald-500" />
        <span className={cn('h-[5px] bg-foreground/10 rounded-full', props.worktreeWidth)} />
      </span>
    </div>
  )
}
