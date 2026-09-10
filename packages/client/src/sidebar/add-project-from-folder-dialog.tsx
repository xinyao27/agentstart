import { isGitRepoKind } from '@agentstart/protocol/project/repository'
import { useRef, useState } from 'react'
import { translate } from '~renderer/i18n/i18n'
import { FolderPlus } from '~renderer/icons/hugeicons'
import { LoadingIndicator } from '~renderer/loading/indicator'
import { useMountedRef } from '~renderer/react/use-mounted-ref'
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

import { useProjectDefaultCheckoutHandoff } from './project-added-default-checkout'

const NON_GIT_REPO_ERROR = 'Not a valid git repository'

const AddProjectFromFolderDialog = function AddProjectFromFolderDialog() {
  const activeModal = useAppStore((s) => s.activeModal)
  const modalData = useAppStore((s) => s.modalData)
  const closeModal = useAppStore((s) => s.closeModal)
  const openModal = useAppStore((s) => s.openModal)
  const addRepoPath = useAppStore((s) => s.addRepoPath)
  const setHideDefaultBranchWorkspace = useAppStore((s) => s.setHideDefaultBranchWorkspace)
  const { finishProjectAddWithDefaultCheckout } = useProjectDefaultCheckoutHandoff()

  const [isAdding, setIsAdding] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const mountedRef = useMountedRef()
  const addGenRef = useRef(0)

  const isOpen = activeModal === 'confirm-add-project-from-folder'
  const folderPath = typeof modalData.folderPath === 'string' ? modalData.folderPath : ''

  const openNonGitConfirmation = () => {
    closeModal()
    openModal('confirm-non-git-folder', { folderPath })
  }

  const handleConfirm = async () => {
    if (!folderPath || isAdding) {
      return
    }
    const gen = ++addGenRef.current
    setIsAdding(true)
    setError(null)
    try {
      const repo = await addRepoPath(folderPath)

      if (!mountedRef.current || gen !== addGenRef.current) {
        return
      }
      if (!repo) {
        return
      }
      if (!isGitRepoKind(repo)) {
        openNonGitConfirmation()
        return
      }
      await finishProjectAddWithDefaultCheckout({
        project: repo,
        source: 'local_folder_picker',
        selectedPath: folderPath,
        closeModal,
        setHideDefaultBranchWorkspace
      })
    } catch (err) {
      const message = err instanceof Error ? err.message : String(err)
      if (message.includes(NON_GIT_REPO_ERROR)) {
        if (mountedRef.current && gen === addGenRef.current) {
          openNonGitConfirmation()
        }
        return
      }
      if (mountedRef.current && gen === addGenRef.current) {
        setError(message)
      }
    } finally {
      if (mountedRef.current && gen === addGenRef.current) {
        setIsAdding(false)
      }
    }
  }

  const handleOpenChange = (open: boolean) => {
    if (!open) {
      addGenRef.current++
      setIsAdding(false)
      setError(null)
      closeModal()
    }
  }

  return (
    <Dialog open={isOpen} onOpenChange={handleOpenChange}>
      <DialogContent className="sm:max-w-lg">
        <DialogHeader>
          <DialogTitle>
            {translate(
              'auto.components.sidebar.AddProjectFromFolderDialog.7d1f51678c',
              'Add Project'
            )}
          </DialogTitle>
          <DialogDescription>
            {translate(
              'auto.components.sidebar.AddProjectFromFolderDialog.046751dbfb',
              'Add this folder as a separate AgentStart project.'
            )}
          </DialogDescription>
        </DialogHeader>

        {folderPath && (
          <div className="border-border/70 bg-muted/35 rounded-md border px-3 py-2 text-xs">
            <div className="text-muted-foreground font-mono break-all">{folderPath}</div>
          </div>
        )}

        {error && <p className="text-destructive text-xs">{error}</p>}

        <DialogFooter>
          <Button variant="outline" onClick={() => handleOpenChange(false)} disabled={isAdding}>
            {translate('auto.components.sidebar.AddProjectFromFolderDialog.7726a16374', 'Cancel')}
          </Button>
          <Button onClick={handleConfirm} disabled={!folderPath || isAdding}>
            {isAdding ? <LoadingIndicator className="size-4" /> : <FolderPlus className="size-4" />}
            {translate(
              'auto.components.sidebar.AddProjectFromFolderDialog.7d1f51678c',
              'Add Project'
            )}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  )
}

export default AddProjectFromFolderDialog
