import {
  OrchestrationServiceTaskCreateRequestSchema,
  OrchestrationServiceTaskCreateResponseSchema,
  OrchestrationServiceTaskListRequestSchema,
  OrchestrationServiceTaskListResponseSchema,
  OrchestrationServiceTaskUpdateRequestSchema,
  OrchestrationServiceTaskUpdateResponseSchema
} from '../../generated/yiru/runtime/v1/orchestration_pb.js'
import type { RuntimeCallOptions } from '../transport.js'
import { taskStatusValue } from './enum-values.js'
import { orchestrationMutation, orchestrationTask } from './response-values.js'
import { OrchestrationRunClient } from './run-client.js'
import type {
  OrchestrationMutation,
  OrchestrationTask,
  OrchestrationTaskStatusName
} from './values.js'

export class OrchestrationTaskClient extends OrchestrationRunClient {
  async taskCreate(
    input: {
      spec: string
      taskTitle?: string
      displayName?: string
      deps?: string[]
      parent?: string
      callerTerminalHandle?: string
      run?: string
    },
    options?: RuntimeCallOptions
  ): Promise<{ task: OrchestrationTask; mutation?: OrchestrationMutation }> {
    const response = await this.call(
      'taskCreate',
      OrchestrationServiceTaskCreateRequestSchema,
      { ...input, deps: input.deps ?? [] },
      OrchestrationServiceTaskCreateResponseSchema,
      options
    )
    return {
      task: orchestrationTask(response.task),
      mutation: orchestrationMutation(response.mutation)
    }
  }

  async taskList(
    input: {
      status?: OrchestrationTaskStatusName
      ready?: boolean
      brief?: boolean
      run?: string
      callerTerminalHandle?: string
    } = {},
    options?: RuntimeCallOptions
  ): Promise<{
    runId: string
    legacyReadOnly: boolean
    tasks: OrchestrationTask[]
    count: number
  }> {
    const response = await this.call(
      'taskList',
      OrchestrationServiceTaskListRequestSchema,
      {
        ...input,
        status: input.status ? taskStatusValue(input.status) : undefined,
        ready: input.ready ?? false,
        brief: input.brief ?? false
      },
      OrchestrationServiceTaskListResponseSchema,
      options
    )
    return {
      runId: response.runId,
      legacyReadOnly: response.legacyReadOnly,
      tasks: response.tasks.map(orchestrationTask),
      count: Number(response.count)
    }
  }

  async taskUpdate(
    input: {
      id: string
      status: OrchestrationTaskStatusName
      result?: string
      run?: string
      callerTerminalHandle?: string
    },
    options?: RuntimeCallOptions
  ): Promise<{ task: OrchestrationTask; mutation?: OrchestrationMutation }> {
    const response = await this.call(
      'taskUpdate',
      OrchestrationServiceTaskUpdateRequestSchema,
      { ...input, status: taskStatusValue(input.status) },
      OrchestrationServiceTaskUpdateResponseSchema,
      options
    )
    return {
      task: orchestrationTask(response.task),
      mutation: orchestrationMutation(response.mutation)
    }
  }
}
