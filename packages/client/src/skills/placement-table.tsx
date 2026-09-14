import type { SkillPlacement } from '@agentstart/protocol'
import { toast } from 'sonner'
import { translate } from '~renderer/i18n/i18n'
import { ArrowRight, FolderOpen } from '~renderer/icons/hugeicons'
import { dirname } from '~renderer/path'
import { shellClient } from '~renderer/runtime/shell-client'
import { Badge } from '~renderer/ui/badge'
import { Button } from '~renderer/ui/button'
import { ScrollArea } from '~renderer/ui/scroll-area'
import { Tooltip, TooltipContent, TooltipTrigger } from '~renderer/ui/tooltip'

import { formatUpdatedAt, providerLabels } from './labels'
import {
  placementTopologyDescription,
  placementTopologyIcons,
  placementTopologyLabel,
  splitPathForDisplay
} from './placement-labels'

export type SkillPlacementTableProps = {
  placements: readonly SkillPlacement[]
}

async function revealPlacement(placement: SkillPlacement): Promise<void> {
  const result = await shellClient.shell.openInFileManager(placement.skillFilePath)
  if (!result.ok) {
    toast.error(
      translate('auto.components.skills.SkillsPage.995fde8337', 'Could not reveal skill file')
    )
  }
}

/**
 * Where a copy lives, as one line: the folder that holds it leaves its name to
 * the pane title, so the row spends its width on the location instead. The head
 * elides when room runs short, the tail never does, and the whole path stays on
 * the row as its title.
 */
function PlacementPathLine({
  path,
  leading,
  className
}: {
  path: string
  leading?: React.ReactNode
  className: string
}): React.JSX.Element {
  const { head, tail } = splitPathForDisplay(dirname(path))
  return (
    <p className={className} title={path}>
      {leading}
      <span className="text-muted-foreground min-w-0 truncate">{head}</span>
      <span className="shrink-0">{tail}</span>
    </p>
  )
}

function SkillPlacementRow({ placement }: { placement: SkillPlacement }): React.JSX.Element {
  const TopologyIcon = placementTopologyIcons[placement.topology]
  return (
    <li className="border-border/60 flex min-w-0 items-start gap-3 border-t px-3 py-2 first:border-t-0">
      <div className="min-w-0 flex-1 space-y-0.5">
        <PlacementPathLine
          path={placement.directoryPath}
          className="flex min-w-0 font-mono text-[11px]"
        />
        <p className="text-muted-foreground flex min-w-0 flex-wrap items-center gap-x-2 text-[11px]">
          <span className="truncate">{placement.rootLabel}</span>
          <span aria-hidden>·</span>
          <span className="truncate">
            {placement.providers.map((provider) => providerLabels[provider]).join(', ')}
          </span>
          <span aria-hidden>·</span>
          <span>{formatUpdatedAt(placement.updatedAt)}</span>
        </p>
        {placement.linkTargetPath ? (
          <PlacementPathLine
            path={placement.linkTargetPath}
            leading={<ArrowRight className="size-3 shrink-0" />}
            className="text-muted-foreground flex min-w-0 items-center gap-1 font-mono text-[11px]"
          />
        ) : null}
      </div>
      <Tooltip>
        <TooltipTrigger
          render={
            <Badge variant="outline" className="h-5 shrink-0 gap-1 text-[10px]">
              <TopologyIcon className="size-3" />
              {placementTopologyLabel(placement.topology)}
            </Badge>
          }
        />
        <TooltipContent side="left" sideOffset={6} className="max-w-64">
          {placementTopologyDescription(placement.topology)}
        </TooltipContent>
      </Tooltip>
      <Tooltip>
        <TooltipTrigger
          render={
            <Button
              type="button"
              variant="ghost"
              size="icon-sm"
              className="shrink-0"
              onClick={() => void revealPlacement(placement)}
              aria-label={translate('auto.components.skills.SkillsPage.dc4c3328ee', 'Reveal file')}
            >
              <FolderOpen className="size-4" />
            </Button>
          }
        />
        <TooltipContent side="left" sideOffset={6}>
          {translate('auto.components.skills.SkillsPage.dc4c3328ee', 'Reveal file')}
        </TooltipContent>
      </Tooltip>
    </li>
  )
}

/** Every directory holding this skill, and how each one holds it. */
export function SkillPlacementTable({ placements }: SkillPlacementTableProps): React.JSX.Element {
  return (
    // Why: the cap sits on the viewport — with only a max-height, the root has no
    // definite height for the viewport's h-full to resolve against, so a skill
    // installed in a dozen homes would overflow instead of scrolling.
    <ScrollArea viewportClassName="max-h-80">
      <ul className="py-1">
        {placements.map((placement) => (
          <SkillPlacementRow key={placement.id} placement={placement} />
        ))}
      </ul>
    </ScrollArea>
  )
}
