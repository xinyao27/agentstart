import type { NestedRepoScanResult } from '@yiru/protocol/project/group-model'
import { useState } from 'react'
import { translate } from '~renderer/i18n/i18n'
import { Question as CircleHelp } from '~renderer/icons/hugeicons'
import { Button } from '~renderer/ui/button'

import { Popover, PopoverContent, PopoverTrigger } from '../ui/popover'

function formatTimeout(timeoutMs: number): string {
  if (timeoutMs >= 1000 && timeoutMs % 1000 === 0) {
    return `${timeoutMs / 1000} seconds`
  }
  return `${timeoutMs} ms`
}

export function nestedRepoScanLimitText(scan: NestedRepoScanResult): string {
  const automaticStops = [`${scan.maxDepth} folder levels`, `${scan.maxRepos} repositories`]
  if (scan.timeoutMs !== null) {
    automaticStops.push(formatTimeout(scan.timeoutMs))
  }
  return `Scan stops after ${automaticStops.join(' or ')}. You can stop scanning early and import repositories found so far.`
}

export function NestedRepoScanLimitNotice({ scan }: { scan: NestedRepoScanResult }) {
  const [detailsOpen, setDetailsOpen] = useState(false)
  const detailsText = nestedRepoScanLimitText(scan)

  return (
    <div
      className="text-muted-foreground inline-flex min-w-0 items-center gap-1.5 text-[11px]"
      onPointerEnter={() => setDetailsOpen(true)}
      onPointerLeave={() => setDetailsOpen(false)}
      onFocusCapture={() => setDetailsOpen(true)}
      onBlurCapture={() => setDetailsOpen(false)}
    >
      <span>
        {scan.stopped
          ? translate(
              'auto.components.repo.NestedRepoScanLimitNotice.03e9beab7b',
              'Scan stopped early.'
            )
          : translate(
              'auto.components.repo.NestedRepoScanLimitNotice.574eb5408b',
              'Showing partial scan results.'
            )}
      </span>
      <Popover open={detailsOpen} onOpenChange={setDetailsOpen}>
        <PopoverTrigger
          render={
            <Button
              variant="quiet"
              size="icon-xs"
              type="button"
              aria-label={translate(
                'auto.components.repo.NestedRepoScanLimitNotice.642a43c139',
                'Nested repository scan limits'
              )}
              aria-expanded={detailsOpen}
              title={detailsText}
              className="size-4 transition"
              onClick={(event) => {
                event.stopPropagation()
                setDetailsOpen(true)
              }}
            >
              <CircleHelp className="size-3.5" />
            </Button>
          }
        />
        <PopoverContent
          side="top"
          sideOffset={4}
          className="max-w-[260px] px-3 py-2 text-xs leading-5 text-pretty"
          // Why: this popover opens on hover, so default focus-on-open would
          // yank focus off the dialog every time the pointer grazes the icon.
          initialFocus={false}
        >
          {detailsText}
        </PopoverContent>
      </Popover>
    </div>
  )
}
