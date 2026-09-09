import { FEATURE_INTERACTION_IDS, type FeatureInteractionId } from './catalog'
import {
  isFeatureInteractionUsageBucket,
  type FeatureInteractionUsageBucket
} from './usage-buckets'

export type FeatureInteractionRecord = {
  /** Unix timestamp in milliseconds for the first local interaction. */
  firstInteractedAt: number
  /** Number of local interactions recorded for this feature. */
  interactionCount: number
}

export type FeatureInteractionState = Partial<
  Record<FeatureInteractionId, FeatureInteractionRecord>
>

export type FeatureInteractionTelemetryBucketState = Partial<
  Record<FeatureInteractionId, FeatureInteractionUsageBucket>
>

export function isFeatureInteractionId(value: unknown): value is FeatureInteractionId {
  return typeof value === 'string' && FEATURE_INTERACTION_IDS.some((id) => id === value)
}

export function hasFeatureInteraction(
  state: FeatureInteractionState | null | undefined,
  id: FeatureInteractionId
): boolean {
  return normalizeFeatureInteractionRecord(state?.[id]) !== null
}

export function normalizeFeatureInteractionTelemetryBuckets(
  value: unknown
): FeatureInteractionTelemetryBucketState {
  if (value === null || typeof value !== 'object' || Array.isArray(value)) {
    return {}
  }

  const out: FeatureInteractionTelemetryBucketState = {}
  for (const id of FEATURE_INTERACTION_IDS) {
    const bucket = Reflect.get(value, id)
    if (isFeatureInteractionUsageBucket(bucket)) {
      out[id] = bucket
    }
  }
  return out
}

export function normalizeFeatureInteractions(value: unknown): FeatureInteractionState {
  if (value === null || typeof value !== 'object' || Array.isArray(value)) {
    return {}
  }

  const out: FeatureInteractionState = {}
  for (const id of FEATURE_INTERACTION_IDS) {
    const record = normalizeFeatureInteractionRecord(Reflect.get(value, id))
    if (record) {
      out[id] = record
    }
  }
  return out
}

function normalizeFeatureInteractionRecord(value: unknown): FeatureInteractionRecord | null {
  if (value === null || typeof value !== 'object' || Array.isArray(value)) {
    return null
  }
  const firstInteractedAt = Reflect.get(value, 'firstInteractedAt')
  if (
    typeof firstInteractedAt !== 'number' ||
    !Number.isFinite(firstInteractedAt) ||
    firstInteractedAt < 0
  ) {
    return null
  }
  const rawInteractionCount = Reflect.get(value, 'interactionCount')
  const interactionCount =
    typeof rawInteractionCount === 'number' &&
    Number.isInteger(rawInteractionCount) &&
    rawInteractionCount > 0
      ? rawInteractionCount
      : 1
  return { firstInteractedAt, interactionCount }
}
