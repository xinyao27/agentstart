import { translate } from '~renderer/i18n/i18n'
import { RepoBadgeMark } from '~renderer/repo/badge-label'

import {
  ConfigureOnlyAction,
  DetectedSetupPreview,
  DismissButton,
  InspectionErrorActions,
  PackageManagerActions,
  SaveLocalSetupAction,
  SetupScriptPromptBody
} from './setup-script-prompt-card-views'

type SetupScriptPromptCardShellProps = {
  repoBadgeColor: string
  repoDisplayName: string
  isInspectionError: boolean
  sharedSetupIgnored: boolean
  isPackageManagerSuggestion: boolean
  hasCandidate: boolean
  candidateSource: string | null
  candidateProvenance: string | null
  detectedSetupDraft: string
  isImporting: boolean
  renderedStateOk: boolean
  onDismiss: () => void
  onRetryInspection: () => void
  onConfigure: () => void
  onImport: () => void
  onSetupDraftChange: (value: string) => void
}

export function SetupScriptPromptCardShell({
  repoBadgeColor,
  repoDisplayName,
  isInspectionError,
  sharedSetupIgnored,
  isPackageManagerSuggestion,
  hasCandidate,
  candidateSource,
  candidateProvenance,
  detectedSetupDraft,
  isImporting,
  renderedStateOk,
  onDismiss,
  onRetryInspection,
  onConfigure,
  onImport,
  onSetupDraftChange
}: SetupScriptPromptCardShellProps): React.JSX.Element {
  return (
    <div className="shrink-0 px-3 pb-2">
      {/* Why: sidebar accent is too close to the rail surface for a persistent prompt. */}
      <div className="border-sidebar-border text-sidebar-accent-foreground rounded-lg border bg-[color-mix(in_srgb,var(--sidebar-foreground)_5%,var(--sidebar))] p-3 dark:bg-[color-mix(in_srgb,var(--sidebar-foreground)_12%,var(--sidebar))]">
        <div className="flex items-center justify-between gap-2">
          <p className="text-sm leading-snug font-semibold">
            {translate(
              'auto.components.sidebar.SetupScriptPromptCard.ff1e819a11',
              'Add a setup script'
            )}
          </p>
          <DismissButton onDismiss={onDismiss} />
        </div>

        <p className="text-muted-foreground mt-0.5 flex min-w-0 items-center gap-1.5 text-xs">
          <RepoBadgeMark color={repoBadgeColor} />
          <span className="text-foreground truncate font-medium">{repoDisplayName}</span>
        </p>

        <p className="text-muted-foreground mt-1 text-xs leading-snug">
          <SetupScriptPromptBody
            isInspectionError={isInspectionError}
            sharedSetupIgnored={sharedSetupIgnored}
            isPackageManagerSuggestion={isPackageManagerSuggestion}
            candidateSource={candidateSource}
          />
        </p>

        {!isInspectionError && !sharedSetupIgnored && hasCandidate && isPackageManagerSuggestion ? (
          <DetectedSetupPreview
            setup={detectedSetupDraft}
            onSetupChange={onSetupDraftChange}
            provenance={candidateProvenance}
          />
        ) : null}

        {isInspectionError ? (
          <InspectionErrorActions onRetry={onRetryInspection} onConfigure={onConfigure} />
        ) : sharedSetupIgnored ? (
          <ConfigureOnlyAction onConfigure={onConfigure} />
        ) : hasCandidate && isPackageManagerSuggestion ? (
          <PackageManagerActions
            isSaving={isImporting}
            onSave={onImport}
            onConfigure={onConfigure}
          />
        ) : hasCandidate ? (
          <SaveLocalSetupAction isSaving={isImporting} onSave={onImport} />
        ) : renderedStateOk ? (
          <ConfigureOnlyAction onConfigure={onConfigure} />
        ) : null}
      </div>
    </div>
  )
}
