import SwiftUI

struct ActivityUsageCoverage: View {
    let summary: ActivityStatsSummary
    let metric: ActivityMetric

    var body: some View {
        VStack(alignment: .leading, spacing: Theme.Spacing.small) {
            Text(coverageMessage)
            if let meteredValue = summary.supplementalUsage?.meteredValueUSD {
                Text(
                    "Cursor-metered spend: \(formatMeteredValue(meteredValue)) (actual plan deduction; API value above is a list-price estimate)."
                )
            }
        }
        .font(.system(size: Theme.Typography.metadata))
        .foregroundStyle(Theme.Colors.mutedForeground)
    }

    private var hasTokens: Bool {
        summary.daily.contains { $0.tokens > 0 }
    }

    private var coverageMessage: LocalizedStringResource {
        if !hasTokens {
            return
                "No provider-reported token usage attributed to AgentStart worktrees is available yet."
        }
        if metric == .value {
            return summary.hasUsageValue
                ? "API-equivalent value uses authoritative per-request model pricing. Unpriced categories are excluded; this is not a bill."
                : "No known model pricing is available for this estimate yet."
        }
        if summary.hasUnpricedUsage {
            return
                "Token totals use request-attributed records from supported agents in AgentStart worktrees. Tokens without authoritative pricing are excluded from value totals."
        }
        return
            "Token totals use request-attributed records from supported agents in AgentStart worktrees."
    }

    private func formatMeteredValue(_ value: Double) -> String {
        value.formatted(.currency(code: "USD").precision(.fractionLength(2)))
    }
}
