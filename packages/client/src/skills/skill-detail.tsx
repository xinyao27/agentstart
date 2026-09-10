import type {
  DiscoveredSkill,
  SkillDirectoryEntry,
  SkillDirectoryListing
} from '@agentstart/protocol'
import { useEffect, useState } from 'react'
import { toast } from 'sonner'
import { translate } from '~renderer/i18n/i18n'
import { FolderOpen, ArrowClockwise as RefreshCw, Trash } from '~renderer/icons/hugeicons'
import { shellClient } from '~renderer/runtime/shell-client'
import { listSkillManageFiles } from '~renderer/runtime/skill-manage-client'
import { skillDirectoryName, skillPlacements } from '~renderer/skills/installation'
import { Badge } from '~renderer/ui/badge'
import { Button } from '~renderer/ui/button'
import { ScrollArea } from '~renderer/ui/scroll-area'
import { Tooltip, TooltipContent, TooltipTrigger } from '~renderer/ui/tooltip'

import { SkillDetailToolbar } from './detail-toolbar'
import { SKILL_FILE_NAME } from './file-tree-model'
import { providerLabels, sourceLabels } from './labels'
import { SkillFileView } from './skill-file-view'
import { startSkillUpdateRun } from './skill-update-run-store'

export type SkillDetailProps = {
  skill: DiscoveredSkill
  /** The freshness scan cleared this skill for the validated update rail. */
  updatable: boolean
  /** A manage run already owns the CLI; a second one would be refused anyway. */
  busy: boolean
  onRemove: (skill: DiscoveredSkill) => void
}

const EMPTY_FILES: SkillDirectoryEntry[] = []
type SkillListingState = {
  directoryPath: string
  listing: SkillDirectoryListing
}

function SkillDetailActions({
  skill,
  updatable,
  busy,
  onRemove
}: SkillDetailProps): React.JSX.Element {
  const revealSkill = async (): Promise<void> => {
    const result = await shellClient.shell.openInFileManager(skill.skillFilePath)
    if (!result.ok) {
      toast.error(
        translate('auto.components.skills.SkillsPage.995fde8337', 'Could not reveal skill file')
      )
    }
  }

  // Why: `skills remove` only reaches the global skill home. Bundled, plugin,
  // and repo-scoped copies are owned by something else and must stay read-only.
  const removable = skill.installed && skill.sourceKind === 'home'

  return (
    <div className="flex shrink-0 items-center gap-1">
      {updatable ? (
        <Tooltip>
          <TooltipTrigger
            render={
              <Button
                type="button"
                variant="ghost"
                size="icon-sm"
                disabled={busy}
                onClick={() => void startSkillUpdateRun([skillDirectoryName(skill)])}
                aria-label={translate('auto.components.skills.SkillDetail.update', 'Update skill')}
              >
                <RefreshCw className="size-4" />
              </Button>
            }
          />
          <TooltipContent side="bottom" sideOffset={6}>
            {translate('auto.components.skills.SkillDetail.update', 'Update skill')}
          </TooltipContent>
        </Tooltip>
      ) : null}
      {removable ? (
        <Tooltip>
          <TooltipTrigger
            render={
              <Button
                type="button"
                variant="ghost"
                size="icon-sm"
                disabled={busy}
                onClick={() => onRemove(skill)}
                aria-label={translate('auto.components.skills.SkillDetail.remove', 'Remove skill')}
              >
                <Trash className="size-4" />
              </Button>
            }
          />
          <TooltipContent side="bottom" sideOffset={6}>
            {translate('auto.components.skills.SkillDetail.remove', 'Remove skill')}
          </TooltipContent>
        </Tooltip>
      ) : null}
      <Tooltip>
        <TooltipTrigger
          render={
            <Button
              type="button"
              variant="ghost"
              size="icon-sm"
              onClick={() => void revealSkill()}
              aria-label={translate('auto.components.skills.SkillsPage.dc4c3328ee', 'Reveal file')}
            >
              <FolderOpen className="size-4" />
            </Button>
          }
        />
        <TooltipContent side="bottom" sideOffset={6}>
          {translate('auto.components.skills.SkillsPage.dc4c3328ee', 'Reveal file')}
        </TooltipContent>
      </Tooltip>
    </div>
  )
}

export function SkillDetail(props: SkillDetailProps): React.JSX.Element {
  const { skill } = props
  const [listingState, setListingState] = useState<SkillListingState | null>(null)
  const [selectedRelativePath, setSelectedRelativePath] = useState(SKILL_FILE_NAME)
  const directoryPath = skill.directoryPath
  const placements = skillPlacements(skill)
  const listing = listingState?.directoryPath === directoryPath ? listingState.listing : null

  useEffect(() => {
    let cancelled = false
    listSkillManageFiles(directoryPath)
      .then((result) => {
        if (!cancelled) {
          setListingState({ directoryPath, listing: result })
        }
      })
      .catch(() => {
        if (!cancelled) {
          setListingState({
            directoryPath,
            listing: { ok: false, reason: 'unreadable' }
          })
        }
      })
    return () => {
      cancelled = true
    }
  }, [directoryPath])

  const files = listing?.ok ? listing.files : EMPTY_FILES

  return (
    <div className="flex min-h-0 min-w-0 flex-1 flex-col">
      {/* Why: the skill's own text is what this pane exists to show, so the
          chrome above it stays at two rows — identity, then one toolbar whose
          pickers hold the file tree and the install locations. */}
      <header className="border-border flex min-w-0 shrink-0 items-center gap-3 border-b px-5 py-2">
        <div className="flex min-w-0 flex-1 flex-wrap items-center gap-2">
          <h2 className="min-w-0 truncate text-sm font-semibold">{skill.name}</h2>
          <Badge variant={skill.installed ? 'secondary' : 'outline'} className="h-5 text-[10px]">
            {skill.installed
              ? translate('auto.components.skills.SkillsPage.0c74e7ff34', 'Local')
              : translate('auto.components.skills.SkillsPage.35b9a724a0', 'Available')}
          </Badge>
          <Badge variant="outline" className="h-5 text-[10px]">
            {sourceLabels[skill.sourceKind]}
          </Badge>
          {skill.providers.map((provider) => (
            <Badge key={provider} variant="outline" className="h-5 text-[10px]">
              {providerLabels[provider]}
            </Badge>
          ))}
        </div>
        <SkillDetailActions {...props} />
      </header>

      <SkillDetailToolbar
        placements={placements}
        files={files}
        listing={listing}
        selectedRelativePath={selectedRelativePath}
        onSelectFile={setSelectedRelativePath}
        sourceLabel={skill.sourceLabel}
        updatedAt={skill.updatedAt}
      />

      <ScrollArea className="min-h-0 flex-1">
        <div className="px-5 py-4">
          <SkillFileView directoryPath={directoryPath} relativePath={selectedRelativePath} />
        </div>
      </ScrollArea>
    </div>
  )
}
