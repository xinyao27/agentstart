import { translate } from '~renderer/i18n/i18n'
import { ArrowSquareOut, Globe } from '~renderer/icons/hugeicons'
import { useAppStore } from '~renderer/store/state'
import { Button } from '~renderer/ui/button'

export function BrowserTabProjectionPane({
  workspaceId,
  worktreeId
}: {
  workspaceId: string
  worktreeId: string
}): React.JSX.Element {
  const workspace = useAppStore((state) =>
    (state.browserTabsByWorktree[worktreeId] ?? []).find((tab) => tab.id === workspaceId)
  )
  const focusBrowserTab = useAppStore((state) => state.focusBrowserTabInWorktree)

  if (!workspace) {
    return (
      <div className="text-muted-foreground flex size-full items-center justify-center text-sm">
        {translate(
          'auto.browser.tab.projection.pane.missing',
          'This Chrome tab is no longer available.'
        )}
      </div>
    )
  }

  const pageId = workspace.activePageId ?? workspace.pageIds?.[0] ?? null
  return (
    <div className="flex size-full items-center justify-center p-8">
      <div className="flex max-w-md flex-col items-center gap-4 text-center">
        <div className="border-border bg-muted/40 flex size-12 items-center justify-center rounded-md border">
          <Globe className="size-5 text-blue-500" aria-hidden />
        </div>
        <div className="space-y-1">
          <h2 className="text-foreground text-base font-medium">{workspace.title}</h2>
          <p className="text-muted-foreground text-xs break-all">{workspace.url}</p>
        </div>
        <p className="text-muted-foreground text-sm">
          {translate(
            'auto.browser.tab.projection.pane.explanation',
            'This page runs in your real Chrome profile, with your sign-in state, cookies, and extensions.'
          )}
        </p>
        <Button
          type="button"
          variant="secondary"
          disabled={!pageId}
          onClick={() => {
            if (pageId) {
              focusBrowserTab(worktreeId, pageId)
            }
          }}
        >
          <ArrowSquareOut aria-hidden />
          {translate('auto.browser.tab.projection.pane.show', 'Show Chrome tab')}
        </Button>
      </div>
    </div>
  )
}
