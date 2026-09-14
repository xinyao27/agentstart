import { translate } from '~renderer/i18n/i18n'
import { Button } from '~renderer/ui/button'
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle
} from '~renderer/ui/dialog'

import type { SmartWorkspaceRepo } from './github-repo-match'
import type { CrossRepoPrompt } from './smart-workspace-github-search'

type CrossRepoPromptDialogProps = {
  allowProjectAdd: boolean
  onAccept: (repo: SmartWorkspaceRepo) => void
  onAdd: () => void
  onDismiss: () => void
  onKeep: () => void
  prompt: CrossRepoPrompt | null
  selectedRepo: SmartWorkspaceRepo | null
  switchTarget: 'project' | 'project-source'
}

export function CrossRepoPromptDialog({
  allowProjectAdd,
  onAccept,
  onAdd,
  onDismiss,
  onKeep,
  prompt,
  selectedRepo,
  switchTarget
}: CrossRepoPromptDialogProps): React.JSX.Element {
  const isProjectSource = switchTarget === 'project-source'
  const title = isProjectSource
    ? translate(
        'auto.components.new.workspace.SmartWorkspaceNameField.switchProjectSourceTitle',
        'Switch project source?'
      )
    : translate(
        'auto.components.new.workspace.SmartWorkspaceNameField.4bd98f1091',
        'Switch project?'
      )
  const descriptionSuffix = isProjectSource
    ? translate(
        'auto.components.new.workspace.SmartWorkspaceNameField.differentProjectSource',
        ', which is different from the selected project source.'
      )
    : translate(
        'auto.components.new.workspace.SmartWorkspaceNameField.9ef1a7c4b0',
        ', which is different from the selected project.'
      )
  const fallbackLabel = isProjectSource
    ? translate(
        'auto.components.new.workspace.SmartWorkspaceNameField.currentProjectSource',
        'current project source'
      )
    : translate(
        'auto.components.new.workspace.SmartWorkspaceNameField.fda67f0b61',
        'current project'
      )

  return (
    <Dialog open={prompt !== null} onOpenChange={(next) => !next && onDismiss()}>
      <DialogContent className="sm:max-w-md">
        <DialogHeader>
          <DialogTitle>{title}</DialogTitle>
          <DialogDescription>
            {translate(
              'auto.components.new.workspace.SmartWorkspaceNameField.ad188067ae',
              'The GitHub URL points to'
            )}{' '}
            {prompt?.link.slug.owner}/{prompt?.link.slug.repo}
            {descriptionSuffix}
          </DialogDescription>
        </DialogHeader>
        <DialogFooter>
          <Button variant="outline" onClick={onDismiss}>
            {translate(
              'auto.components.new.workspace.SmartWorkspaceNameField.6859e2896c',
              'Cancel'
            )}
          </Button>
          <Button variant="outline" onClick={onKeep}>
            {translate('auto.components.new.workspace.SmartWorkspaceNameField.eadf877af5', 'Keep')}{' '}
            {selectedRepo?.displayName ?? fallbackLabel}
          </Button>
          {prompt?.matchingRepo ? (
            <Button onClick={() => onAccept(prompt.matchingRepo!)}>
              {translate(
                'auto.components.new.workspace.SmartWorkspaceNameField.a76fcb4fa0',
                'Switch to'
              )}{' '}
              {prompt.matchingRepo.displayName}
            </Button>
          ) : allowProjectAdd ? (
            <Button onClick={onAdd}>
              {translate(
                'auto.components.new.workspace.SmartWorkspaceNameField.e57c53727c',
                'Add project...'
              )}
            </Button>
          ) : null}
        </DialogFooter>
      </DialogContent>
    </Dialog>
  )
}
