import React, { useId, useRef, useState } from 'react'
import { translate } from '~renderer/i18n/i18n'
import { Button } from '~renderer/ui/button'
import { Checkbox } from '~renderer/ui/checkbox'
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle
} from '~renderer/ui/dialog'
import { Input } from '~renderer/ui/input'
import { Label } from '~renderer/ui/label'
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '~renderer/ui/select'

import {
  EMPTY_GIT_GRAPH_COMMIT_WRITE_FORM,
  type GitGraphCommitWriteField,
  type GitGraphCommitWriteForm,
  type GitGraphResetMode,
  isGitGraphCommitWriteFormValid
} from './commit-write-action'
import type { GitGraphCommitWriteDialogState } from './use-commit-write-actions'

function CommitWriteToggle({
  checked,
  onCheckedChange,
  label,
  hint
}: {
  checked: boolean
  onCheckedChange: (checked: boolean) => void
  label: string
  hint?: string
}): React.JSX.Element {
  return (
    <Label className="flex cursor-pointer items-start gap-2.5 text-xs font-normal">
      <Checkbox checked={checked} onCheckedChange={(next) => onCheckedChange(next === true)} />
      <span className="flex flex-col gap-0.5">
        <span className="text-foreground">{label}</span>
        {hint ? <span className="text-muted-foreground text-[11px]">{hint}</span> : null}
      </span>
    </Label>
  )
}

const RESET_MODES: GitGraphResetMode[] = ['soft', 'mixed', 'hard']

function resetModeLabel(mode: GitGraphResetMode): string {
  if (mode === 'soft') {
    return translate(
      'auto.components.workspacePanel.git-graph.CommitWriteDialog.resetSoft',
      'Soft — keep the index and working tree'
    )
  }
  if (mode === 'mixed') {
    return translate(
      'auto.components.workspacePanel.git-graph.CommitWriteDialog.resetMixed',
      'Mixed — reset the index, keep the working tree'
    )
  }
  return translate(
    'auto.components.workspacePanel.git-graph.CommitWriteDialog.resetHard',
    'Hard — discard index and working tree changes'
  )
}

