import { create, fromBinary, toBinary } from '@bufbuild/protobuf'

import {
  RepoService,
  RepoServiceHooksCheckRequestSchema,
  RepoServiceHooksCheckResponseSchema,
  RepoServiceHooksRequestSchema,
  RepoServiceHooksResponseSchema,
  RepoServiceSetupScriptImportsRequestSchema,
  RepoServiceSetupScriptImportsResponseSchema
} from '../generated/agent_start/runtime/v1/repo_pb.js'
import {
  repoHooks,
  repoHooksCheck,
  setupScriptImports as setupImportCandidates
} from './repo-hooks-values.js'
import { RepoRefsClient, required } from './repo-refs-client.js'
import type {
  RepoHooksCheckInput,
  RepoHooksCheckResult,
  RepoHooksValue,
  RepoSelectorInput,
  RepoSetupImportCandidateValue
} from './repo-types.js'
import type { RuntimeCallOptions } from './transport.js'

const HOOKS = `/${RepoService.typeName}/${RepoService.method.hooks.name}`
const HOOKS_CHECK = `/${RepoService.typeName}/${RepoService.method.hooksCheck.name}`
const SETUP_SCRIPT_IMPORTS = `/${RepoService.typeName}/${RepoService.method.setupScriptImports.name}`

export class RepoHooksClient extends RepoRefsClient {
  async hooks(input: RepoSelectorInput, options?: RuntimeCallOptions): Promise<RepoHooksValue> {
    const response = fromBinary(
      RepoServiceHooksResponseSchema,
      await this.transport.unary({
        method: HOOKS,
        payload: toBinary(
          RepoServiceHooksRequestSchema,
          create(RepoServiceHooksRequestSchema, {
            repo: required(input.repo, 'Repository selector')
          })
        ),
        ...(options ? { options } : {})
      })
    )
    return repoHooks(response)
  }

  async hooksCheck(
    input: RepoHooksCheckInput,
    options?: RuntimeCallOptions
  ): Promise<RepoHooksCheckResult> {
    const response = fromBinary(
      RepoServiceHooksCheckResponseSchema,
      await this.transport.unary({
        method: HOOKS_CHECK,
        payload: toBinary(
          RepoServiceHooksCheckRequestSchema,
          create(RepoServiceHooksCheckRequestSchema, {
            repo: required(input.repo, 'Repository selector'),
            ...(input.hostId === undefined ? {} : { hostId: input.hostId })
          })
        ),
        ...(options ? { options } : {})
      })
    )
    return repoHooksCheck(response)
  }

  async setupScriptImports(
    input: RepoSelectorInput,
    options?: RuntimeCallOptions
  ): Promise<RepoSetupImportCandidateValue[]> {
    const response = fromBinary(
      RepoServiceSetupScriptImportsResponseSchema,
      await this.transport.unary({
        method: SETUP_SCRIPT_IMPORTS,
        payload: toBinary(
          RepoServiceSetupScriptImportsRequestSchema,
          create(RepoServiceSetupScriptImportsRequestSchema, {
            repo: required(input.repo, 'Repository selector')
          })
        ),
        ...(options ? { options } : {})
      })
    )
    return setupImportCandidates(response)
  }
}
