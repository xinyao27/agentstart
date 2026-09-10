import Foundation
import WidgetKit

@MainActor
struct WidgetSnapshotWriter {
    func write(_ home: HomeSnapshot, now: Date = .now) {
        let snapshot = AgentStartWidgetSnapshot(
            providers: [
                AgentStartWidgetProvider.claude.rawValue: providerSnapshot(.claude, home: home),
                AgentStartWidgetProvider.codex.rawValue: providerSnapshot(.codex, home: home),
            ],
            savedAt: now,
            tokens: tokenSnapshot(home: home, now: now)
        )
        AgentStartWidgetSnapshotStore.save(snapshot)
        WidgetCenter.shared.reloadAllTimelines()
    }

    private func providerSnapshot(
        _ provider: AccountProvider,
        home: HomeSnapshot
    ) -> ProviderWidgetSnapshot {
        let sources = home.hosts.compactMap { host -> ProviderSource? in
            guard
                let section = host.accounts?.sections.first(where: { $0.provider == provider })
            else { return nil }
            return ProviderSource(host: host.host, usage: section.usage)
        }
        let source = sources.max {
            ($0.usage?.updatedAt ?? .distantPast) < ($1.usage?.updatedAt ?? .distantPast)
        }
        let session = source?.usage?.windows.first { $0.id == "session" }
        let weekly = source?.usage?.windows.first { $0.id == "weekly" }
        return ProviderWidgetSnapshot(
            name: provider == .claude ? "Claude" : "ChatGPT",
            openURL: source.map { appURL(path: "/h/\($0.host.id)/accounts") }
                ?? appURL(path: "/"),
            sessionResetsAt: session?.resetsAt,
            sessionUsedPercent: session?.usedPercent,
            updatedAt: source?.usage?.updatedAt,
            weeklyResetsAt: weekly?.resetsAt,
            weeklyUsedPercent: weekly?.usedPercent
        )
    }

    private func tokenSnapshot(home: HomeSnapshot, now: Date) -> TokenWidgetSnapshot {
        let summary = ActivityStatsSummary.aggregate(home.hosts.compactMap(\.activityStats))
        let calendar = Calendar.autoupdatingCurrent
        let today = calendar.startOfDay(for: now)
        let weekday = calendar.component(.weekday, from: today)
        let daysSinceMonday = (weekday + 5) % 7
        let weekStart = calendar.date(byAdding: .day, value: -daysSinceMonday, to: today) ?? today
        let todayKey = dayKey(today, calendar: calendar)
        let weekStartKey = dayKey(weekStart, calendar: calendar)
        let weekPoints =
            summary?.daily.filter { $0.day >= weekStartKey && $0.day <= todayKey } ?? []
        let todayPoint = summary?.daily.first { $0.day == todayKey }
        return TokenWidgetSnapshot(
            openURL: appURL(path: "/activity-insights"),
            todayTokens: todayPoint?.tokens ?? 0,
            todayValueUSD: todayPoint?.valueUSD ?? 0,
            weekTokens: weekPoints.reduce(0) { $0 + $1.tokens },
            weekValueUSD: weekPoints.reduce(0) { $0 + ($1.valueUSD ?? 0) }
        )
    }

    private func dayKey(_ date: Date, calendar: Calendar) -> String {
        let components = calendar.dateComponents([.year, .month, .day], from: date)
        return String(
            format: "%04d-%02d-%02d",
            components.year ?? 0,
            components.month ?? 0,
            components.day ?? 0
        )
    }

    private func appURL(path: String) -> URL {
        var components = URLComponents()
        components.scheme = "agentstart"
        components.path = path
        return components.url ?? URL(fileURLWithPath: "/")
    }
}

nonisolated private struct ProviderSource: Sendable {
    let host: HostProfile
    let usage: AccountProviderUsage?
}
