import type { NestedRepoScanResult } from '@agentstart/protocol/project/group-model'
import type { Dispatch, ReactNode, SetStateAction } from 'react'

import type { GitAvailability } from '../create-project-defaults'
import { CloneStep } from './clone-step'
import { CreateStep } from './create-step'
import type { AddRepoDialogStep } from './dialog-types'
import { AddRepoNestedImportStep } from './nested-import-step'
import { AddRepoServerPathStartStep } from './server-start-step'
import { AddRepoLocalStartStep } from './start-steps'

type AddRepoDialogStepContentProps = {
  step: AddRepoDialogStep
  isRuntimeEnvironmentActive: boolean
  activeRuntimeEnvironmentId: string | null | undefined
  repoCount: number
  isAdding: boolean
  addProjectBusyLabel: string | null
  nestedScanInProgress: boolean
  nestedScanId: string | null
  serverPath: string
  isAddingServerPath: boolean
  cloneUrl: string
  cloneDestination: string
  cloneError: string | null
  cloneProgress: { phase: string; percent: number } | null
  isCloning: boolean
  selectedHostLabel?: string | null
  nestedScan: NestedRepoScanResult | null
  nestedSelectedPaths: Set<string>
  nestedGroupName: string
  createName: string
  createParent: string
  createError: string | null
  isCreating: boolean
  hostSelector?: ReactNode
  canCreateProject?: boolean
  manualCreateParentEntry?: boolean
  browseHostKind?: 'local' | 'runtime'
  createDefaultParent: string
  createGitAvailability: GitAvailability
  createRuntimeParentStatus: 'idle' | 'checking' | 'failed'
  createParentDefaultPending: boolean
  onBrowse: () => void
  onOpenCloneStep: () => void
  onOpenCreateStep: () => void
  onStopNestedScan: () => void
  onServerPathChange: (path: string) => void
  onAddServerPath: (kind: 'git' | 'folder') => void
  onCloneUrlChange: (url: string) => void
  onCloneDestinationChange: (destination: string) => void
  onPickCloneDestination: () => void
  onClone: () => void
  onNestedGroupNameChange: (name: string) => void
  onNestedSelectedPathsChange: Dispatch<SetStateAction<Set<string>>>
  onImportNestedRepos: (mode: 'group' | 'separate') => void
  onOpenNestedRootFolder: () => void
  onCreateNameChange: (name: string) => void
  onCreateParentChange: (parent: string) => void
  onPickCreateParent: () => void
  onCreate: () => void
}

export function AddRepoDialogStepContent({
  step,
  isRuntimeEnvironmentActive,
  activeRuntimeEnvironmentId,
  repoCount,
  isAdding,
  addProjectBusyLabel,
  nestedScanInProgress,
  nestedScanId,
  serverPath,
  isAddingServerPath,
  cloneUrl,
  cloneDestination,
  cloneError,
  cloneProgress,
  isCloning,
  selectedHostLabel,
  nestedScan,
  nestedSelectedPaths,
  nestedGroupName,
  createName,
  createParent,
  createError,
  isCreating,
  hostSelector,
  canCreateProject = true,
  manualCreateParentEntry = isRuntimeEnvironmentActive,
  browseHostKind = 'local',
  createDefaultParent,
  createGitAvailability,
  createRuntimeParentStatus,
  createParentDefaultPending,
  onBrowse,
  onOpenCloneStep,
  onOpenCreateStep,
  onStopNestedScan,
  onServerPathChange,
  onAddServerPath,
  onCloneUrlChange,
  onCloneDestinationChange,
  onPickCloneDestination,
  onClone,
  onNestedGroupNameChange,
  onNestedSelectedPathsChange,
  onImportNestedRepos,
  onOpenNestedRootFolder,
  onCreateNameChange,
  onCreateParentChange,
  onPickCreateParent,
  onCreate
}: AddRepoDialogStepContentProps): React.JSX.Element | null {
  if (step === 'add') {
    return (
      <AddRepoLocalStartStep
        repoCount={repoCount}
        isAdding={isAdding}
        addProjectBusyLabel={addProjectBusyLabel}
        nestedScanInProgress={nestedScanInProgress}
        nestedScanId={nestedScanId}
        hostSelector={hostSelector}
        canCreateProject={canCreateProject}
        browseHostKind={browseHostKind}
        onBrowse={onBrowse}
        onOpenCloneStep={onOpenCloneStep}
        onOpenCreateStep={onOpenCreateStep}
        onStopNestedScan={onStopNestedScan}
      />
    )
  }

  if (step === 'server-path') {
    return (
      <AddRepoServerPathStartStep
        serverPath={serverPath}
        runtimeEnvironmentId={activeRuntimeEnvironmentId}
        isAddingServerPath={isAddingServerPath}
        addProjectBusyLabel={addProjectBusyLabel}
        hostSelector={hostSelector}
        initialBrowsing
        onServerPathChange={onServerPathChange}
        onAddServerPath={onAddServerPath}
        onOpenCloneStep={onOpenCloneStep}
        onOpenCreateStep={onOpenCreateStep}
      />
    )
  }

  if (step === 'clone') {
    return (
      <CloneStep
        cloneUrl={cloneUrl}
        cloneDestination={cloneDestination}
        cloneError={cloneError}
        cloneProgress={cloneProgress}
        isCloning={isCloning}
        disableDestinationPicker={isRuntimeEnvironmentActive}
        runtimeEnvironmentId={activeRuntimeEnvironmentId}
        cloneTargetLabel={isRuntimeEnvironmentActive ? selectedHostLabel : null}
        onUrlChange={onCloneUrlChange}
        onDestChange={onCloneDestinationChange}
        onPickDestination={onPickCloneDestination}
        onClone={onClone}
      />
    )
  }

  if (step === 'nested' && nestedScan) {
    return (
      <AddRepoNestedImportStep
        scan={nestedScan}
        groupName={nestedGroupName}
        selectedPaths={nestedSelectedPaths}
        isAdding={isAdding}
        scanInProgress={nestedScanInProgress}
        onGroupNameChange={onNestedGroupNameChange}
        onSelectedPathsChange={onNestedSelectedPathsChange}
        onImport={onImportNestedRepos}
        onOpenAsFolder={onOpenNestedRootFolder}
        onStopScan={onStopNestedScan}
      />
    )
  }

  if (step === 'create') {
    return (
      <CreateStep
        createName={createName}
        createParent={createParent}
        createError={createError}
        isCreating={isCreating}
        defaultParent={createDefaultParent}
        gitAvailability={createGitAvailability}
        runtimeParentStatus={createRuntimeParentStatus}
        parentDefaultPending={createParentDefaultPending}
        manualParentEntry={manualCreateParentEntry}
        runtimeEnvironmentId={activeRuntimeEnvironmentId}
        onNameChange={onCreateNameChange}
        onParentChange={onCreateParentChange}
        onPickParent={onPickCreateParent}
        onCreate={onCreate}
      />
    )
  }

  return null
}
