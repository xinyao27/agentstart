import Charts
import SwiftUI

struct ActivityInsightsView: View {
    @Environment(\.dismiss) private var dismiss
    @Environment(\.scenePhase) private var scenePhase
    @State private var model: ActivityInsightsModel

    init(
        hosts: any HostRepository,
        connectionRuntime: any HostConnectionRuntime,
        repository: any ActivityStatsRepository,
        snapshotCache: HomeSnapshotCache? = nil,
        defaults: UserDefaults = .standard
    ) {
        _model = State(
            initialValue: ActivityInsightsModel(
                hosts: hosts,
                connectionRuntime: connectionRuntime,
                repository: repository,
                snapshotCache: snapshotCache,
                defaults: defaults
            )
        )
    }

    var body: some View {
        ScrollView {
            LazyVStack(alignment: .leading, spacing: Theme.Spacing.standard) {
                Text("A year of agent work, with today in context.")
                    .font(.system(size: Theme.Typography.supporting))
                    .foregroundStyle(Theme.Colors.mutedForeground)
                summaryGrid
                rangeFilter
                usageRangeNotice
                ActivityContributionCard(
                    points: model.summary?.daily ?? [],
                    metric: $model.metric
                )
                if let summary = model.summary {
                    ActivityUsageCoverage(summary: summary, metric: model.metric)
                }
                trendCard
                rhythmCard
                if let summary = model.summary {
                    providerCard(summary.dailyProviders)
                    ActivityBreakdownList(
                        title: "By model",
                        metric: model.metric,
                        values: summary.models
                    )
                    ActivityBreakdownList(
                        title: "By project",
                        metric: model.metric,
                        values: summary.projects,
                        showsSearch: true
                    )
                }
            }
            .frame(maxWidth: Theme.Size.readingWidth)
            .padding(Theme.Spacing.page)
            .frame(maxWidth: .infinity)
        }
        .background { AppBackground() }
        .navigationTitle(Text("Activity insights"))
        .navigationBarTitleDisplayMode(.inline)
        .navigationBarBackButtonHidden(true)
        .toolbar {
            SheetDismissToolbarItem(
                accessibilityLabel: "Close activity insights",
                action: dismiss.callAsFunction
            )
        }
        .refreshable { await model.refresh() }
        .overlay {
            if case .loading = model.phase, model.summary == nil {
                AgentStartLoader(size: Theme.Control.largeIcon)
            }
        }
        .task {
            await model.observe()
        }
        .task(id: scenePhase) {
            guard scenePhase == .active else { return }
            while !Task.isCancelled {
                try? await Task.sleep(for: .seconds(60))
                guard !Task.isCancelled, scenePhase == .active else { return }
                await model.refresh()
            }
        }
        .onChange(of: scenePhase) { _, phase in
            guard phase == .active else { return }
            Task { await model.refresh() }
        }
    }

    private var summaryGrid: some View {
        let summary = model.summary
        return ContentSurface {
            LazyVGrid(
                columns: [GridItem(.flexible(), spacing: 1), GridItem(.flexible())],
                spacing: 1
            ) {
                summaryMetric(
                    "Agents spawned",
                    summary.map { Int($0.totalAgentsSpawned).formatted() } ?? "—")
                summaryMetric(
                    "Time agents worked",
                    summary.map { formatAgentDuration($0.totalAgentTimeMS) } ?? "—")
                summaryMetric(
                    "PRs created", summary.map { Int($0.totalPRsCreated).formatted() } ?? "—")
                summaryMetric(metricSummaryTitle, metricSummaryValue)
            }
            .background(Theme.Colors.selection)
        }
    }

    // Why: the usage range is an always-visible segmented control (7 / 30 / 90 days), not
    // a collapsed menu, so every option stays one tap away.
    private var rangeFilter: some View {
        Picker("Usage range", selection: $model.range) {
            ForEach(ActivityUsageRange.allCases, id: \.self) { range in
                Text(range.title).tag(range)
            }
        }
        .pickerStyle(.segmented)
        .frame(minHeight: Theme.Size.minimumHitTarget)
        .accessibilityLabel("Usage range")
    }

    @ViewBuilder private var usageRangeNotice: some View {
        if model.isUsageRangePending {
            Text("Updating usage for the selected range…")
                .font(.system(size: Theme.Typography.metadata))
                .foregroundStyle(Theme.Colors.mutedForeground)
        } else if model.didReceiveAllTimeUsage {
            Text("A connected host reported all-time usage instead of this range.")
                .font(.system(size: Theme.Typography.metadata))
                .foregroundStyle(Theme.Colors.mutedForeground)
        }
    }

