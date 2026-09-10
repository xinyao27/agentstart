import { translate } from '~renderer/i18n/i18n'
import { useProjectCatalog } from '~renderer/project-catalog/provider'
import { useAppStore } from '~renderer/store/state'
import { Button } from '~renderer/ui/button'
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle
} from '~renderer/ui/dialog'

const RemoveFolderDialog = function RemoveFolderDialog() {
  const activeModal = useAppStore((s) => s.activeModal)
  const modalData = useAppStore((s) => s.modalData)
  const closeModal = useAppStore((s) => s.closeModal)
  const removeProject = useAppStore((s) => s.removeProject)
  const { repos } = useProjectCatalog()

  const isOpen = activeModal === 'confirm-remove-folder'
  const repoId = typeof modalData.repoId === 'string' ? modalData.repoId : ''
  const displayName = typeof modalData.displayName === 'string' ? modalData.displayName : ''

  // Why: for an SSH project the files live on the remote host's disk, not the
  // user's — "still on your disk" would be misleading. Name the host (using the
  // removed-target label when it's a ghost) so the user knows where it remains
  // and that re-adding that host recovers it.
  const sshTargetLabels = useAppStore((s) => s.sshTargetLabels)
  const removedSshTargetLabels = useAppStore((s) => s.removedSshTargetLabels)
  const sshHostLabel = (() => {
    const connectionId = repos.find((repo) => repo.id === repoId)?.connectionId?.trim()
    if (!connectionId) {
      return null
    }
    return (
      sshTargetLabels.get(connectionId) ?? removedSshTargetLabels.get(connectionId) ?? connectionId
    )
  })()

  const handleConfirm = () => {
    if (repoId) {
      void removeProject(repoId)
    }
    closeModal()
  }

  const handleOpenChange = (open: boolean) => {
    if (!open) {
      closeModal()
    }
  }

  return (
    <Dialog open={isOpen} onOpenChange={handleOpenChange}>
      <DialogContent className="max-w-sm sm:max-w-sm" showCloseButton={false}>
        <DialogHeader>
          <DialogTitle className="text-sm">
            {translate('auto.components.sidebar.RemoveFolderDialog.b79b39d865', 'Remove Project')}
          </DialogTitle>
          <DialogDescription className="text-xs">
            {translate(
              'auto.components.sidebar.RemoveFolderDialog.e62415c3d0',
              'This only removes'
            )}{' '}
            <span className="text-foreground font-medium break-all">{displayName}</span>{' '}
            {sshHostLabel
              ? translate(
                  'auto.components.sidebar.RemoveFolderDialog.fromAgentStartSsh',
                  'from AgentStart. Its files stay on {{value0}} — re-add that SSH host to recover it.',
                  { value0: sshHostLabel }
                )
              : translate(
                  'auto.components.sidebar.RemoveFolderDialog.8c097ef04e',
                  'from AgentStart. It is still on your disk.'
                )}
          </DialogDescription>
        </DialogHeader>
        <DialogFooter>
          <Button variant="outline" onClick={() => handleOpenChange(false)}>
            {translate('auto.components.sidebar.RemoveFolderDialog.d36883e046', 'Cancel')}
          </Button>
          <Button variant="destructive" onClick={handleConfirm}>
            {translate('auto.components.sidebar.RemoveFolderDialog.4dc5b5065b', 'Remove')}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  )
}

export default RemoveFolderDialog
