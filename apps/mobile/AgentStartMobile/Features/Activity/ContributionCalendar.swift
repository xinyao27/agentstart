import Foundation
import SwiftUI

nonisolated struct ActivityContributionDay: Hashable, Identifiable, Sendable {
    let day: String
    let value: Double
    let intensity: Int
    let isFuture: Bool
    let date: Date
    var id: String { day }
}

nonisolated struct ActivityContributionWeek: Hashable, Identifiable, Sendable {
    let startDay: String
    let days: [ActivityContributionDay]
    var id: String { startDay }
}

nonisolated struct ActivityContributionTotals: Sendable {
    let today: Double
    let currentStreak: Int
    let longestStreak: Int
    let visibleTotal: Double
}

nonisolated func activityContributionWeeks(
    _ points: [ActivityDailyPoint],
    metric: ActivityMetric,
    now: Date = Date()
) -> [ActivityContributionWeek] {
    let calendar = Calendar.current
    let anchor = calendar.startOfDay(for: now)
    let weekday = calendar.component(.weekday, from: anchor)
    let currentWeekStart =
        calendar.date(byAdding: .day, value: -(weekday - 1), to: anchor) ?? anchor
    let gridStart =
        calendar.date(byAdding: .day, value: -(52 * 7), to: currentWeekStart)
        ?? currentWeekStart
    let values = contributionValues(points, metric: metric)
    let firstVisible = activityDayKey(gridStart)
    let lastVisible = activityDayKey(anchor)
    let maximum = values.reduce(0.0) { result, entry in
        entry.key >= firstVisible && entry.key <= lastVisible ? max(result, entry.value) : result
    }
    return (0..<53).map { weekIndex in
        let days = (0..<7).map { weekdayIndex in
            let offset = weekIndex * 7 + weekdayIndex
            let date = calendar.date(byAdding: .day, value: offset, to: gridStart) ?? gridStart
            let day = activityDayKey(date)
            let value = max(0, values[day] ?? 0)
            return ActivityContributionDay(
                day: day,
                value: value,
                intensity: contributionIntensity(value, maximum: maximum),
                isFuture: date > anchor,
                date: date
            )
        }
        return ActivityContributionWeek(startDay: days[0].day, days: days)
    }
}

nonisolated func activityContributionTotals(
    _ points: [ActivityDailyPoint],
    metric: ActivityMetric = .tokens,
    now: Date = Date()
) -> ActivityContributionTotals {
    let calendar = Calendar.current
    let anchor = calendar.startOfDay(for: now)
    let values = contributionValues(points, metric: metric)
    let today = values[activityDayKey(anchor)] ?? 0
    var longest = 0
    var running = 0
    var visibleTotal = 0.0
    for offset in stride(from: 365, through: 0, by: -1) {
        let date = calendar.date(byAdding: .day, value: -offset, to: anchor) ?? anchor
        let value = values[activityDayKey(date)] ?? 0
        visibleTotal += value
        if value > 0 {
            running += 1
            longest = max(longest, running)
        } else {
            running = 0
        }
    }
    let streakAnchor =
        today > 0
        ? anchor : calendar.date(byAdding: .day, value: -1, to: anchor) ?? anchor
    var current = 0
    for offset in 0...365 {
        let date = calendar.date(byAdding: .day, value: -offset, to: streakAnchor) ?? streakAnchor
        guard (values[activityDayKey(date)] ?? 0) > 0 else { break }
        current += 1
    }
    return ActivityContributionTotals(
        today: today,
        currentStreak: current,
        longestStreak: longest,
        visibleTotal: visibleTotal
    )
}

nonisolated private func contributionValues(
    _ points: [ActivityDailyPoint],
    metric: ActivityMetric
) -> [String: Double] {
    var values: [String: Double] = [:]
    for point in points {
        let value = activityMetricValue(metric, daily: point)
        guard value.isFinite, value > 0 else { continue }
        values[point.day, default: 0] += value
    }
    return values
}

nonisolated private func contributionIntensity(_ value: Double, maximum: Double) -> Int {
    guard value > 0, maximum > 0 else { return 0 }
    return min(4, max(1, Int(ceil((log1p(value) / log1p(maximum)) * 4))))
}

nonisolated func activityDayKey(_ date: Date) -> String {
    let components = Calendar.current.dateComponents([.year, .month, .day], from: date)
    return String(
        format: "%04d-%02d-%02d",
        components.year ?? 0,
        components.month ?? 0,
        components.day ?? 0
    )
}

struct ActivityContributionCard: View {
    let points: [ActivityDailyPoint]
    @Binding var metric: ActivityMetric
    @State private var selected: ActivityContributionDay?

