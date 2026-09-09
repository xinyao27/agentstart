// Why: the legacy six styles stay in this contract so existing preferences and
// callers keep their original renderer while AICSS variants are additive.
export const LEGACY_LOADER_VARIANTS = [
  'working',
  'searching',
  'solving',
  'listening',
  'composing',
  'shaping'
] as const

// Why: these IDs mirror AICSS Orbs' S/B/C/M families; the G globe family stays
// out of the shared loader contract so desktop and mobile expose the same set.
export const AICSS_LOADER_VARIANTS = [
  'S1',
  'S2',
  'S3',
  'S4',
  'S5',
  'B1',
  'B2',
  'B3',
  'B4',
  'B5',
  'C1',
  'C2',
  'C3',
  'C4',
  'C5',
  'M1',
  'M2',
  'M3',
  'M4',
  'M5'
] as const

export const LOADER_VARIANTS = [...LEGACY_LOADER_VARIANTS, ...AICSS_LOADER_VARIANTS] as const

export type LegacyLoaderVariant = (typeof LEGACY_LOADER_VARIANTS)[number]
export type LoaderVariant = (typeof LOADER_VARIANTS)[number]
export type AICSSLoaderVariant = Exclude<LoaderVariant, LegacyLoaderVariant>
export type LatticeVariant = Extract<AICSSLoaderVariant, `S${number}`>
export type LensVariant = Extract<AICSSLoaderVariant, `B${number}`>
export type RingVariant = Extract<AICSSLoaderVariant, `C${number}`>
export type MorphVariant = Extract<AICSSLoaderVariant, `M${number}`>

export const DEFAULT_LOADER_VARIANT: LoaderVariant = 'S2'

const LOADER_VARIANT_SET = new Set<string>(LOADER_VARIANTS)
const LEGACY_LOADER_VARIANT_SET = new Set<string>(LEGACY_LOADER_VARIANTS)

function isLegacyLoaderVariantValue(value: string): value is LegacyLoaderVariant {
  return LEGACY_LOADER_VARIANT_SET.has(value)
}

function isLoaderVariant(value: unknown): value is LoaderVariant {
  return typeof value === 'string' && LOADER_VARIANT_SET.has(value)
}

export function normalizeLoaderVariant(value: unknown): LoaderVariant {
  const withoutLegacyPrefix =
    typeof value === 'string' && value.startsWith('thinking-orb-')
      ? value.slice('thinking-orb-'.length)
      : value
  if (isLoaderVariant(withoutLegacyPrefix)) {
    return withoutLegacyPrefix
  }
  if (typeof withoutLegacyPrefix === 'string') {
    return isLegacyLoaderVariantValue(withoutLegacyPrefix)
      ? withoutLegacyPrefix
      : DEFAULT_LOADER_VARIANT
  }
  return DEFAULT_LOADER_VARIANT
}

export function isLegacyLoaderVariant(value: LoaderVariant): value is LegacyLoaderVariant {
  return isLegacyLoaderVariantValue(value)
}

export function isAICSSLoaderVariant(value: LoaderVariant): value is AICSSLoaderVariant {
  return !isLegacyLoaderVariant(value)
}

export function isLatticeVariant(value: LoaderVariant): value is LatticeVariant {
  return value.startsWith('S')
}

export function isLensVariant(value: LoaderVariant): value is LensVariant {
  return value.startsWith('B')
}

export function isRingVariant(value: LoaderVariant): value is RingVariant {
  return value.startsWith('C')
}

export function isMorphVariant(value: LoaderVariant): value is MorphVariant {
  return value.startsWith('M')
}

export const LOADER_STYLES = LOADER_VARIANTS
export type LoaderStyle = LoaderVariant
export const DEFAULT_LOADER_STYLE: LoaderStyle = DEFAULT_LOADER_VARIANT
export const normalizeLoaderStyle = normalizeLoaderVariant
