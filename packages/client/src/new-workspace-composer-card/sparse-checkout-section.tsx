import type { SparsePreset } from '@yiru/protocol/worktree/create-result'
import React from 'react'
import { translate } from '~renderer/i18n/i18n'
import SparseCheckoutPresetSelect from '~renderer/sparse/checkout-preset-select'

type SparseCheckoutSectionProps = {
  repoId: string
  sparsePresets: SparsePreset[]
  sparseSelectedPresetId: string | null
  onSparseSelectPreset: (preset: SparsePreset | null) => void
  canUseSparseCheckout: boolean
}

export function SparseCheckoutSection({
  repoId,
  sparsePresets,
  sparseSelectedPresetId,
  onSparseSelectPreset,
  canUseSparseCheckout
}: SparseCheckoutSectionProps): React.JSX.Element {
  return (
    <div className="space-y-1.5">
      <label className="text-muted-foreground text-xs font-medium">
        {translate('auto.components.NewWorkspaceComposerCard.d861de981b', 'Sparse checkout')}
      </label>
      <SparseCheckoutPresetSelect
        repoId={repoId}
        presets={sparsePresets}
        selectedPresetId={sparseSelectedPresetId}
        onSelectPreset={onSparseSelectPreset}
        disabled={!canUseSparseCheckout}
      />
      {!canUseSparseCheckout ? (
        <p className="text-muted-foreground text-[11px]">
          {translate(
            'auto.components.NewWorkspaceComposerCard.cbb47ee0dc',
            'Only available for local Git projects.'
          )}
        </p>
      ) : null}
    </div>
  )
}
