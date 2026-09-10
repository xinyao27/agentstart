import type { ComponentType } from 'react'
import { translate } from '~renderer/i18n/i18n'
import { Download, FolderOpen, ArrowLeft, Plus } from '~renderer/icons/hugeicons'
import { Button } from '~renderer/ui/button'
import { cn } from '~renderer/ui/class-names'
import { Input } from '~renderer/ui/input'
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '~renderer/ui/select'

export function HostSetupStartActions({
  pathActionsDisabled,
  planDisabled,
  onBrowse,
  onClone,
  onPlan
}: {
  pathActionsDisabled: boolean
  planDisabled: boolean
  onBrowse: () => void
  onClone: () => void
  onPlan: () => void
}): React.JSX.Element {
  return (
    <div className="space-y-3 pt-1">
      <HostSetupActionButton
        icon={FolderOpen}
        title={translate('auto.components.settings.RepositoryPane.browseFolder', 'Browse folder')}
        description={translate(
          'auto.components.settings.RepositoryPane.browseFolderHelp',
          'Use an existing checkout or folder on this host.'
        )}
        disabled={pathActionsDisabled}
        selected
        onClick={onBrowse}
      />
      <div className="space-y-1.5">
        <p className="text-muted-foreground text-xs font-medium tracking-wider uppercase">
          {translate('auto.components.settings.RepositoryPane.otherWaysToAdd', 'Other ways to add')}
        </p>
        <div className="border-input bg-background overflow-hidden rounded-md border">
          <HostSetupActionButton
            icon={Download}
            title={translate(
              'auto.components.settings.RepositoryPane.cloneFromUrl',
              'Clone from URL'
            )}
            description={translate(
              'auto.components.settings.RepositoryPane.cloneFromUrlHelp',
              'Clone this repository onto the selected host.'
            )}
            disabled={pathActionsDisabled}
            onClick={onClone}
          />

          <HostSetupActionButton
            icon={Plus}
            title={translate(
              'auto.components.settings.RepositoryPane.addPlannedHost',
              'Add host placeholder'
            )}
            description={translate(
              'auto.components.settings.RepositoryPane.addPlannedHostHelp',
              'Remember this host and finish adding the project later.'
            )}
            disabled={planDisabled}
            onClick={onPlan}
            className="border-border/70 rounded-b-md border-t"
          />
        </div>
      </div>
    </div>
  )
}

export function HostSetupExistingFolderStep({
  setupPath,
  setupKind,
  disabled,
  isSettingUp,
  onBack,
  onPathChange,
  onKindChange,
  onSubmit
}: {
  setupPath: string
  setupKind: 'git' | 'folder'
  disabled: boolean
  isSettingUp: boolean
  onBack: () => void
  onPathChange: (value: string) => void
  onKindChange: (value: 'git' | 'folder') => void
  onSubmit: () => void
}): React.JSX.Element {
  return (
    <div className="border-border bg-muted/20 space-y-3 rounded-md border p-3">
      <StepBackButton
        onBack={onBack}
        label={translate(
          'auto.components.settings.RepositoryPane.existingFolder',
          'Existing folder'
        )}
      />
      <div className="grid gap-2 sm:grid-cols-[minmax(0,1fr)_8rem]">
        <Input
          value={setupPath}
          onChange={(event) => onPathChange(event.target.value)}
          placeholder={translate(
            'auto.components.settings.RepositoryPane.setupExistingFolderPathPlaceholder',
            '/path/to/project/on/host'
          )}
          className="h-9 min-w-0"
        />
        <Select
          value={setupKind}
          onValueChange={(value) => onKindChange(value as 'git' | 'folder')}
        >
          <SelectTrigger className="h-9 text-xs">
            <SelectValue />
          </SelectTrigger>
          <SelectContent>
            <SelectItem value="git">
              {translate('auto.components.settings.RepositoryPane.setupKindGit', 'Git repo')}
            </SelectItem>
            <SelectItem value="folder">
              {translate('auto.components.settings.RepositoryPane.setupKindFolder', 'Folder')}
            </SelectItem>
          </SelectContent>
        </Select>
      </div>
      <div className="flex justify-end">
        <Button
          type="button"
          size="sm"
          disabled={disabled || !setupPath.trim() || isSettingUp}
          onClick={onSubmit}
        >
          {isSettingUp
            ? translate('auto.components.settings.RepositoryPane.settingUpHost', 'Adding...')
            : translate('auto.components.settings.RepositoryPane.setupHost', 'Add project')}
        </Button>
      </div>
    </div>
  )
}

