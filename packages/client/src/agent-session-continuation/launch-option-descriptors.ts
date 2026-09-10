import type {
  AgentSessionOptionCatalog,
  CatalogOption
} from '@agentstart/protocol/agent/session-options/catalog-types'
import type {
  SessionOptionDescriptor,
  SessionOptionSelectChoice,
  SessionOptionValue
} from '@agentstart/protocol/agent/session-options/types'
import { translate } from '~renderer/i18n/i18n'

function optionIsSettable(
  apply: CatalogOption['apply'] | AgentSessionOptionCatalog['modelApply']
): boolean {
  return Boolean(apply.launchArgs || apply.composedIntoModel)
}

function selectDescriptor(args: {
  id: string
  label: string
  description?: string
  category?: SessionOptionDescriptor['category']
  currentValue?: string
  choices: SessionOptionSelectChoice[]
  settable: boolean
}): SessionOptionDescriptor {
  return {
    id: args.id,
    label: args.label,
    ...(args.description ? { description: args.description } : {}),
    ...(args.category ? { category: args.category } : {}),
    kind: {
      type: 'select',
      ...(args.currentValue ? { currentValue: args.currentValue } : {}),
      choices: args.choices
    },
    valueSource: args.currentValue ? 'applied' : 'unknown',
    settable: args.settable,
    ...(args.settable ? {} : { disabledReason: 'available-after-session-start' })
  }
}

export function buildAgentLaunchOptionDescriptors(args: {
  catalog: AgentSessionOptionCatalog
  modelId: string | null
  values: Readonly<Record<string, SessionOptionValue>>
}): SessionOptionDescriptor[] {
  const { catalog, modelId, values } = args
  const descriptors: SessionOptionDescriptor[] = [
    selectDescriptor({
      id: 'model',
      label: translate('components.agentSessionContinuation.model', 'Model'),
      category: 'model',
      ...(modelId ? { currentValue: modelId } : {}),
      choices: catalog.models.map(({ id, label, description }) => ({
        value: id,
        label,
        ...(description ? { description } : {})
      })),
      settable: optionIsSettable(catalog.modelApply)
    })
  ]
  if (!modelId) {
    return descriptors
  }
  const model = catalog.models.find((candidate) => candidate.id === modelId)
  for (const option of model?.options ?? []) {
    const value = values[option.id]
    const common = {
      id: option.id,
      label: option.label,
      ...(option.description ? { description: option.description } : {}),
      ...(option.category ? { category: option.category } : {}),
      valueSource: value === undefined ? ('unknown' as const) : ('applied' as const),
      settable: optionIsSettable(option.apply),
      ...(optionIsSettable(option.apply)
        ? {}
        : { disabledReason: 'available-after-session-start' as const })
    }
    if (option.kind.type === 'select') {
      descriptors.push({
        ...common,
        kind: {
          type: 'select',
          ...(typeof value === 'string' ? { currentValue: value } : {}),
          choices: option.kind.choices
        }
      })
    } else {
      descriptors.push({
        ...common,
        kind: {
          type: 'boolean',
          ...(typeof value === 'boolean' ? { currentValue: value } : {})
        }
      })
    }
  }
  return descriptors
}

export function agentLaunchOptionLabel(descriptor: SessionOptionDescriptor): string {
  switch (descriptor.id) {
    case 'model':
      return translate('components.agentSessionContinuation.model', 'Model')
    case 'effort':
      return translate('components.agentSessionContinuation.effort', descriptor.label)
    case 'fastMode':
      return translate('components.agentSessionContinuation.fastMode', 'Fast mode')
    case 'thinking':
      return translate('components.agentSessionContinuation.thinking', 'Thinking')
    default:
      return descriptor.label
  }
}

export function agentLaunchChoiceLabel(choice: SessionOptionSelectChoice): string {
  switch (choice.value) {
    case 'none':
      return translate('components.agentSessionContinuation.optionValue.none', 'None')
    case 'minimal':
      return translate('components.agentSessionContinuation.optionValue.minimal', 'Minimal')
    case 'low':
      return translate('components.agentSessionContinuation.optionValue.low', 'Low')
    case 'medium':
      return translate('components.agentSessionContinuation.optionValue.medium', 'Medium')
    case 'high':
      return translate('components.agentSessionContinuation.optionValue.high', 'High')
    case 'xhigh':
      return translate('components.agentSessionContinuation.optionValue.xhigh', 'Extra high')
    case 'max':
      return translate('components.agentSessionContinuation.optionValue.max', 'Max')
    case 'ultra':
      return translate('components.agentSessionContinuation.optionValue.ultra', 'Ultra')
    default:
      return choice.label
  }
}
