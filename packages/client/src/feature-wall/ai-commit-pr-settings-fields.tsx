import { listCommitMessageAgentCapabilities } from '@yiru/protocol/source-control/catalog/agents'
import type {
  CommitMessageAgentCapability,
  CommitMessageModelCapability
} from '@yiru/protocol/source-control/catalog/types'
import { CUSTOM_PROMPT_PLACEHOLDER } from '@yiru/protocol/source-control/command/custom-prompt'
import { CUSTOM_AGENT_ID } from '@yiru/protocol/source-control/custom-agent'
import type { CommitMessageAiSettings } from '@yiru/protocol/source-control/legacy-settings'
import type { JSX } from 'react'
import { AgentIcon } from '~renderer/agent/catalog'
import { translate } from '~renderer/i18n/i18n'
import { Terminal } from '~renderer/icons/hugeicons'
import { cn } from '~renderer/ui/class-names'

import { Input } from '../ui/input'
import { Label } from '../ui/label'
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '../ui/select'
import { commitMessageAgentLabel } from './ai-commit-pr-settings-state'

type AiCommitPrSettingsFieldsProps = {
  config: CommitMessageAiSettings
  selectPortalRoot: HTMLElement | null
  agentSelectValue: string | undefined
  activeCapability: CommitMessageAgentCapability | undefined
  activeModel: CommitMessageModelCapability | null
  activeThinking: string | undefined
  isCustom: boolean
  unsupportedAgentLabel: string | null
  onAgentChange: (newAgentId: string) => void
  onModelChange: (newModelId: string) => void
  onThinkingChange: (newLevelId: string) => void
  writeConfig: (patch: Partial<CommitMessageAiSettings>) => void
}

export function AiCommitPrSettingsFields({
  config,
  selectPortalRoot,
  agentSelectValue,
  activeCapability,
  activeModel,
  activeThinking,
  isCustom,
  unsupportedAgentLabel,
  onAgentChange,
  onModelChange,
  onThinkingChange,
  writeConfig
}: AiCommitPrSettingsFieldsProps): JSX.Element {
  return (
    <div className="flex flex-col gap-2.5">
      <div className="grid grid-cols-[92px_minmax(0,1fr)] items-center gap-3">
        <Label className="text-xs">
          {translate('auto.components.feature.wall.AiCommitPrSettingsCard.29d119fe95', 'Agent')}
        </Label>
        <Select value={agentSelectValue} onValueChange={(v) => v && onAgentChange(v)}>
          <SelectTrigger size="sm" className="h-8 w-full text-xs">
            <span
              className={cn(
                'flex min-w-0 items-center gap-2',
                !activeCapability && !isCustom ? 'text-muted-foreground' : null
              )}
            >
              {activeCapability ? (
                <>
                  <AgentIcon agent={activeCapability.id} size={14} />
                  <span className="truncate">
                    {commitMessageAgentLabel(activeCapability.id, activeCapability)}
                  </span>
                </>
              ) : isCustom ? (
                <>
                  <Terminal className="size-3.5" />
                  <span>
                    {translate(
                      'auto.components.feature.wall.AiCommitPrSettingsCard.560d4feb00',
                      'Custom'
                    )}
                  </span>
                </>
              ) : (
                <span className="truncate">
                  {unsupportedAgentLabel
                    ? translate(
                        'auto.components.feature.wall.AiCommitPrSettingsCard.1f9468c5c9',
                        '{{value0}} unsupported',
                        { value0: unsupportedAgentLabel }
                      )
                    : translate(
                        'auto.components.feature.wall.AiCommitPrSettingsCard.bd14e9c42a',
                        'Not configured'
                      )}
                </span>
              )}
            </span>
          </SelectTrigger>
          <SelectContent
            portalContainer={selectPortalRoot}
            alignItemWithTrigger={false}
            align="start"
          >
            {listCommitMessageAgentCapabilities().map((capability) => (
              <SelectItem key={capability.id} value={capability.id} className="cursor-pointer">
                <span className="flex items-center gap-2">
                  <AgentIcon agent={capability.id} size={14} />
                  <span>{commitMessageAgentLabel(capability.id, capability)}</span>
                </span>
              </SelectItem>
            ))}
            <SelectItem value={CUSTOM_AGENT_ID} className="cursor-pointer">
              <span className="flex items-center gap-2">
                <Terminal className="size-3.5" />
                <span>
                  {translate(
                    'auto.components.feature.wall.AiCommitPrSettingsCard.560d4feb00',
                    'Custom'
                  )}
                </span>
              </span>
            </SelectItem>
          </SelectContent>
        </Select>
        {unsupportedAgentLabel ? (
          <p className="text-muted-foreground col-start-2 text-[11px] leading-snug">
            {unsupportedAgentLabel}{' '}
            {translate(
              'auto.components.feature.wall.AiCommitPrSettingsCard.4d9b6d84df',
              'unsupported. Choose Claude, Codex, or Custom.'
            )}
          </p>
        ) : null}
      </div>

      {activeCapability && activeModel ? (
        <div className="grid grid-cols-[92px_minmax(0,1fr)] items-center gap-3">
          <Label className="text-xs">
            {translate('auto.components.feature.wall.AiCommitPrSettingsCard.be8917699e', 'Model')}
          </Label>
          <Select value={activeModel.id} onValueChange={(v) => v && onModelChange(v)}>
            <SelectTrigger size="sm" className="h-8 w-full text-xs">
              <SelectValue />
            </SelectTrigger>
            <SelectContent
              portalContainer={selectPortalRoot}
              alignItemWithTrigger={false}
              align="start"
            >
              {activeCapability.models.map((model) => (
                <SelectItem key={model.id} value={model.id} className="cursor-pointer">
                  {model.label}
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
        </div>
      ) : null}

      {activeModel?.thinkingLevels && activeThinking ? (
        <div className="grid grid-cols-[92px_minmax(0,1fr)] items-center gap-3">
          <Label className="text-xs">
            {translate(
              'auto.components.feature.wall.AiCommitPrSettingsCard.4b2fc4b80c',
              'Thinking effort'
            )}
          </Label>
          <Select value={activeThinking} onValueChange={(v) => v && onThinkingChange(v)}>
            <SelectTrigger size="sm" className="h-8 w-full text-xs">
              <SelectValue />
            </SelectTrigger>
            <SelectContent
              portalContainer={selectPortalRoot}
              alignItemWithTrigger={false}
              align="start"
            >
              {activeModel.thinkingLevels.map((level) => (
                <SelectItem key={level.id} value={level.id} className="cursor-pointer">
                  {level.label}
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
        </div>
      ) : null}

      {isCustom ? (
        <div className="space-y-1.5">
          <Label htmlFor="feature-wall-ai-commit-custom-command" className="text-xs">
            {translate(
              'auto.components.feature.wall.AiCommitPrSettingsCard.9ee54037a4',
              'Custom command'
            )}
          </Label>
          <Input
            id="feature-wall-ai-commit-custom-command"
            value={config.customAgentCommand}
            onChange={(event) => writeConfig({ customAgentCommand: event.target.value })}
            placeholder={translate(
              'auto.components.feature.wall.AiCommitPrSettingsCard.8d4152701a',
              'e.g. ollama run llama3.1 {{value0}}',
              { value0: CUSTOM_PROMPT_PLACEHOLDER }
            )}
            spellCheck={false}
            className="h-8 font-mono text-xs"
          />
        </div>
      ) : null}
    </div>
  )
}
