import React, { useRef, useState } from 'react'
import { translate } from '~renderer/i18n/i18n'
import {
  getScreenSubmitShortcutLabel,
  isScreenSubmitShortcut
} from '~renderer/keyboard-input/screen-submit-shortcut'
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
import { Input } from '~renderer/ui/input'
import { Textarea } from '~renderer/ui/textarea'

import {
  buildWorktreeMetaUpdates,
  parseGitHubWorkItemNumberForMetaField,
  type WorktreeMetaSavedPayload
} from './worktree-meta-updates'

const WorktreeMetaDialog = function WorktreeMetaDialog() {
  const activeModal = useAppStore((s) => s.activeModal)
  const modalData = useAppStore((s) => s.modalData)
  const closeModal = useAppStore((s) => s.closeModal)
  const updateWorktreeMeta = useAppStore((s) => s.updateWorktreeMeta)
  const submitShortcutLabel = getScreenSubmitShortcutLabel()

  const isEditMeta = activeModal === 'edit-meta'
  const isOpen = isEditMeta

  const worktreeId = typeof modalData.worktreeId === 'string' ? modalData.worktreeId : ''
  const currentDisplayName =
    typeof modalData.currentDisplayName === 'string' ? modalData.currentDisplayName : ''
  const currentPR = typeof modalData.currentPR === 'number' ? String(modalData.currentPR) : ''
  const currentComment =
    typeof modalData.currentComment === 'string' ? modalData.currentComment : ''
  const focusField = typeof modalData.focus === 'string' ? modalData.focus : 'comment'
  const afterSave =
    typeof modalData.afterSave === 'function'
      ? (modalData.afterSave as (payload: WorktreeMetaSavedPayload) => void | Promise<void>)
      : null

  const [displayNameInput, setDisplayNameInput] = useState('')
  const [prInput, setPrInput] = useState('')
  const [commentInput, setCommentInput] = useState('')
  const [saving, setSaving] = useState(false)
  const prInputRef = useRef<HTMLInputElement>(null)
  const textareaRef = useRef<HTMLTextAreaElement>(null)
  const [wasOpen, setWasOpen] = useState(false)
  const displayNameInputRef = useRef<HTMLInputElement>(null)
  const mountedRef = useMountedRef()
  if (isOpen && !wasOpen) {
    setWasOpen(true)
    setDisplayNameInput(currentDisplayName)
    setPrInput(currentPR)
    setCommentInput(currentComment)
  } else if (!isOpen && wasOpen) {
    setWasOpen(false)
  }

  const handleCommentChange = (event: React.ChangeEvent<HTMLTextAreaElement>) => {
    setCommentInput(event.target.value)
  }

  const canSave = (() => {
    if (!worktreeId) {
      return false
    }
    const trimmedPR = prInput.trim()
    return trimmedPR === '' || parseGitHubWorkItemNumberForMetaField(trimmedPR, 'pr') !== null
  })()

  const handleOpenChange = (open: boolean) => {
    if (!open) {
      closeModal()
    }
  }

  const handleSave = async () => {
    if (!canSave) {
      return
    }
    setSaving(true)
    try {
      const updates = buildWorktreeMetaUpdates({
        displayNameInput,
        currentDisplayName,
        prInput,
        commentInput
      })

      await updateWorktreeMeta(worktreeId, updates)
      closeModal()
      // Why: follow-up refreshes should not turn a successful metadata save
      // into a failed dialog.
      try {
        void Promise.resolve(afterSave?.({ worktreeId, updates })).catch(console.error)
      } catch (error) {
        console.error(error)
      }
    } finally {
      if (mountedRef.current) {
        setSaving(false)
      }
    }
  }

  const handleCommentKeyDown = (e: React.KeyboardEvent<HTMLTextAreaElement>) => {
    const isPlainEnter = e.key === 'Enter' && !e.shiftKey && !e.altKey && !e.metaKey && !e.ctrlKey
    if (isPlainEnter || isScreenSubmitShortcut(e)) {
      e.preventDefault()
      e.stopPropagation()
      handleSave()
    }
  }

  const handleInputKeyDown = (e: React.KeyboardEvent<HTMLInputElement>) => {
    if (e.key === 'Enter') {
      e.preventDefault()
      handleSave()
    }
  }

  return (
    <Dialog open={isOpen} onOpenChange={handleOpenChange}>
      <DialogContent
        className="max-w-md"
        initialFocus={() => {
          if (focusField === 'displayName') {
            return displayNameInputRef.current
          }
          if (focusField === 'pr') {
            return prInputRef.current
          }
          return textareaRef.current
        }}
      >
        <DialogHeader>
          <DialogTitle className="text-sm">
            {translate(
              'auto.components.sidebar.WorktreeMetaDialog.382fd11a3e',
              'Edit Worktree Details'
            )}
          </DialogTitle>
          <DialogDescription className="text-xs">
            {translate(
              'auto.components.sidebar.WorktreeMetaDialog.65770ad0f0',
              'Edit the GitHub pull request link and notes for this workspace.'
            )}
          </DialogDescription>
        </DialogHeader>

        <div className="space-y-4">
          <div className="space-y-1">
            <label className="text-muted-foreground text-[11px] font-medium">
              {translate('auto.components.sidebar.WorktreeMetaDialog.ad5e4e514f', 'Display Name')}
            </label>
            <Input
              ref={displayNameInputRef}
              value={displayNameInput}
              onChange={(e) => setDisplayNameInput(e.target.value)}
              onKeyDown={handleInputKeyDown}
              placeholder={translate(
                'auto.components.sidebar.WorktreeMetaDialog.7f21e0464f',
                'Custom display name...'
              )}
              className="h-8 text-xs"
            />
            <p className="text-muted-foreground text-[10px]">
              {translate(
                'auto.components.sidebar.WorktreeMetaDialog.459ad7f650',
                'Only changes the name shown in the sidebar — the folder on disk stays the same. Leave blank to use the branch or folder name.'
              )}
            </p>
          </div>

          <div className="space-y-1">
            <label className="text-muted-foreground text-[11px] font-medium">
              {translate('auto.components.sidebar.WorktreeMetaDialog.1b91db7e14', 'GH PR')}
            </label>
            <Input
              ref={prInputRef}
              value={prInput}
              onChange={(e) => setPrInput(e.target.value)}
              onKeyDown={handleInputKeyDown}
              placeholder={translate(
                'auto.components.sidebar.WorktreeMetaDialog.077a4f7b5c',
                'PR # or GitHub URL'
              )}
              className="h-8 text-xs"
            />
            <p className="text-muted-foreground text-[10px]">
              {translate(
                'auto.components.sidebar.WorktreeMetaDialog.5ae06f40fd',
                'Paste a pull request URL, or enter a number. Leave blank to remove the link.'
              )}
            </p>
          </div>

          <div className="space-y-1">
            <label className="text-muted-foreground text-[11px] font-medium">
              {translate('auto.components.sidebar.WorktreeMetaDialog.9c1d1e9b71', 'Comment')}
            </label>
            <Textarea
              ref={textareaRef}
              value={commentInput}
              onChange={handleCommentChange}
              onKeyDown={handleCommentKeyDown}
              placeholder={translate(
                'auto.components.sidebar.WorktreeMetaDialog.030d484fc0',
                'Notes about this worktree...'
              )}
              rows={3}
              className="border-input placeholder:text-muted-foreground focus-visible:border-ring scrollbar-sleek [field-sizing:content] max-h-60 w-full min-w-0 resize-none overflow-y-auto rounded-md border bg-transparent px-3 py-2 text-xs transition-[color] outline-none"
            />
            <p className="text-muted-foreground text-[10px]">
              {translate(
                'auto.components.sidebar.WorktreeMetaDialog.7f0be5e9a6',
                'Supports **markdown** — bold, lists, `code`, links. Press Enter or'
              )}{' '}
              {submitShortcutLabel}{' '}
              {translate(
                'auto.components.sidebar.WorktreeMetaDialog.b48c271d39',
                'to save, Shift+Enter for a new line.'
              )}
            </p>
          </div>
        </div>

        <DialogFooter>
          <Button
            variant="outline"
            size="sm"
            onClick={() => handleOpenChange(false)}
            className="text-xs"
          >
            {translate('auto.components.sidebar.WorktreeMetaDialog.3db0a2a593', 'Cancel')}
          </Button>
          <Button size="sm" onClick={handleSave} disabled={!canSave || saving} className="text-xs">
            {saving
              ? translate('auto.components.sidebar.WorktreeMetaDialog.61d6f612cf', 'Saving...')
              : translate('auto.components.sidebar.WorktreeMetaDialog.2174f17011', 'Save')}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  )
}

export default WorktreeMetaDialog
