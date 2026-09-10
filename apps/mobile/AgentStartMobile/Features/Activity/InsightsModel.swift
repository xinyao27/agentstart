import Foundation
import Observation

nonisolated enum ActivityInsightsPhase: Sendable {
    case loading
    case ready
    case failed(String)
}

@Observable
@MainActor
final class ActivityInsightsModel {
    private(set) var phase = ActivityInsightsPhase.loading
    private(set) var summary: ActivityStatsSummary?
    private(set) var isRefreshing = false
    private(set) var loadedRange: ActivityUsageRange?
    var range: ActivityUsageRange {
        didSet {
            defaults.set(range.rawValue, forKey: rangeKey)
            Task { await refresh() }
        }
    }
    var metric: ActivityMetric {
        didSet { defaults.set(metric.rawValue, forKey: metricKey) }
    }

    @ObservationIgnored private let hosts: any HostRepository
    @ObservationIgnored private let connectionRuntime: any HostConnectionRuntime
    @ObservationIgnored private let repository: any ActivityStatsRepository
    @ObservationIgnored private let snapshotCache: HomeSnapshotCache?
    @ObservationIgnored private let defaults: UserDefaults
    @ObservationIgnored private let rangeKey = "agentstart:home-usage-range:v1"
    @ObservationIgnored private let metricKey = "agentstart:activity-metric:v1"
    @ObservationIgnored private let cacheKey = "agentstart:activity-insights-cache:v1"
    @ObservationIgnored private var hostProfiles: [HostProfile] = []
    @ObservationIgnored private var didLoadHosts = false
    @ObservationIgnored private var connections: [String: RuntimeConnectionSnapshot] = [:]

    init(
        hosts: any HostRepository,
        connectionRuntime: any HostConnectionRuntime,
        repository: any ActivityStatsRepository,
        snapshotCache: HomeSnapshotCache? = nil,
        defaults: UserDefaults = .standard
    ) {
        self.hosts = hosts
        self.connectionRuntime = connectionRuntime
        self.repository = repository
        self.snapshotCache = snapshotCache
        self.defaults = defaults
        range =
            ActivityUsageRange(rawValue: defaults.string(forKey: rangeKey) ?? "")
            ?? .thirtyDays
        metric = ActivityMetric(rawValue: defaults.string(forKey: metricKey) ?? "") ?? .tokens
        if let cached = snapshotCache?.load(),
            let aggregate = ActivityStatsSummary.aggregate(Array(cached.activityStats.values))
        {
            summary = aggregate
            loadedRange = aggregate.usageRange.flatMap(ActivityUsageRange.init(rawValue:))
            phase = .ready
        }
        if let data = defaults.data(forKey: cacheKey),
            let cached = try? JSONDecoder().decode(ActivityStatsSummary.self, from: data)
        {
            summary = cached
            loadedRange = cached.usageRange.flatMap(ActivityUsageRange.init(rawValue:))
            phase = .ready
        }
    }

    var isUsageRangePending: Bool { loadedRange != range }

    var didReceiveAllTimeUsage: Bool {
        guard loadedRange == range, let summary else { return false }
        return summary.usageRange != range.rawValue
    }

    func observe() async {
        guard await loadHosts() else { return }
        if summary == nil, connectedHostIDs.isEmpty {
            phase = .ready
        }
        let stream = await connectionRuntime.connectionSnapshots(
            forHostIDs: hostProfiles.map(\.id)
        )
        for await snapshots in stream {
            guard !Task.isCancelled else { return }
            let wasConnected = connectedHostIDs
            connections = snapshots
            if wasConnected != connectedHostIDs || (summary == nil && !connectedHostIDs.isEmpty) {
                await refresh()
            }
        }
    }

    func refresh() async {
        guard !isRefreshing else { return }
        guard await loadHosts() else { return }
        let connectedHostIDs = connectedHostIDs
        guard !connectedHostIDs.isEmpty else {
            // Why: render the empty aggregate while every host is disconnected. Keeping the
            // loading phase here would pin a full-screen spinner over a route that must stay
            // dismissible during reconnect.
            if summary == nil { phase = .ready }
            return
        }
        isRefreshing = true
        if summary == nil { phase = .loading }
        defer { isRefreshing = false }
        let profiles = hostProfiles
        let repository = self.repository
        while !Task.isCancelled {
            let selectedRange = range
            let summaries = await withTaskGroup(
                of: ActivityStatsSummary?.self,
                returning: [ActivityStatsSummary].self
            ) { group in
                for profile in profiles where connectedHostIDs.contains(profile.id) {
                    group.addTask {
                        try? await repository.activityStats(
                            for: profile.id,
                            range: selectedRange,
                            refreshUsage: true
                        )
                    }
                }
                var values: [ActivityStatsSummary] = []
                for await value in group {
                    if let value { values.append(value) }
                }
                return values
            }
            // Why: child repository calls intentionally collapse transport failures to nil
            // so one unreachable host does not hide other hosts' usage. A cancelled route
            // must still discard that aggregate instead of turning cancellation into an
            // empty summary or a false "no activity" error.
            guard !Task.isCancelled else { return }
            loadedRange = selectedRange
            if let combined = ActivityStatsSummary.aggregate(summaries) {
                summary = combined
                phase = .ready
                if let data = try? JSONEncoder().encode(combined) {
                    defaults.set(data, forKey: cacheKey)
                }
            } else if summary == nil {
                phase = .failed(String(localized: "No activity data available"))
            }
            if selectedRange == range { return }
        }
    }

    private var connectedHostIDs: Set<String> {
        Set(
            hostProfiles.compactMap { profile in
                connections[profile.id]?.phase == .connected ? profile.id : nil
            }
        )
    }

    private func loadHosts() async -> Bool {
        guard !didLoadHosts else { return true }
        do {
            hostProfiles = try await hosts.hosts()
            didLoadHosts = true
            return true
        } catch {
            if summary == nil {
                phase = .failed(String(localized: "Unable to read saved daemon hosts"))
            }
            return false
        }
    }
}
