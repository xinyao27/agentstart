export const UI_LANGUAGE_SYSTEM = 'system'
export const UI_LANGUAGE_ENGLISH = 'en'
export const UI_LANGUAGE_CHINESE = 'zh'

export type UiLanguage =
  | typeof UI_LANGUAGE_SYSTEM
  | typeof UI_LANGUAGE_ENGLISH
  | typeof UI_LANGUAGE_CHINESE

export function normalizeUiLanguage(value: unknown): UiLanguage {
  return value === UI_LANGUAGE_ENGLISH || value === UI_LANGUAGE_CHINESE ? value : UI_LANGUAGE_SYSTEM
}
