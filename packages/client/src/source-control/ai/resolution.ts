import {
  resolveSourceControlAiForOperation as resolveOperation,
  type ResolveSourceControlAiInput,
  type ResolveSourceControlAiResult
} from '@yiru/protocol/source-control/resolution'

import { localizeGenerationFailure } from './failure-copy'

export function resolveSourceControlAiForOperation(
  input: ResolveSourceControlAiInput
): ResolveSourceControlAiResult {
  const result = resolveOperation(input)
  return result.ok ? result : { ...result, error: localizeGenerationFailure(result.reason) }
}
