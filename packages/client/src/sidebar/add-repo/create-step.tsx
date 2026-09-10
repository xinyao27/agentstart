// Step for AddRepoDialog (agentstart#763), split out so create-project state stays scoped.
import React, { useState } from 'react'
import { translate } from '~renderer/i18n/i18n'
import { GitMerge, CaretDown as ChevronDown } from '~renderer/icons/hugeicons'
import { LoadingIndicator } from '~renderer/loading/indicator'
import { Button } from '~renderer/ui/button'
import { cn } from '~renderer/ui/class-names'
import { DialogHeader, DialogTitle, DialogDescription } from '~renderer/ui/dialog'
import { Input } from '~renderer/ui/input'

import {
  formatCreateProjectParentSummary,
  joinCreateProjectPath,
  type GitAvailability
} from '../create-project-defaults'
import {
  CreateProjectLocationField,
  CreateProjectParentBrowser
} from '../create-project-location-field'

// ── UI helpers ───────────────────────────────────────────────────────

const CREATE_PROJECT_NAME_PLACEHOLDER = 'project-name'

type CreateStepProps = {
  createName: string
  createParent: string
  createError: string | null
  isCreating: boolean
  defaultParent?: string
  gitAvailability?: GitAvailability
  runtimeParentStatus?: 'idle' | 'checking' | 'failed'
  parentDefaultPending?: boolean
  manualParentEntry?: boolean
  runtimeEnvironmentId?: string | null
  onNameChange: (value: string) => void
  onParentChange: (value: string) => void
  onPickParent: () => void
  onCreate: () => void
}

