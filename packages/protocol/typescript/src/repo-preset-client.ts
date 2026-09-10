import { create, fromBinary, toBinary } from '@bufbuild/protobuf'

import {
  RepoService,
  RepoServiceRemoveSparsePresetRequestSchema,
  RepoServiceRemoveSparsePresetResponseSchema,
  RepoServiceSaveSparsePresetRequestSchema,
  RepoServiceSaveSparsePresetResponseSchema,
  RepoServiceSparsePresetsRequestSchema,
  RepoServiceSparsePresetsResponseSchema
} from '../generated/agent_start/runtime/v1/repo_pb.js'
import { RepoHooksClient } from './repo-hooks-client.js'
import { sparsePreset } from './repo-preset-values.js'
import { required } from './repo-refs-client.js'
import type {
  RepoSaveSparsePresetInput,
  RepoSelectorInput,
  RepoSparsePresetResult,
  RepoSparsePresetsResult
} from './repo-types.js'
import type { RuntimeCallOptions } from './transport.js'

const SPARSE_PRESETS = `/${RepoService.typeName}/${RepoService.method.sparsePresets.name}`
const SAVE_SPARSE_PRESET = `/${RepoService.typeName}/${RepoService.method.saveSparsePreset.name}`
const REMOVE_SPARSE_PRESET = `/${RepoService.typeName}/${RepoService.method.removeSparsePreset.name}`

export class RepoPresetClient extends RepoHooksClient {
  async sparsePresets(
    input: RepoSelectorInput,
    options?: RuntimeCallOptions
  ): Promise<RepoSparsePresetsResult> {
    const response = fromBinary(
      RepoServiceSparsePresetsResponseSchema,
      await this.transport.unary({
        method: SPARSE_PRESETS,
        payload: toBinary(
          RepoServiceSparsePresetsRequestSchema,
          create(RepoServiceSparsePresetsRequestSchema, {
            repo: required(input.repo, 'Repository selector')
          })
        ),
        ...(options ? { options } : {})
      })
    )
    return { presets: response.presets.map(sparsePreset) }
  }

  async saveSparsePreset(
    input: RepoSaveSparsePresetInput,
    options?: RuntimeCallOptions
  ): Promise<RepoSparsePresetResult> {
    const response = fromBinary(
      RepoServiceSaveSparsePresetResponseSchema,
      await this.transport.unary({
        method: SAVE_SPARSE_PRESET,
        payload: toBinary(
          RepoServiceSaveSparsePresetRequestSchema,
          create(RepoServiceSaveSparsePresetRequestSchema, {
            repo: required(input.repo, 'Repository selector'),
            ...(input.id === undefined ? {} : { id: input.id }),
            name: required(input.name, 'Preset name'),
            directories: [...input.directories]
          })
        ),
        ...(options ? { options } : {})
      })
    )
    if (!response.preset) {
      throw new TypeError('Sparse preset response is missing the preset')
    }
    return { preset: sparsePreset(response.preset) }
  }

  async removeSparsePreset(
    input: RepoSelectorInput & { presetId: string },
    options?: RuntimeCallOptions
  ): Promise<{ removed: boolean }> {
    const response = fromBinary(
      RepoServiceRemoveSparsePresetResponseSchema,
      await this.transport.unary({
        method: REMOVE_SPARSE_PRESET,
        payload: toBinary(
          RepoServiceRemoveSparsePresetRequestSchema,
          create(RepoServiceRemoveSparsePresetRequestSchema, {
            repo: required(input.repo, 'Repository selector'),
            presetId: required(input.presetId, 'Preset ID')
          })
        ),
        ...(options ? { options } : {})
      })
    )
    return { removed: response.removed }
  }
}
