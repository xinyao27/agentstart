import { getAgentSessionOptionCatalog } from '@yiru/protocol/agent/session-options/catalog'
import type {
  SessionOptionDescriptor,
  SessionOptionValue
} from '@yiru/protocol/agent/session-options/types'
import type { AgentType } from '@yiru/protocol/agent/status-records'
import React, { useState } from 'react'
import { translate } from '~renderer/i18n/i18n'

import { Label } from '../ui/label'
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '../ui/select'
import { Switch } from '../ui/switch'
import {
  agentLaunchChoiceLabel,
  agentLaunchOptionLabel,
  buildAgentLaunchOptionDescriptors
} from './launch-option-descriptors'

export type ContinuationLaunchOptions = {
  model: string | null
  values: Record<string, SessionOptionValue>
}

export const EMPTY_CONTINUATION_LAUNCH_OPTIONS: ContinuationLaunchOptions = {
  model: null,
  values: {}
}

/**
 * Shape the picked values the way `resolveAgentSessionOptionLaunch` expects, so
 * the relaunch turns them into the agent's own launch flags.
 */
export function buildContinuationSessionOptions(
  options: ContinuationLaunchOptions
): Record<string, SessionOptionValue> | undefined {
  if (!options.model) {
    return undefined
  }
  return { model: options.model, ...options.values }
}

/**
 * Seed the picks for a model with that model's own defaults.
 *
 * The launch resolver already falls back to these defaults, so showing them is
 * what makes the form agree with what will actually be launched. It also keeps
 * every control on a real value: a controlled Select whose value matches no
 * item renders blank and cannot be opened.
 */
export function resolveContinuationLaunchOptionsForModel(
  agent: AgentType,
  modelId: string | null
): ContinuationLaunchOptions {
  const catalog = getAgentSessionOptionCatalog(agent)
  if (!catalog) {
    return EMPTY_CONTINUATION_LAUNCH_OPTIONS
  }
  const model = modelId
    ? catalog.models.find((candidate) => candidate.id === modelId)
    : (catalog.models.find((candidate) => candidate.isDefault) ?? catalog.models[0])
  if (!model) {
    return EMPTY_CONTINUATION_LAUNCH_OPTIONS
  }
  const values: Record<string, SessionOptionValue> = {}
  for (const option of model.options) {
    if (option.kind.defaultValue !== undefined) {
      values[option.id] = option.kind.defaultValue
    }
  }
  return { model: model.id, values }
}

function useLaunchDescriptors(
  agent: AgentType,
  options: ContinuationLaunchOptions
): SessionOptionDescriptor[] {
  return (() => {
    const catalog = getAgentSessionOptionCatalog(agent)
    if (!catalog) {
      return []
    }
    return buildAgentLaunchOptionDescriptors({
      catalog,
      modelId: options.model,
      values: options.values
    })
  })()
}

function DescriptorField(props: {
  descriptor: SessionOptionDescriptor
  disabled: boolean
  onSelect: (value: SessionOptionValue) => void
  portalRoot: HTMLElement | null
}): React.JSX.Element | null {
  const { descriptor, disabled, onSelect, portalRoot } = props
  const label = agentLaunchOptionLabel(descriptor)
  if (descriptor.kind.type === 'boolean') {
    return (
      <div className="flex items-center justify-between gap-3">
        <Label className="text-xs font-normal">{label}</Label>
        <Switch
          checked={descriptor.kind.currentValue ?? false}
          disabled={disabled || !descriptor.settable}
          onCheckedChange={(checked) => onSelect(checked)}
        />
      </div>
    )
  }
  const selectedChoice = descriptor.kind.choices.find(
    (choice) => choice.value === descriptor.kind.currentValue
  )
  const selectedLabel = selectedChoice
    ? agentLaunchChoiceLabel(selectedChoice)
    : descriptor.kind.currentValue
  return (
    <div className="flex items-center justify-between gap-3">
      <Label className="text-xs font-normal">{label}</Label>
      <Select
        value={descriptor.kind.currentValue ?? null}
        disabled={disabled || !descriptor.settable}
        onValueChange={(value) => {
          if (typeof value === 'string') {
            onSelect(value)
          }
        }}
      >
        <SelectTrigger size="sm" className="h-7 w-[184px] text-xs">
          <SelectValue>{selectedLabel}</SelectValue>
        </SelectTrigger>
        <SelectContent portalContainer={portalRoot} align="start" alignItemWithTrigger={false}>
          {descriptor.kind.choices.map((choice) => (
            <SelectItem key={choice.value} value={choice.value}>
              {agentLaunchChoiceLabel(choice)}
            </SelectItem>
          ))}
        </SelectContent>
      </Select>
    </div>
  )
}

export function AgentSessionContinuationLaunchOptions(props: {
  agent: AgentType
  options: ContinuationLaunchOptions
  onChange: (next: ContinuationLaunchOptions) => void
  disabled: boolean
}): React.JSX.Element | null {
  const { agent, options, onChange, disabled } = props
  const descriptors = useLaunchDescriptors(agent, options)
  const [portalRoot, setPortalRoot] = useState<HTMLElement | null>(null)
  const capturePortalRoot = (node: HTMLDivElement | null) => {
    // Why: the dialog is modal, so a select menu portaled to the body sits
    // outside its interaction scope and cannot be clicked. Portal into the
    // dialog instead.
    setPortalRoot(node?.closest<HTMLElement>('[data-slot="dialog-content"]') ?? node)
  }
  if (descriptors.length === 0) {
    return null
  }
  return (
    <div className="flex flex-col gap-2" ref={capturePortalRoot}>
      <Label className="text-muted-foreground text-[11px] font-semibold tracking-wide uppercase">
        {translate('components.agentSessionContinuation.launchOptions', 'Launch options')}
      </Label>
      {descriptors.map((descriptor) => (
        <DescriptorField
          key={descriptor.id}
          descriptor={descriptor}
          disabled={disabled}
          onSelect={(value) => {
            if (descriptor.id === 'model') {
              // Why: option choices are per-model, so a model change reseeds from
              // the new model's defaults instead of keeping values it may reject.
              onChange(
                resolveContinuationLaunchOptionsForModel(
                  agent,
                  typeof value === 'string' ? value : null
                )
              )
              return
            }
            onChange({ ...options, values: { ...options.values, [descriptor.id]: value } })
          }}
          portalRoot={portalRoot}
        />
      ))}
    </div>
  )
}