    var body: some View {
        ContentSurface {
            VStack(alignment: .leading, spacing: Theme.Spacing.medium) {
                HStack(alignment: .top, spacing: Theme.Spacing.medium) {
                    VStack(alignment: .leading, spacing: Theme.Spacing.extraSmall) {
                        Text("Contribution history")
                            .font(
                                .system(
                                    size: Theme.Typography.primary,
                                    weight: .semibold
                                )
                            )
                        Text(description)
                            .font(.system(size: Theme.Typography.metadata))
                            .foregroundStyle(Theme.Colors.mutedForeground)
                    }
                    Spacer(minLength: 0)
                    Picker("Contribution metric", selection: $metric) {
                        Text(ActivityMetric.value.title).tag(ActivityMetric.value)
                        Text(ActivityMetric.tokens.title).tag(ActivityMetric.tokens)
                    }
                    .pickerStyle(.segmented)
                    .frame(width: 144)
                    .accessibilityLabel("Contribution metric")
                }
                ScrollViewReader { proxy in
                    ScrollView(.horizontal, showsIndicators: false) {
                        HStack(alignment: .top, spacing: 4) {
                            weekdayLabels
                            ForEach(weeks) { week in
                                VStack(spacing: 4) {
                                    ForEach(week.days) { day in
                                        contributionCell(day)
                                    }
                                }
                                .id(week.id)
                            }
                        }
                        .padding(.top, Theme.Spacing.standard)
                    }
                    .onAppear {
                        if let last = weeks.last { proxy.scrollTo(last.id, anchor: .trailing) }
                    }
                }
                HStack(spacing: Theme.Spacing.small) {
                    Text(footer)
                        .font(.system(size: Theme.Typography.metadata))
                        .foregroundStyle(Theme.Colors.mutedForeground)
                        .frame(maxWidth: .infinity, alignment: .leading)
                    Text("Less")
                        .font(.system(size: Theme.Typography.metadata))
                        .foregroundStyle(Theme.Colors.mutedForeground)
                    ForEach(0..<5, id: \.self) { intensity in
                        Rectangle()
                            .fill(color(intensity))
                            .frame(width: 8, height: 8)
                            .overlay {
                                Rectangle().stroke(
                                    Theme.Colors.divider,
                                    lineWidth: Theme.Size.hairline
                                )
                            }
                    }
                    Text("More")
                        .font(.system(size: Theme.Typography.metadata))
                        .foregroundStyle(Theme.Colors.mutedForeground)
                }
            }
        }
        .onChange(of: metric) { _, _ in selected = nil }
    }

    private var weeks: [ActivityContributionWeek] {
        activityContributionWeeks(points, metric: metric)
    }

    private var weekdayLabels: some View {
        VStack(spacing: Theme.Spacing.extraSmall) {
            ForEach(0..<7, id: \.self) { weekday in
                Text(weekday % 2 == 1 ? Calendar.current.veryShortWeekdaySymbols[weekday] : "")
                    .font(.system(size: Theme.Typography.metadata))
                    .foregroundStyle(Theme.Colors.mutedForeground)
                    .lineLimit(1)
                    .minimumScaleFactor(0.7)
                    .frame(width: Theme.Control.inlineIcon, height: 10)
            }
        }
        .padding(.trailing, 1)
    }

    private func contributionCell(_ day: ActivityContributionDay) -> some View {
        Button {
            guard !day.isFuture else { return }
            selected = day
        } label: {
            Rectangle()
                .fill(day.isFuture ? .clear : color(day.intensity))
                .frame(width: 10, height: 10)
                .overlay {
                    Rectangle().stroke(
                        selected?.day == day.day
                            ? Theme.Colors.foreground
                            : Theme.Colors.selection.opacity(day.isFuture ? 0 : 0.6),
                        lineWidth: selected?.day == day.day ? 1 : 0.5
                    )
                }
        }
        .buttonStyle(.appPlain)
        .disabled(day.isFuture)
        .accessibilityLabel("\(day.day): \(formatActivityMetric(day.value, metric: metric))")
    }

    private func color(_ intensity: Int) -> Color {
        switch intensity {
        case 1: Theme.Colors.mutedForeground.opacity(0.2)
        case 2: Theme.Colors.mutedForeground.opacity(0.35)
        case 3: Theme.Colors.mutedForeground.opacity(0.55)
        case 4: Theme.Colors.foreground.opacity(0.8)
        default: Theme.Colors.selection.opacity(0.4)
        }
    }

    private var footer: String {
        if let selected {
            return
                "\(selected.date.formatted(.dateTime.month(.abbreviated).day())): \(formatActivityMetric(selected.value, metric: metric))"
        }
        let totals = activityContributionTotals(points, metric: metric)
        return formatActivityMetric(totals.visibleTotal, metric: metric)
    }

    private var description: LocalizedStringResource {
        switch metric {
        case .tokens: "Provider-reported token usage attributed to AgentStart worktrees."
        case .value: "Standard global API-equivalent value calculated per request."
        }
    }
}
