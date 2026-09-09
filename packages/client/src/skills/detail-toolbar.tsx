import type { SkillDirectoryEntry, SkillDirectoryListing, SkillPlacement } from '@yiru/protocol'
import { createElement, useState } from 'react'
import { getFileTypeIcon } from '~renderer/file-presentation/icons'
import { translate } from '~renderer/i18n/i18n'
import type { IconProps } from '~renderer/icons/hugeicons'
import { CaretDown, FolderSimple, Warning } from '~renderer/icons/hugeicons'
import { Button } from '~renderer/ui/button'
import { Popover, PopoverContent, PopoverTrigger } from '~renderer/ui/popover'

import { SkillFileTree } from './file-tree'
import { formatUpdatedAt } from './labels'
import { SkillPlacementTable } from './placement-table'

export type SkillDetailToolbarProps = {
  placements: readonly SkillPlacement[]
  files: readonly SkillDirectoryEntry[]
  listing: SkillDirectoryListing | null
  selectedRelativePath: string
  onSelectFile: (relativePath: string) => void
  sourceLabel: string
  updatedAt: number | null
}

/** Forms that mean an agent cannot actually load, or update, the skill here. */
function hasUnreachablePlacement(placements: readonly SkillPlacement[]): boolean {
  return placements.some(
    (placement) => placement.topology === 'broken-link' || placement.topology === 'read-only'
  )
}

function FilePicker({
  files,
  listing,
  selectedRelativePath,
  onSelectFile
}: Pick<
  SkillDetailToolbarProps,
  'files' | 'listing' | 'selectedRelativePath' | 'onSelectFile'
>): React.JSX.Element {
  const [open, setOpen] = useState(false)
  const fileName = selectedRelativePath.split('/').at(-1) ?? selectedRelativePath
  return (
    <Popover open={open} onOpenChange={setOpen}>
      <PopoverTrigger
        render={
          <Button type="button" variant="ghost" size="xs" className="max-w-64 min-w-0">
            <FileTypeIcon path={selectedRelativePath} className="text-muted-foreground shrink-0" />
            <span className="truncate font-mono">{fileName}</span>
            <CaretDown className="text-muted-foreground shrink-0" />
          </Button>
        }
      />
      <PopoverContent align="start" className="w-80 p-0">
        {listing && !listing.ok ? (
          <p className="text-muted-foreground px-3 py-2 text-xs">
            {translate(
              'auto.components.skills.SkillDetail.listingFailed',
              'Could not list the files in this skill.'
            )}
          </p>
        ) : (
          <SkillFileTree
            files={files}
            selectedRelativePath={selectedRelativePath}
            onSelect={(relativePath) => {
              onSelectFile(relativePath)
              setOpen(false)
            }}
          />
        )}
        {listing?.ok === true && listing.truncated ? (
          <p className="text-muted-foreground border-border border-t px-3 py-1.5 text-[11px]">
            {translate(
              'auto.components.skills.SkillDetail.listingTruncated',
              'Only the first files in this skill are listed.'
            )}
          </p>
        ) : null}
      </PopoverContent>
    </Popover>
  )
}

function FileTypeIcon({ path, ...props }: IconProps & { path: string }): React.JSX.Element {
  return createElement(getFileTypeIcon(path), props)
}

function PlacementPicker({ placements }: { placements: readonly SkillPlacement[] }) {
  const unreachable = hasUnreachablePlacement(placements)
  return (
    <Popover>
      <PopoverTrigger
        render={
          <Button type="button" variant="ghost" size="xs" className="min-w-0">
            {unreachable ? (
              <Warning className="text-destructive shrink-0" />
            ) : (
              <FolderSimple className="text-muted-foreground shrink-0" />
            )}
            <span className="truncate">
              {translate(
                'auto.components.skills.SkillDetailToolbar.placementCount',
                '{{value0}} directories',
                { value0: placements.length }
              )}
            </span>
            <CaretDown className="text-muted-foreground shrink-0" />
          </Button>
        }
      />
      <PopoverContent
        align="start"
        // Why: placement rows carry absolute paths, so the surface is as wide as
        // the window allows before it starts truncating what the user came for.
        className="w-[min(40rem,calc(100vw-2rem))] p-0"
      >
        <SkillPlacementTable placements={placements} />
      </PopoverContent>
    </Popover>
  )
}

/**
 * One line standing in for everything the detail pane used to stack above the
 * skill: the file tree and the install locations both fold into it, so the
 * skill's own text owns the rest of the pane.
 */
export function SkillDetailToolbar({
  placements,
  files,
  listing,
  selectedRelativePath,
  onSelectFile,
  sourceLabel,
  updatedAt
}: SkillDetailToolbarProps): React.JSX.Element {
  return (
    <div className="border-border flex shrink-0 items-center gap-1 border-b px-3 py-1">
      <FilePicker
        files={files}
        listing={listing}
        selectedRelativePath={selectedRelativePath}
        onSelectFile={onSelectFile}
      />
      <span className="text-muted-foreground/50 text-[11px]" aria-hidden>
        ·
      </span>
      {/* Why: the count answers "is there more here?" without costing a click,
          which the picker's own label cannot do while it names the open file. */}
      <span className="text-muted-foreground shrink-0 text-[11px]">
        {translate('auto.components.skills.SkillDetailToolbar.fileCount', '{{value0}} files', {
          value0: files.length
        })}
      </span>
      <span className="text-muted-foreground/50 text-[11px]" aria-hidden>
        ·
      </span>
      <PlacementPicker placements={placements} />
      <span className="text-muted-foreground ml-auto shrink-0 truncate pr-2 text-[11px]">
        {sourceLabel} · {formatUpdatedAt(updatedAt)}
      </span>
    </div>
  )
}