    private var trendCard: some View {
        ContentSurface {
            VStack(alignment: .leading, spacing: Theme.Spacing.medium) {
                Text("30-day momentum")
                    .font(
                        .system(size: Theme.Typography.primary, weight: .semibold)
                    )
                Text(trendDescription)
                    .font(.system(size: Theme.Typography.metadata))
                    .foregroundStyle(Theme.Colors.mutedForeground)
                Chart(Array((model.summary?.daily ?? []).suffix(30))) { point in
                    AreaMark(
                        x: .value("Day", point.day),
                        y: .value("Value", activityMetricValue(model.metric, daily: point))
                    )
                    .foregroundStyle(Theme.Colors.mutedForeground.opacity(0.16))
                    LineMark(
                        x: .value("Day", point.day),
                        y: .value("Value", activityMetricValue(model.metric, daily: point))
                    )
                    .foregroundStyle(Theme.Colors.mutedForeground)
                }
                .chartXAxis(.hidden)
                .chartYAxis(.hidden)
                .frame(height: 132)
            }
        }
    }

    private var rhythmCard: some View {
        ContentSurface {
            VStack(alignment: .leading, spacing: Theme.Spacing.medium) {
                Text("Weekly rhythm")
                    .font(
                        .system(size: Theme.Typography.primary, weight: .semibold)
                    )
                Text("Past-year totals reveal which days carry the most work.")
                    .font(.system(size: Theme.Typography.metadata))
                    .foregroundStyle(Theme.Colors.mutedForeground)
                Chart(weekdayRhythm) { point in
                    BarMark(
                        x: .value("Weekday", point.label),
                        y: .value("Value", point.value)
                    )
                    .foregroundStyle(Theme.Colors.mutedForeground)
                }
                .chartYAxis(.hidden)
                .frame(height: 132)
            }
        }
    }

    private func providerCard(_ values: [ActivityDailyProviderUsage]) -> some View {
        ContentSurface {
            VStack(alignment: .leading, spacing: Theme.Spacing.medium) {
                Text("Daily usage by provider")
                    .font(
                        .system(size: Theme.Typography.primary, weight: .semibold)
                    )
                Chart {
                    ForEach(values) { day in
                        ForEach(day.providers) { provider in
                            BarMark(
                                x: .value("Day", day.day),
                                y: .value("Usage", providerMetric(provider))
                            )
                            .foregroundStyle(
                                Theme.Colors.mutedForeground.opacity(
                                    activityProviderOpacity(provider.provider)
                                )
                            )
                        }
                    }
                }
                .chartXAxis(.hidden)
                .chartYAxis(.hidden)
                .frame(height: 120)
                ForEach(["claude", "codex", "open-code"], id: \.self) { provider in
                    HStack(spacing: Theme.Spacing.small) {
                        Rectangle()
                            .fill(
                                Theme.Colors.mutedForeground.opacity(
                                    activityProviderOpacity(provider))
                            )
                            .frame(width: 8, height: 8)
                        Text(activityProviderLabel(provider))
                            .font(.system(size: Theme.Typography.metadata))
                            .foregroundStyle(Theme.Colors.mutedForeground)
                    }
                }
            }
        }
    }

    private func summaryMetric(_ label: LocalizedStringResource, _ value: String) -> some View {
        VStack(spacing: Theme.Spacing.extraSmall) {
            Text(value)
                .font(.system(size: Theme.Typography.primary))
                .monospacedDigit()
            Text(label)
                .font(.system(size: Theme.Typography.metadata))
                .foregroundStyle(Theme.Colors.mutedForeground)
                .multilineTextAlignment(.center)
        }
        .frame(maxWidth: .infinity, minHeight: 66)
        .padding(.horizontal, Theme.Spacing.small)
        .background(Theme.Colors.content)
    }

    private var metricSummaryValue: String {
        guard let summary = model.summary else { return "—" }
        if model.metric == .value, !summary.hasUsageValue { return "Not available" }
        let value = summary.daily.reduce(0) { $0 + activityMetricValue(model.metric, daily: $1) }
        return formatActivityMetric(value, metric: model.metric)
    }

    private var metricSummaryTitle: LocalizedStringResource {
        switch model.metric {
        case .tokens: "Total tokens"
        case .value: "API value"
        }
    }

    private var trendDescription: LocalizedStringResource {
        switch model.metric {
        case .tokens: "Token volume across the selected range."
        case .value: "Known API-equivalent value; unpriced usage is excluded."
        }
    }

    private func providerMetric(_ provider: ActivityProviderUsage) -> Double {
        model.metric == .tokens ? provider.tokens : (provider.valueUSD ?? 0)
    }

    private var weekdayRhythm: [ActivityWeekdayPoint] {
        activityWeekdayRhythm(model.summary?.daily ?? [], metric: model.metric)
    }
}
