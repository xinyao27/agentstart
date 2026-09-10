import { translate } from '~renderer/i18n/i18n'
import { Folder, FolderOpen, Pencil } from '~renderer/icons/hugeicons'
import { Button } from '~renderer/ui/button'
import { DialogDescription, DialogHeader, DialogTitle } from '~renderer/ui/dialog'
import { Input } from '~renderer/ui/input'
import { Tooltip, TooltipContent, TooltipTrigger } from '~renderer/ui/tooltip'

import { RemoteFileBrowser } from './remote-file-browser'

type CreateProjectParentBrowserProps = {
  runtimeEnvironmentId?: string | null
  createParent: string
  onParentChange: (value: string) => void
  onClose: () => void
}

export function CreateProjectParentBrowser({
  runtimeEnvironmentId,
  createParent,
  onParentChange,
  onClose
}: CreateProjectParentBrowserProps): React.JSX.Element {
  return (
    <>
      <DialogHeader>
        <DialogTitle>
          {translate(
            'auto.components.sidebar.CreateProjectLocationField.f520f83a97',
            'Browse host filesystem'
          )}
        </DialogTitle>
        <DialogDescription>
          {translate(
            'auto.components.sidebar.CreateProjectLocationField.b589b77997',
            'Navigate to a directory and click Select to choose it.'
          )}
        </DialogDescription>
      </DialogHeader>
      <RemoteFileBrowser
        runtimeEnvironmentId={runtimeEnvironmentId as string}
        initialPath={createParent || '~'}
        onSelect={(path) => {
          onParentChange(path)
          onClose()
        }}
        onCancel={onClose}
      />
    </>
  )
}

type CreateProjectLocationFieldProps = {
  createParent: string
  isCreating: boolean
  manualParentEntry: boolean
  runtimeEnvironmentId?: string | null
  onParentChange: (value: string) => void
  onPickParent: () => void
  onBrowseServer: () => void
}

export function CreateProjectLocationField({
  createParent,
  isCreating,
  manualParentEntry,
  runtimeEnvironmentId,
  onParentChange,
  onPickParent,
  onBrowseServer
}: CreateProjectLocationFieldProps): React.JSX.Element {
  return (
    <div className="space-y-1">
      <span className="text-muted-foreground block text-[11px] font-medium">
        {translate('auto.components.sidebar.CreateProjectLocationField.134e37f711', 'Location')}
      </span>

      {manualParentEntry ? (
        <div className="flex gap-2">
          <Input
            value={createParent}
            onChange={(e) => onParentChange(e.target.value)}
            placeholder={translate(
              'auto.components.sidebar.CreateProjectLocationField.2a20a603a3',
              '/home/user/projects'
            )}
            className="h-11 min-w-0 flex-1 font-mono text-sm"
            disabled={isCreating}
            spellCheck={false}
          />
          <Tooltip>
            <TooltipTrigger
              render={
                <Button
                  type="button"
                  variant="outline"
                  size="icon"
                  className="h-11 w-11 shrink-0"
                  onClick={onBrowseServer}
                  disabled={isCreating || !runtimeEnvironmentId}
                  aria-label={translate(
                    'auto.components.sidebar.CreateProjectLocationField.f520f83a97',
                    'Browse host filesystem'
                  )}
                >
                  <FolderOpen className="size-4" />
                </Button>
              }
            />
            <TooltipContent side="top" sideOffset={4}>
              {translate(
                'auto.components.sidebar.CreateProjectLocationField.f520f83a97',
                'Browse host filesystem'
              )}
            </TooltipContent>
          </Tooltip>
        </div>
      ) : createParent ? (
        <div className="group border-border bg-background/40 flex h-11 min-w-0 items-center gap-2.5 rounded-md border px-3 text-sm">
          <span className="min-w-0 flex-1 truncate font-mono text-[12px]" title={createParent}>
            {createParent}
          </span>
          <Button
            variant="quiet"
            size="xs"
            type="button"
            onClick={onPickParent}
            disabled={isCreating}
            className="h-auto border-0 p-0 text-[11px] disabled:cursor-not-allowed"
            aria-label={translate(
              'auto.components.sidebar.CreateProjectLocationField.afaf54f245',
              'Change parent folder'
            )}
          >
            <Pencil className="size-3" />
            {translate('auto.components.sidebar.CreateProjectLocationField.632b456b1b', 'Change')}
          </Button>
        </div>
      ) : (
        <Button
          type="button"
          variant="outline"
          onClick={onPickParent}
          disabled={isCreating}
          className="text-muted-foreground h-11 w-full justify-start gap-2.5 text-sm font-normal"
        >
          <span className="border-border/70 bg-background/40 inline-flex size-7 shrink-0 items-center justify-center rounded-md border">
            <Folder className="size-3.5" />
          </span>
          {translate(
            'auto.components.sidebar.CreateProjectLocationField.95548e33bf',
            'Choose parent folder...'
          )}
        </Button>
      )}
    </div>
  )
}
