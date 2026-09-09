import type { OnboardingState } from '@yiru/protocol/settings/onboarding'
import { Suspense } from 'react'

import { CrashReportDialog } from '../crash-report/dialog'
import { MarkdownTemplatePicker } from '../editor/markdown-template-picker'
import { RecoverableRenderErrorBoundary } from '../error-boundaries/recoverable-render-error-boundary'
import { translate } from '../i18n/i18n'
import type { AppState } from '../store/types'
import type { LazyModalId } from './lazy-modal-mount-state'
import { lazyWithRetry as lazy } from './lazy-with-retry'
import NewWorkspaceComposerModal from './new-workspace-composer-modal'

const AddProjectFromFolderDialog = lazy(() => import('../sidebar/add-project-from-folder-dialog'))
const AddRepoDialog = lazy(() => import('../sidebar/add-repo/dialog'))
const DeleteWorktreeDialog = lazy(() => import('../sidebar/delete-worktree/dialog'))
const FeatureTipsModal = lazy(() => import('../feature-tips/modal'))
const FeatureWallModal = lazy(() => import('../feature-wall/modal'))
const NonGitFolderDialog = lazy(() => import('../sidebar/non-git-folder-dialog'))
const OnboardingFlow = lazy(() => import('../onboarding/flow'))
const ProjectAddedDialog = lazy(() => import('../sidebar/project-added-dialog'))
const SetupGuideModal = lazy(() => import('../setup-guide/modal'))
const SetupGuideTelemetryObserver = lazy(() =>
  import('../setup-guide/telemetry-observer').then((module) => ({
    default: module.SetupGuideTelemetryObserver
  }))
)
const WorkspaceCleanupDialog = lazy(() => import('../workspace-cleanup/dialog'))

type ShellPrimaryModalsProps = {
  activeModal: AppState['activeModal']
  mountedLazyModalIds: ReadonlySet<LazyModalId>
  shouldMountAddRepoDialog: boolean
  shouldMountSetupGuideTelemetryObserver: boolean
}

export function ShellPrimaryModals({
  activeModal,
  mountedLazyModalIds,
  shouldMountAddRepoDialog,
  shouldMountSetupGuideTelemetryObserver
}: ShellPrimaryModalsProps): React.JSX.Element {
  return (
    <>
      {activeModal === 'new-workspace-composer' ? (
        <RecoverableRenderErrorBoundary
          boundaryId="modal.new-workspace-composer"
          surface="modal"
          resetKey
          compact
        >
          <NewWorkspaceComposerModal />
        </RecoverableRenderErrorBoundary>
      ) : null}
      <Suspense fallback={null}>
        {shouldMountAddRepoDialog ? (
          <RecoverableRenderErrorBoundary
            boundaryId="modal.add-repo"
            surface="modal"
            resetKey={activeModal === 'add-repo'}
            compact
          >
            <AddRepoDialog />
          </RecoverableRenderErrorBoundary>
        ) : null}
        {activeModal === 'confirm-non-git-folder' ? (
          <RecoverableRenderErrorBoundary
            boundaryId="modal.confirm-non-git-folder"
            surface="modal"
            resetKey
            compact
          >
            <NonGitFolderDialog />
          </RecoverableRenderErrorBoundary>
        ) : null}
        {activeModal === 'confirm-add-project-from-folder' ? (
          <RecoverableRenderErrorBoundary
            boundaryId="modal.confirm-add-project-from-folder"
            surface="modal"
            resetKey
            compact
          >
            <AddProjectFromFolderDialog />
          </RecoverableRenderErrorBoundary>
        ) : null}
        {activeModal === 'project-added' ? (
          <RecoverableRenderErrorBoundary
            boundaryId="modal.project-added"
            surface="modal"
            resetKey
            compact
          >
            <ProjectAddedDialog />
          </RecoverableRenderErrorBoundary>
        ) : null}
      </Suspense>
      <Suspense fallback={null}>
        {mountedLazyModalIds.has('workspace-cleanup') ? (
          <RecoverableRenderErrorBoundary
            boundaryId="modal.workspace-cleanup"
            surface="modal"
            resetKey={activeModal === 'workspace-cleanup'}
            compact
          >
            <WorkspaceCleanupDialog />
          </RecoverableRenderErrorBoundary>
        ) : null}
        {mountedLazyModalIds.has('setup-guide') ? (
          <RecoverableRenderErrorBoundary
            boundaryId="modal.setup-guide"
            surface="modal"
            resetKey={activeModal === 'setup-guide'}
            compact
          >
            <SetupGuideModal />
          </RecoverableRenderErrorBoundary>
        ) : null}
        {mountedLazyModalIds.has('feature-wall') ? (
          <RecoverableRenderErrorBoundary
            boundaryId="modal.feature-wall"
            surface="modal"
            resetKey={activeModal === 'feature-wall'}
            compact
          >
            <FeatureWallModal />
          </RecoverableRenderErrorBoundary>
        ) : null}
        {mountedLazyModalIds.has('feature-tips') ? (
          <RecoverableRenderErrorBoundary
            boundaryId="modal.feature-tips"
            surface="modal"
            resetKey={activeModal === 'feature-tips'}
            compact
          >
            <FeatureTipsModal />
          </RecoverableRenderErrorBoundary>
        ) : null}
      </Suspense>
      {shouldMountSetupGuideTelemetryObserver ? (
        <Suspense fallback={null}>
          <SetupGuideTelemetryObserver />
        </Suspense>
      ) : null}
    </>
  )
}

type ShellLateModalsProps = {
  activeModal: AppState['activeModal']
  onboarding: OnboardingState | null
  setOnboarding: (state: OnboardingState) => void
  shouldRenderOnboarding: boolean
}

export function ShellLateModals({
  activeModal,
  onboarding,
  setOnboarding,
  shouldRenderOnboarding
}: ShellLateModalsProps): React.JSX.Element {
  return (
    <>
      <Suspense fallback={null}>
        {activeModal === 'delete-worktree' ? (
          <RecoverableRenderErrorBoundary
            boundaryId="modal.delete-worktree"
            surface="modal"
            resetKey
            compact
          >
            <DeleteWorktreeDialog />
          </RecoverableRenderErrorBoundary>
        ) : null}
      </Suspense>
      <RecoverableRenderErrorBoundary
        boundaryId="modal.markdown-template-picker"
        surface="modal"
        resetKey={activeModal}
        compact
      >
        <MarkdownTemplatePicker />
      </RecoverableRenderErrorBoundary>
      <RecoverableRenderErrorBoundary
        boundaryId="modal.crash-report"
        surface="modal"
        reportAsCrash={false}
        resetKey={activeModal}
        compact
        title={translate('auto.App.722d03aa62', 'The crash report dialog hit an error.')}
        description={translate(
          'auto.App.acd66311dc',
          'Use the Help menu after retrying if you still need diagnostics.'
        )}
      >
        <CrashReportDialog />
      </RecoverableRenderErrorBoundary>
      {onboarding && shouldRenderOnboarding ? (
        <Suspense fallback={null}>
          <RecoverableRenderErrorBoundary
            boundaryId="modal.onboarding"
            surface="modal"
            title={translate('auto.App.f02d37278a', 'Onboarding hit an error.')}
            description={translate(
              'auto.App.221a95ba38',
              'Retry onboarding or close it and continue in the app.'
            )}
          >
            <OnboardingFlow onboarding={onboarding} onOnboardingChange={setOnboarding} />
          </RecoverableRenderErrorBoundary>
        </Suspense>
      ) : null}
    </>
  )
}