// Why: the write actions differ only in which options they collect, so one
// dialog renders the fields its prompt asks for rather than nine near-copies.
export function GitGraphCommitWriteDialog({
  state,
  submitting,
  onClose,
  onSubmit
}: {
  state: GitGraphCommitWriteDialogState
  submitting: boolean
  onClose: () => void
  onSubmit: (form: GitGraphCommitWriteForm) => void
}): React.JSX.Element {
  const nameInputRef = useRef<HTMLInputElement>(null)
  const nameId = useId()
  const annotationId = useId()
  const [form, setForm] = useState<GitGraphCommitWriteForm>(EMPTY_GIT_GRAPH_COMMIT_WRITE_FORM)
  const canSubmit = isGitGraphCommitWriteFormValid(state.prompt, form) && !submitting

  const update = (patch: Partial<GitGraphCommitWriteForm>): void => {
    setForm((current) => ({ ...current, ...patch }))
  }

  const handleSubmit = (event: React.FormEvent<HTMLFormElement>): void => {
    event.preventDefault()
    if (canSubmit) {
      onSubmit(form)
    }
  }

  const renderField = (field: GitGraphCommitWriteField): React.JSX.Element | null => {
    switch (field) {
      case 'name':
        return (
          <div key={field} className="space-y-1">
            <Label htmlFor={nameId} className="text-muted-foreground text-[11px]">
              {state.action === 'add-tag'
                ? translate(
                    'auto.components.workspacePanel.git-graph.CommitWriteDialog.tagName',
                    'Tag name'
                  )
                : translate(
                    'auto.components.workspacePanel.git-graph.CommitWriteDialog.branchName',
                    'Branch name'
                  )}
            </Label>
            <Input
              id={nameId}
              ref={nameInputRef}
              value={form.name}
              onChange={(event) => update({ name: event.target.value })}
              className="h-8 text-xs"
            />
          </div>
        )
      case 'annotation':
        return (
          <div key={field} className="space-y-1">
            <Label htmlFor={annotationId} className="text-muted-foreground text-[11px]">
              {translate(
                'auto.components.workspacePanel.git-graph.CommitWriteDialog.tagMessage',
                'Message (optional — creates an annotated tag)'
              )}
            </Label>
            <Input
              id={annotationId}
              value={form.annotation}
              onChange={(event) => update({ annotation: event.target.value })}
              className="h-8 text-xs"
            />
          </div>
        )
      case 'force':
        return (
          <CommitWriteToggle
            key={field}
            checked={form.force}
            onCheckedChange={(force) => update({ force })}
            label={translate(
              'auto.components.workspacePanel.git-graph.CommitWriteDialog.force',
              'Replace an existing tag with this name'
            )}
          />
        )
      case 'checkout':
        return (
          <CommitWriteToggle
            key={field}
            checked={form.checkout}
            onCheckedChange={(checkout) => update({ checkout })}
            label={translate(
              'auto.components.workspacePanel.git-graph.CommitWriteDialog.checkout',
              'Check out the new branch'
            )}
          />
        )
      case 'no-ff':
        return (
          <CommitWriteToggle
            key={field}
            checked={form.noFf}
            onCheckedChange={(noFf) => update({ noFf })}
            label={translate(
              'auto.components.workspacePanel.git-graph.CommitWriteDialog.noFf',
              'Always create a merge commit'
            )}
          />
        )
      case 'squash':
        return (
          <CommitWriteToggle
            key={field}
            checked={form.squash}
            onCheckedChange={(squash) => update({ squash })}
            label={translate(
              'auto.components.workspacePanel.git-graph.CommitWriteDialog.squash',
              'Squash the merged commits into one'
            )}
            hint={translate(
              'auto.components.workspacePanel.git-graph.CommitWriteDialog.squashHint',
              'Git rejects squash together with a merge commit, so squash wins when both are set.'
            )}
          />
        )
      case 'reset-mode':
        return (
          <div key={field} className="space-y-1">
            <Label className="text-muted-foreground text-[11px]">
              {translate(
                'auto.components.workspacePanel.git-graph.CommitWriteDialog.resetMode',
                'Reset mode'
              )}
            </Label>
            <Select
              value={form.resetMode}
              onValueChange={(value) => update({ resetMode: value as GitGraphResetMode })}
            >
              <SelectTrigger size="sm" className="w-full">
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                {RESET_MODES.map((mode) => (
                  <SelectItem key={mode} value={mode}>
                    {resetModeLabel(mode)}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>
        )
      case 'mainline':
        return (
          <div key={field} className="space-y-1">
            <Label className="text-muted-foreground text-[11px]">
              {translate(
                'auto.components.workspacePanel.git-graph.CommitWriteDialog.mainline',
                'Mainline parent — changes are measured against it'
              )}
            </Label>
            <Select
              value={String(form.mainline)}
              onValueChange={(value) => update({ mainline: Number(value) })}
            >
              <SelectTrigger size="sm" className="w-full">
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                {state.item.parentIds.map((parentId, index) => (
                  <SelectItem key={parentId} value={String(index + 1)}>
                    {`${index + 1}: ${parentId.slice(0, 7)}`}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>
        )
    }
  }

  return (
    <Dialog open onOpenChange={(open) => !open && onClose()}>
      <DialogContent
        className="max-w-sm sm:max-w-sm"
        initialFocus={
          state.prompt.fields.includes('name')
            ? () => {
                nameInputRef.current?.focus()
                // Why: return false so Base UI skips auto-focus; we focus the name input.
                return false
              }
            : undefined
        }
      >
        <DialogHeader>
          <DialogTitle className="text-sm">{state.prompt.title}</DialogTitle>
          <DialogDescription className="text-xs">{state.prompt.description}</DialogDescription>
        </DialogHeader>
        <form className="space-y-4" onSubmit={handleSubmit}>
          <div className="space-y-3">{state.prompt.fields.map(renderField)}</div>
          <DialogFooter>
            <Button type="button" variant="outline" size="sm" className="text-xs" onClick={onClose}>
              {translate(
                'auto.components.workspacePanel.git-graph.CommitWriteDialog.cancel',
                'Cancel'
              )}
            </Button>
            <Button
              type="submit"
              size="sm"
              className="text-xs"
              variant={state.prompt.destructive ? 'destructive' : 'default'}
              disabled={!canSubmit}
            >
              {state.prompt.confirmLabel}
            </Button>
          </DialogFooter>
        </form>
      </DialogContent>
    </Dialog>
  )
}
