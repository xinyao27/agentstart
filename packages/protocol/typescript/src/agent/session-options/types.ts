export type SessionOptionValue = string | boolean

export type SessionOptionSelectChoice = {
  value: string
  label: string
  description?: string
}

export type SessionOptionValueSource = 'applied' | 'dispatched' | 'reported' | 'unknown'

export type SessionOptionDisabledReason =
  | 'available-after-session-start'
  | 'set-when-session-starts'

export type SessionOptionDescriptor = {
  id: string
  label: string
  description?: string
  category?: 'model' | 'thought_level' | 'model_config' | 'mode'
  kind:
    | {
        type: 'select'
        currentValue?: string
        choices: SessionOptionSelectChoice[]
      }
    | { type: 'boolean'; currentValue?: boolean }
  valueSource: SessionOptionValueSource
  settable: boolean
  disabledReason?: SessionOptionDisabledReason
}
