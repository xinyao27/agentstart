import React, { useState } from 'react'
import { translate } from '~renderer/i18n/i18n'
import { Folder } from '~renderer/icons/hugeicons'
import { Button } from '~renderer/ui/button'
import { DialogDescription, DialogHeader, DialogTitle } from '~renderer/ui/dialog'
import { Input } from '~renderer/ui/input'

import { RemoteFileBrowser } from '../remote-file-browser'

type CloneStepProps = {
  cloneUrl: string
  cloneDestination: string
  cloneError: string | null
  cloneProgress: { phase: string; percent: number } | null
  isCloning: boolean
  disableDestinationPicker?: boolean
  runtimeEnvironmentId?: string | null
  cloneTargetLabel?: string | null
  onUrlChange: (value: string) => void
  onDestChange: (value: string) => void
  onPickDestination: () => void
  onClone: () => void
}

export function CloneStep({
  cloneUrl,
  cloneDestination,
  cloneError,
  cloneProgress,
  isCloning,
  disableDestinationPicker = false,
  runtimeEnvironmentId,
  cloneTargetLabel,
  onUrlChange,
  onDestChange,
  onPickDestination,
  onClone
}: CloneStepProps): React.JSX.Element {
  const [browsingDestination, setBrowsingDestination] = useState(false)
  const isRemoteClone = Boolean(runtimeEnvironmentId)
  const canBrowseRemoteDestination = isRemoteClone
  const canClone = !!cloneUrl.trim() && !!cloneDestination.trim() && !isCloning
  const handleKeyDown = (e: React.KeyboardEvent<HTMLInputElement>): void => {
    if (e.key === 'Enter' && !e.nativeEvent.isComposing) {
      e.preventDefault()
      if (canClone) {
        onClone()
      }
    }
  }

  if (browsingDestination && runtimeEnvironmentId) {
    return (
      <>
        <DialogHeader>
          <DialogTitle>
            {translate('auto.components.sidebar.AddRepoSteps.a93ef169b5', 'Browse host filesystem')}
          </DialogTitle>
          <DialogDescription>
            {translate(
              'auto.components.sidebar.AddRepoSteps.fe8e629fe3',
              'Navigate to a directory and click Select to choose it.'
            )}
          </DialogDescription>
        </DialogHeader>
        <RemoteFileBrowser
          runtimeEnvironmentId={runtimeEnvironmentId}
          initialPath={cloneDestination || '~'}
          onSelect={(path) => {
            onDestChange(path)
            setBrowsingDestination(false)
          }}
          onCancel={() => setBrowsingDestination(false)}
        />
      </>
    )
  }

  return (
    <>
      <DialogHeader>
        <DialogTitle>
          {translate('auto.components.sidebar.AddRepoSteps.c05f88a31f', 'Clone from URL')}
        </DialogTitle>
        <DialogDescription>
          {cloneTargetLabel
            ? translate(
                'auto.components.sidebar.AddRepoSteps.cloneOnHostDescription',
                'Enter the Git URL and choose where to clone it on {{value0}}.',
                { value0: cloneTargetLabel }
              )
            : translate(
                'auto.components.sidebar.AddRepoSteps.5b2ea674b1',
                'Enter the Git URL and choose where to clone it.'
              )}
        </DialogDescription>
      </DialogHeader>

      <div className="space-y-3 pt-1">
        <div className="space-y-1">
          <label className="text-muted-foreground text-[11px] font-medium">
            {translate('auto.components.sidebar.AddRepoSteps.3d4acbe693', 'Git URL')}
          </label>
          <Input
            value={cloneUrl}
            onChange={(e) => onUrlChange(e.target.value)}
            onKeyDown={handleKeyDown}
            placeholder={translate(
              'auto.components.sidebar.AddRepoSteps.b698a4a29d',
              'https://github.com/user/repo.git'
            )}
            className="h-8 text-xs"
            disabled={isCloning}
            autoFocus
          />
        </div>

        <div className="space-y-1">
          <label className="text-muted-foreground text-[11px] font-medium">
            {translate('auto.components.sidebar.AddRepoSteps.cloneParentFolder', 'Parent folder')}
          </label>
          <div className="flex gap-2">
            <Input
              value={cloneDestination}
              onChange={(e) => onDestChange(e.target.value)}
              onKeyDown={handleKeyDown}
              placeholder={translate(
                isRemoteClone
                  ? 'auto.components.sidebar.AddRepoSteps.remoteCloneParentPlaceholder'
                  : 'auto.components.sidebar.AddRepoSteps.2ce3f6edf8',
                isRemoteClone ? '/home/user/projects' : '/path/to/destination'
              )}
              className="h-8 flex-1 text-xs"
              disabled={isCloning}
            />
            <Button
              variant="outline"
              size="sm"
              className="h-8 shrink-0 px-2"
              onClick={() => {
                if (canBrowseRemoteDestination) {
                  setBrowsingDestination(true)
                  return
                }
                onPickDestination()
              }}
              disabled={isCloning || (disableDestinationPicker && !canBrowseRemoteDestination)}
              title={
                canBrowseRemoteDestination
                  ? translate(
                      'auto.components.sidebar.AddRepoSteps.a93ef169b5',
                      'Browse host filesystem'
                    )
                  : translate('auto.components.sidebar.AddRepoSteps.569326d9cc', 'Choose folder')
              }
              aria-label={
                canBrowseRemoteDestination
                  ? translate(
                      'auto.components.sidebar.AddRepoSteps.a93ef169b5',
                      'Browse host filesystem'
                    )
                  : translate('auto.components.sidebar.AddRepoSteps.569326d9cc', 'Choose folder')
              }
            >
              <Folder className="size-3.5" />
            </Button>
          </div>
        </div>

        {cloneError && <p className="text-destructive text-[11px]">{cloneError}</p>}

        <Button
          onClick={onClone}
          disabled={!cloneUrl.trim() || !cloneDestination.trim() || isCloning}
          className="w-full"
        >
          {isCloning
            ? translate('auto.components.sidebar.AddRepoSteps.69f5b5380d', 'Cloning...')
            : translate('auto.components.sidebar.AddRepoSteps.32a7256d85', 'Clone')}
        </Button>

        {/* Why: progress bar lives below the button so it doesn't push the
           button down when it appears mid-clone. */}
        {isCloning && cloneProgress && (
          <div className="space-y-1.5">
            <div className="text-muted-foreground flex items-center justify-between text-[11px]">
              <span>{cloneProgress.phase}</span>
              <span>{cloneProgress.percent}%</span>
            </div>
            <div className="bg-secondary h-1.5 w-full overflow-hidden rounded-full">
              <div
                className="bg-foreground h-full rounded-full transition-[width] duration-300 ease-out"
                style={{ width: `${cloneProgress.percent}%` }}
              />
            </div>
          </div>
        )}
      </div>
    </>
  )
}
