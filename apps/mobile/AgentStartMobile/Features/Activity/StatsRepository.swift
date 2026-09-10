nonisolated protocol ActivityStatsRepository: Sendable {
    func activityStats(
        for hostID: String,
        range: ActivityUsageRange,
        refreshUsage: Bool
    ) async throws -> ActivityStatsSummary?
}
