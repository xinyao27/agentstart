import { create, fromBinary, toBinary } from '@bufbuild/protobuf'

import {
  GetSummaryRequestSchema,
  GetSummaryResponseSchema,
  StatsService,
  StatsUsageRange,
  type GetSummaryResponse
} from '../../generated/agent_start/runtime/v1/stats_pb.js'
import type { RuntimeCallOptions, RuntimeTransport } from '../transport.js'

const GET_SUMMARY_PROCEDURE = `/${StatsService.typeName}/${StatsService.method.getSummary.name}`

export type StatsSummaryInput = {
  refreshUsage?: boolean
  range?: '7d' | '30d' | '90d' | 'all'
}

export class StatsClient {
  private readonly transport: RuntimeTransport

  constructor(transport: RuntimeTransport) {
    this.transport = transport
  }

  async getSummary(
    input: StatsSummaryInput,
    options?: RuntimeCallOptions
  ): Promise<GetSummaryResponse> {
    const payload = toBinary(
      GetSummaryRequestSchema,
      create(GetSummaryRequestSchema, {
        refreshUsage: input.refreshUsage ?? false,
        range: protocolRange(input.range)
      })
    )
    const response = await this.transport.unary({
      method: GET_SUMMARY_PROCEDURE,
      payload,
      ...(options ? { options } : {})
    })
    return fromBinary(GetSummaryResponseSchema, response)
  }
}

function protocolRange(range: StatsSummaryInput['range']): StatsUsageRange {
  switch (range) {
    case '7d':
      return StatsUsageRange.SEVEN_DAYS
    case '30d':
      return StatsUsageRange.THIRTY_DAYS
    case '90d':
      return StatsUsageRange.NINETY_DAYS
    case 'all':
      return StatsUsageRange.ALL
    case undefined:
      return StatsUsageRange.UNSPECIFIED
  }
}
