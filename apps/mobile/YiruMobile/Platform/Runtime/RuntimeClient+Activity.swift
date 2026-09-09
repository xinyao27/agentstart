import Foundation
import YiruProtocol

extension RuntimeClient: ActivityStatsRepository {
    func activityStats(
        for hostID: String,
        range: ActivityUsageRange,
        refreshUsage: Bool
    ) async throws -> ActivityStatsSummary? {
        let response = try await protocolStatsSummary(
            hostID: hostID,
            range: protocolRange(range),
            refreshUsage: refreshUsage
        )
        return try mapActivityStats(response, requestedRange: range)
    }
}

nonisolated private func mapActivityStats(
    _ response: Yiru_Runtime_V1_GetSummaryResponse,
    requestedRange: ActivityUsageRange
) throws -> ActivityStatsSummary {
    var activities: [String: UInt64] = [:]
    var agentStarts: [String: UInt64] = [:]
    var prsCreated: [String: UInt64] = [:]
    for row in response.dailyActivity {
        let (activity, overflow) = row.agentStarts.addingReportingOverflow(row.prsCreated)
        guard !overflow else {
            throw RuntimeResponseValidationError("daily_activity")
        }
        try accumulate(activity, day: row.day, into: &activities, field: "daily_activity")
        try accumulate(
            row.agentStarts,
            day: row.day,
            into: &agentStarts,
            field: "daily_activity.agent_starts"
        )
        try accumulate(
            row.prsCreated,
            day: row.day,
            into: &prsCreated,
            field: "daily_activity.prs_created"
        )
    }

    var tokens: [String: UInt64] = [:]
    for row in response.dailyTokens {
        try accumulate(row.tokens, day: row.day, into: &tokens, field: "daily_tokens")
    }

    var values: [String: Double] = [:]
    for row in response.dailyValues {
        guard row.hasValueUsd else {
            throw RuntimeResponseValidationError("daily_values.value_usd")
        }
        try accumulateFinite(
            row.valueUsd,
            day: row.day,
            into: &values,
            field: "daily_values.value_usd"
        )
    }

    var unpricedTokens: [String: UInt64] = [:]
    for row in response.dailyUnpricedTokens {
        try accumulate(
            row.tokens,
            day: row.day,
            into: &unpricedTokens,
            field: "daily_unpriced_tokens"
        )
    }

    let days =
        Set(activities.keys).union(tokens.keys).union(values.keys).union(unpricedTokens.keys)
    let supplemental = response.supplementalUsage
    guard response.hasSupplementalUsage else {
        throw RuntimeResponseValidationError("supplemental_usage")
    }

    return ActivityStatsSummary(
        totalAgentsSpawned: try exact(response.totalAgentsSpawned, field: "total_agents_spawned"),
        totalPRsCreated: try exact(response.totalPrsCreated, field: "total_prs_created"),
        totalAgentTimeMS: try exact(response.totalAgentTimeMs, field: "total_agent_time_ms"),
        firstEventAt: try optionalFinite(
            response.firstEventAt,
            isPresent: response.hasFirstEventAt,
            field: "first_event_at"
        ),
        daily: try days.map { day in
            ActivityDailyPoint(
                day: day,
                activity: try exact(activities[day] ?? 0, field: "daily_activity"),
                agentStarts: try exact(
                    agentStarts[day] ?? 0,
                    field: "daily_activity.agent_starts"
                ),
                prsCreated: try exact(
                    prsCreated[day] ?? 0,
                    field: "daily_activity.prs_created"
                ),
                tokens: try exact(tokens[day] ?? 0, field: "daily_tokens"),
                unpricedTokens: try exact(
                    unpricedTokens[day] ?? 0,
                    field: "daily_unpriced_tokens"
                ),
                valueUSD: (unpricedTokens[day] ?? 0) > 0 ? nil : values[day]
            )
        }.sorted { $0.day < $1.day },
        dailyProviders: try response.dailyProviderUsage.map { usage in
            ActivityDailyProviderUsage(
                day: usage.day,
                providers: try usage.providers.compactMap(mapActivityProvider)
            )
        },
        models: try response.modelUsage.map(mapActivityModel),
        projects: try response.projectUsage.map(mapActivityProject),
        usageRange: try activityRange(response.usageRange, fallback: requestedRange),
        hasUsageValue: response.usageValueAvailable,
        hasUnpricedUsage: response.hasUnpricedUsage_p,
        tokenDataAvailable: response.tokenDataAvailable,
        tokenUnavailableAgents: try response.tokenUnavailableAgents.compactMap(
            activityUnavailableAgent
        ),
        supplementalUsage: ActivitySupplementalUsage(
            daily: try supplemental.dailyTokens.map(mapActivitySupplementalDaily),
            models: try supplemental.modelUsage.map(mapActivityModel),
            meteredValueUSD: try optionalFinite(
                supplemental.meteredValueUsd,
                isPresent: supplemental.hasMeteredValueUsd,
                field: "supplemental_usage.metered_value_usd"
            )
        )
    )
}