export function HostSetupCloneStep({
  cloneUrl,
  cloneDestination,
  disabled,
  isCloning,
  onBack,
  onCloneUrlChange,
  onCloneDestinationChange,
  onSubmit
}: {
  cloneUrl: string
  cloneDestination: string
  disabled: boolean
  isCloning: boolean
  onBack: () => void
  onCloneUrlChange: (value: string) => void
  onCloneDestinationChange: (value: string) => void
  onSubmit: () => void
}): React.JSX.Element {
  return (
    <div className="border-border bg-muted/20 space-y-3 rounded-md border p-3">
      <StepBackButton
        onBack={onBack}
        label={translate('auto.components.settings.RepositoryPane.cloneFromUrl', 'Clone from URL')}
      />
      <div className="grid gap-2 sm:grid-cols-2">
        <Input
          value={cloneUrl}
          onChange={(event) => onCloneUrlChange(event.target.value)}
          placeholder={translate(
            'auto.components.settings.RepositoryPane.cloneUrlPlaceholder',
            'Repository URL'
          )}
          className="h-9 min-w-0"
        />
        <Input
          value={cloneDestination}
          onChange={(event) => onCloneDestinationChange(event.target.value)}
          placeholder={translate(
            'auto.components.settings.RepositoryPane.cloneDestinationPlaceholder',
            '/destination/on/host'
          )}
          className="h-9 min-w-0"
        />
      </div>
      <div className="flex justify-end">
        <Button
          type="button"
          size="sm"
          disabled={disabled || !cloneUrl.trim() || !cloneDestination.trim() || isCloning}
          onClick={onSubmit}
        >
          {isCloning
            ? translate('auto.components.settings.RepositoryPane.cloningHost', 'Cloning...')
            : translate('auto.components.settings.RepositoryPane.cloneHost', 'Clone')}
        </Button>
      </div>
    </div>
  )
}

export function HostSetupPlannedStep({
  disabled,
  isCreatingPendingSetup,
  hostLabel,
  onBack,
  onSubmit
}: {
  disabled: boolean
  isCreatingPendingSetup: boolean
  hostLabel: string
  onBack: () => void
  onSubmit: () => void
}): React.JSX.Element {
  const addHostLabel = translate(
    'auto.components.settings.RepositoryPane.addPlannedHostToHost',
    'Add {{host}}',
    { host: hostLabel }
  )

  return (
    <div className="border-border bg-muted/20 space-y-3 rounded-md border p-3">
      <StepBackButton
        onBack={onBack}
        label={translate(
          'auto.components.settings.RepositoryPane.addPlannedHost',
          'Add host placeholder'
        )}
      />
      <p className="text-muted-foreground text-xs">
        {translate(
          'auto.components.settings.RepositoryPane.addPlannedHostConfirm',
          'This only records that the project should be available on this host. You can add the folder or clone later.'
        )}
      </p>
      <div className="flex justify-end">
        <Button
          type="button"
          size="sm"
          disabled={disabled || isCreatingPendingSetup}
          onClick={onSubmit}
        >
          {isCreatingPendingSetup
            ? translate('auto.components.settings.RepositoryPane.creatingPendingSetup', 'Adding...')
            : addHostLabel}
        </Button>
      </div>
    </div>
  )
}

function StepBackButton({
  onBack,
  label
}: {
  onBack: () => void
  label: string
}): React.JSX.Element {
  return (
    <Button type="button" variant="ghost" size="sm" className="-ml-2 gap-2" onClick={onBack}>
      <ArrowLeft className="size-4" />
      {label}
    </Button>
  )
}

function HostSetupActionButton({
  icon: Icon,
  title,
  description,
  disabled,
  selected = false,
  className,
  onClick
}: {
  icon: ComponentType<{ className?: string }>
  title: string
  description: string
  disabled: boolean
  selected?: boolean
  className?: string
  onClick: () => void
}): React.JSX.Element {
  return (
    <Button
      variant="ghost"
      size="default"
      type="button"
      disabled={disabled}
      onClick={onClick}
      className={cn(
        'h-auto justify-start whitespace-normal font-normal flex min-h-[3.25rem] w-full gap-3 border px-3 py-2.5 text-left transition-colors  focus-visible:bg-accent disabled:cursor-default disabled:opacity-40',
        selected
          ? 'border-ring bg-foreground/10 text-foreground dark:bg-accent dark:text-accent-foreground'
          : '',
        className
      )}
    >
      <span
        className={cn(
          'grid size-7 shrink-0 place-items-center rounded-md',
          selected ? 'bg-background/70 text-accent-foreground' : 'text-muted-foreground'
        )}
      >
        <Icon className="size-4" />
      </span>
      <span className="min-w-0 flex-1">
        <span
          className={cn(
            'block text-sm font-medium leading-5',
            selected ? 'text-accent-foreground' : 'text-foreground'
          )}
        >
          {title}
        </span>
        <span className="text-muted-foreground mt-0.5 block text-xs leading-4 font-normal">
          {description}
        </span>
      </span>
    </Button>
  )
}
