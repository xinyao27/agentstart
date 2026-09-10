import type { JSX } from 'react'
import { translate } from '~renderer/i18n/i18n'
import { useAppStore } from '~renderer/store/state'

import { AiCommitPrSettingsFields } from './ai-commit-pr-settings-fields'
import { AiCommitPrSettingsSwitch } from './ai-commit-pr-settings-switch'
import { useAiCommitPrSettings } from './use-ai-commit-pr-settings'

export function AiCommitPrSettingsCard(): JSX.Element | null {
  const settings = useAppStore((s) => s.settings)
  const {
    config,
    selectPortalRoot,
    setSelectPortalHost,
    agentSelectValue,
    activeCapability,
    activeModel,
    activeThinking,
    isCustom,
    unsupportedAgentLabel,
    toggleAi,
    onAgentChange,
    onModelChange,
    onThinkingChange,
    writeConfig
  } = useAiCommitPrSettings()

  if (!settings) {
    return null
  }

  return (
    <div ref={setSelectPortalHost} className="border-border bg-muted/20 rounded-xl border p-3.5">
      <div className="space-y-2.5">
        <div className="flex items-start justify-between gap-4">
          <div className="min-w-0">
            <div className="text-foreground text-[15px] leading-tight font-semibold">
              {translate(
                'auto.components.feature.wall.AiCommitPrSettingsCard.1c0cb4fabb',
                'AI author'
              )}
            </div>
          </div>
          <AiCommitPrSettingsSwitch
            checked={config.enabled}
            label={translate(
              'auto.components.feature.wall.AiCommitPrSettingsCard.f9382b48a1',
              'Enable AI author'
            )}
            onToggle={toggleAi}
          />
        </div>

        {config.enabled ? (
          <AiCommitPrSettingsFields
            config={config}
            selectPortalRoot={selectPortalRoot}
            agentSelectValue={agentSelectValue}
            activeCapability={activeCapability}
            activeModel={activeModel}
            activeThinking={activeThinking}
            isCustom={isCustom}
            unsupportedAgentLabel={unsupportedAgentLabel}
            onAgentChange={onAgentChange}
            onModelChange={onModelChange}
            onThinkingChange={onThinkingChange}
            writeConfig={writeConfig}
          />
        ) : null}
      </div>
    </div>
  )
}