nonisolated private func protocolRange(
    _ range: ActivityUsageRange
) -> Yiru_Runtime_V1_StatsUsageRange {
    switch range {
    case .sevenDays: .sevenDays
    case .thirtyDays: .thirtyDays
    case .ninetyDays: .ninetyDays
    }
}

nonisolated private func activityRange(
    _ range: Yiru_Runtime_V1_StatsUsageRange,
    fallback: ActivityUsageRange
) throws -> String {
    switch range {
    case .sevenDays: "7d"
    case .thirtyDays: "30d"
    case .ninetyDays: "90d"
    case .all: "all"
    case .UNRECOGNIZED: activityRangeName(fallback)
    case .unspecified:
        throw RuntimeResponseValidationError("usage_range")
    }
}

nonisolated private func activityRangeName(_ range: ActivityUsageRange) -> String {
    switch range {
    case .sevenDays: "7d"
    case .thirtyDays: "30d"
    case .ninetyDays: "90d"
    }
}

nonisolated private func mapActivityProvider(
    _ usage: Yiru_Runtime_V1_StatsProviderUsage
) throws -> ActivityProviderUsage? {
    guard let provider = try activityProvider(usage.provider) else { return nil }
    return ActivityProviderUsage(
        provider: provider,
        tokens: try exact(usage.tokens, field: "provider_usage.tokens"),
        valueUSD: try optionalFinite(
            usage.valueUsd,
            isPresent: usage.hasValueUsd,
            field: "provider_usage.value_usd"
        )
    )
}

nonisolated private func activityProvider(
    _ provider: Yiru_Runtime_V1_StatsUsageProvider
) throws -> String? {
    switch provider {
    case .claude: "claude"
    case .codex: "codex"
    case .openCode: "open-code"
    case .UNRECOGNIZED: nil
    case .unspecified:
        throw RuntimeResponseValidationError("provider_usage.provider")
    }
}

nonisolated private func mapActivityModel(
    _ usage: Yiru_Runtime_V1_StatsModelUsage
) throws -> ActivityBreakdown {
    ActivityBreakdown(
        id: usage.key,
        label: usage.label,
        sessions: nil,
        tokens: try exact(usage.tokens, field: "model_usage.tokens"),
        valueUSD: try optionalFinite(
            usage.valueUsd,
            isPresent: usage.hasValueUsd,
            field: "model_usage.value_usd"
        ),
        providers: []
    )
}

nonisolated private func mapActivityProject(
    _ usage: Yiru_Runtime_V1_StatsProjectUsage
) throws -> ActivityBreakdown {
    ActivityBreakdown(
        id: usage.key,
        label: usage.label,
        sessions: try exact(usage.sessions, field: "project_usage.sessions"),
        tokens: try exact(usage.tokens, field: "project_usage.tokens"),
        valueUSD: try optionalFinite(
            usage.valueUsd,
            isPresent: usage.hasValueUsd,
            field: "project_usage.value_usd"
        ),
        providers: try usage.providers.compactMap(mapActivityProvider)
    )
}

nonisolated private func mapActivitySupplementalDaily(
    _ usage: Yiru_Runtime_V1_StatsSupplementalDailyUsage
) throws -> ActivitySupplementalDailyUsage {
    ActivitySupplementalDailyUsage(
        day: usage.day,
        tokens: try exact(usage.tokens, field: "supplemental_usage.daily_tokens.tokens"),
        valueUSD: try optionalFinite(
            usage.valueUsd,
            isPresent: usage.hasValueUsd,
            field: "supplemental_usage.daily_tokens.value_usd"
        ),
        unpricedTokens: try exact(
            usage.unpricedTokens,
            field: "supplemental_usage.daily_tokens.unpriced_tokens"
        )
    )
}

nonisolated private func activityUnavailableAgent(
    _ agent: Yiru_Runtime_V1_StatsUnavailableAgent
) throws -> String? {
    switch agent {
    case .antigravity: "antigravity"
    case .cursor: "cursor"
    case .hermes: "hermes"
    case .rovo: "rovo"
    case .UNRECOGNIZED: nil
    case .unspecified: throw RuntimeResponseValidationError("token_unavailable_agents")
    }
}

nonisolated private func exact(_ value: UInt64, field: String) throws -> Double {
    guard let number = Double(exactly: value) else {
        throw RuntimeResponseValidationError(field)
    }
    return number
}

nonisolated private func optionalFinite(
    _ value: Double,
    isPresent: Bool,
    field: String
) throws -> Double? {
    guard isPresent else { return nil }
    return try finite(value, field: field)
}

nonisolated private func finite(_ value: Double, field: String) throws -> Double {
    guard value.isFinite else {
        throw RuntimeResponseValidationError(field)
    }
    return value
}

nonisolated private func accumulate(
    _ value: UInt64,
    day: String,
    into values: inout [String: UInt64],
    field: String
) throws {
    let (total, overflow) = values[day, default: 0].addingReportingOverflow(value)
    guard !overflow else { throw RuntimeResponseValidationError(field) }
    values[day] = total
}

nonisolated private func accumulateFinite(
    _ value: Double,
    day: String,
    into values: inout [String: Double],
    field: String
) throws {
    let total = values[day, default: 0] + (try finite(value, field: field))
    values[day] = try finite(total, field: field)
}