export function CreateStep({
  createName,
  createParent,
  createError,
  isCreating,
  defaultParent = '',
  gitAvailability = 'unknown',
  runtimeParentStatus = 'idle',
  parentDefaultPending = false,
  manualParentEntry = false,
  runtimeEnvironmentId,
  onNameChange,
  onParentChange,
  onPickParent,
  onCreate
}: CreateStepProps): React.JSX.Element {
  const [browsingParent, setBrowsingParent] = useState(false)
  // Why: runtime hosts need a typed remote path; hiding that field behind the
  // collapsed defaults makes the create flow look impossible.
  const [advancedOpen, setAdvancedOpen] = useState(manualParentEntry)

  // Why: runtime hosts report "unknown"; only a confirmed Git miss should block
  // Git-only creation.
  const canSubmit =
    createName.trim().length > 0 &&
    createParent.trim().length > 0 &&
    gitAvailability !== 'checking' &&
    gitAvailability !== 'unavailable' &&
    !parentDefaultPending &&
    !isCreating
  const missingLocationLabel = translate(
    'auto.components.sidebar.AddRepoCreateStep.3a13f6e88b',
    'location not selected'
  )
  const missingServerLocationLabel = translate(
    'auto.components.sidebar.AddRepoCreateStep.6ed14c0281',
    'host folder not selected'
  )
  const isRemoteHost = Boolean(runtimeEnvironmentId)

  const summaryParent = (() =>
    formatCreateProjectParentSummary({
      parent: createParent,
      defaultParent,
      runtimeEnvironmentId,
      isRemoteHost,
      missingLocationLabel,
      missingServerLocationLabel
    }))()
  const targetPathPreview = (() => {
    const name = createName.trim() || CREATE_PROJECT_NAME_PLACEHOLDER
    return createParent.trim() ? joinCreateProjectPath(createParent, name) : ''
  })()
  const kindLabel = translate(
    'auto.components.sidebar.AddRepoCreateStep.11fd2a7db8',
    'Git repository'
  )
  const showGitFallback = gitAvailability === 'unavailable'
  const showGitChecking = gitAvailability === 'checking'
  const showRuntimeMissingParent =
    runtimeEnvironmentId && !createParent.trim() && runtimeParentStatus !== 'checking'

  if (browsingParent && runtimeEnvironmentId) {
    return (
      <CreateProjectParentBrowser
        runtimeEnvironmentId={runtimeEnvironmentId}
        createParent={createParent}
        onParentChange={onParentChange}
        onClose={() => setBrowsingParent(false)}
      />
    )
  }

  return (
    <>
      <DialogHeader>
        <DialogTitle>
          {translate(
            'auto.components.sidebar.AddRepoCreateStep.c7b9f94456',
            'Create a new project'
          )}
        </DialogTitle>
        <DialogDescription>
          {translate(
            'auto.components.sidebar.AddRepoCreateStep.b100311784',
            'Name it and AgentStart will create a real project with sensible defaults.'
          )}
        </DialogDescription>
      </DialogHeader>

      {/* Why: DialogContent is a CSS grid; grid items default to min-width:auto
        (= content size), so a long path inside the Location row would blow out
        the dialog width even with flex + truncate on the row itself. min-w-0
        here caps the grid track at the dialog's max-width. */}
      <div className="min-w-0 space-y-3.5 pt-1">
        {/* Name. Monospaced because it ends up as a directory name. */}
        <div className="space-y-1">
          <label
            htmlFor="create-project-name"
            className="text-muted-foreground block text-[11px] font-medium"
          >
            {translate('auto.components.sidebar.AddRepoCreateStep.a8149a3a5a', 'Name')}
          </label>
          <Input
            id="create-project-name"
            value={createName}
            onChange={(e) => onNameChange(e.target.value)}
            placeholder={translate(
              'auto.components.sidebar.AddRepoCreateStep.0ae45b8238',
              'my-project'
            )}
            className="h-11 font-mono text-sm"
            disabled={isCreating}
            autoFocus
            autoComplete="off"
            spellCheck={false}
          />
        </div>

        {/* Summary card doubles as the disclosure for the uncommon settings, so the
          defaults and the controls to change them live in one place. */}
        <div className="border-border bg-muted/30 min-w-0 rounded-md border">
          <Button
            variant="ghost"
            size="default"
            type="button"
            onClick={() => setAdvancedOpen((open) => !open)}
            aria-expanded={advancedOpen}
            className="hover:bg-accent/50 flex h-auto w-full min-w-0 items-start justify-start gap-2.5 border-0 px-3 py-2.5 text-left font-normal whitespace-normal transition-colors"
          >
            <span className="border-border bg-background/60 text-muted-foreground mt-0.5 inline-flex size-6 shrink-0 items-center justify-center rounded-md border">
              <GitMerge className="size-3.5" />
            </span>
            <div className="min-w-0 flex-1">
              <p className="truncate text-sm font-medium">
                {translate(
                  'auto.components.sidebar.AddRepoCreateStep.685b5eefe1',
                  '{{kind}} in {{parent}}',
                  {
                    kind: kindLabel,
                    parent: summaryParent
                  }
                )}
              </p>
              {showGitChecking ? (
                <p className="text-muted-foreground mt-0.5 flex items-center gap-1.5 text-[11px]">
                  <LoadingIndicator className="size-3" />
                  {translate(
                    'auto.components.sidebar.AddRepoCreateStep.2a762f3b19',
                    'Checking Git on this host...'
                  )}
                </p>
              ) : showGitFallback ? (
                <p className="text-destructive mt-0.5 text-[11px]">
                  {translate(
                    'auto.components.sidebar.AddRepoCreateStep.fe1e616c5b',
                    'Git is required to create a project.'
                  )}
                </p>
              ) : showRuntimeMissingParent ? (
                <p className="text-muted-foreground mt-0.5 text-[11px]">
                  {translate(
                    'auto.components.sidebar.AddRepoCreateStep.c234df77f7',
                    'Choose or enter a host parent folder before creating.'
                  )}
                </p>
              ) : targetPathPreview ? (
                <p
                  className="text-muted-foreground mt-0.5 truncate font-mono text-[11px]"
                  title={targetPathPreview}
                >
                  {targetPathPreview}
                </p>
              ) : null}
            </div>
            <ChevronDown
              className={cn(
                'size-4 shrink-0 self-center text-muted-foreground transition-transform',
                advancedOpen && 'rotate-180'
              )}
            />
          </Button>

          {advancedOpen && (
            <div className="border-border space-y-3 border-t px-3 py-3">
              {/* The local picker returns client paths; runtime hosts browse host paths via RPC. */}
              <CreateProjectLocationField
                createParent={createParent}
                isCreating={isCreating}
                manualParentEntry={manualParentEntry}
                runtimeEnvironmentId={runtimeEnvironmentId}
                onParentChange={onParentChange}
                onPickParent={onPickParent}
                onBrowseServer={() => setBrowsingParent(true)}
              />

              {targetPathPreview && (
                <p className="border-border bg-background/40 text-muted-foreground min-w-0 rounded-md border px-2.5 py-2 font-mono text-[11px] break-all">
                  {targetPathPreview}
                </p>
              )}
            </div>
          )}
        </div>

        {createError && (
          <p className="text-destructive text-[11px]" role="alert">
            {createError}
          </p>
        )}

        <Button onClick={onCreate} disabled={!canSubmit} size="lg" className="w-full">
          {isCreating
            ? translate('auto.components.sidebar.AddRepoCreateStep.85085d74d2', 'Creating…')
            : translate('auto.components.sidebar.AddRepoCreateStep.45b7c26034', 'Create project')}
        </Button>
      </div>
    </>
  )
}
