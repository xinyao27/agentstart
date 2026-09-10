import React from 'react'
import { translate } from '~renderer/i18n/i18n'
import type { SetupConfig } from '~renderer/new-workspace/workspace-creation'

type SetupCommandPreviewProps = {
  setupConfig: SetupConfig
  headerAction?: React.ReactNode
}

export function SetupCommandPreview({
  setupConfig,
  headerAction
}: SetupCommandPreviewProps): React.JSX.Element {
  if (setupConfig.source === 'yaml') {
    return (
      <div className="border-border/60 bg-muted/40 border">
        <div className="border-border/60 flex items-center justify-between gap-3 border-b px-4 py-2.5">
          <div className="text-muted-foreground font-mono text-[11px]">
            {translate('auto.components.NewWorkspaceComposerCard.23bb365554', 'agentstart.yaml')}
          </div>
          {headerAction}
        </div>
        {/* Why: long agentstart.yaml scripts must not grow the create dialog past the viewport. */}
        <pre className="scrollbar-sleek max-h-48 overflow-auto px-4 py-3 font-mono text-[12px] leading-5 break-words whitespace-pre-wrap text-emerald-700 dark:text-emerald-300/95">
          {setupConfig.command}
        </pre>
      </div>
    )
  }

  return (
    <div className="border-border/60 bg-muted/35 border px-4 py-3">
      <div className="mb-2 flex items-center justify-between gap-3">
        <div className="text-muted-foreground text-[11px] tracking-[0.18em] uppercase">
          {setupConfig.source === 'both'
            ? translate(
                'auto.components.NewWorkspaceComposerCard.e5db1b0419',
                'Combined setup command'
              )
            : translate(
                'auto.components.NewWorkspaceComposerCard.7711ad5122',
                'Local setup command'
              )}
        </div>
        {headerAction}
      </div>
      <pre className="text-foreground scrollbar-sleek max-h-48 overflow-auto font-mono text-[12px] leading-5 break-words whitespace-pre-wrap">
        {setupConfig.command}
      </pre>
    </div>
  )
}
