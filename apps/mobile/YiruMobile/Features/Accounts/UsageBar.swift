import SwiftUI

struct AccountUsageBar: View {
    let window: AccountUsageWindow
    let now: Date
    var density: AccountUsageBarDensity = .detail

    var body: some View {
        switch density {
        case .compact:
            compactBar
        case .detail:
            detailBar
        }
    }

    private var compactBar: some View {
        VStack(alignment: .leading, spacing: Theme.Spacing.extraSmall) {
            HStack(spacing: Theme.Spacing.extraSmall) {
                compactLabel
                usageTrack(height: 6)
                // Why: a 32pt column truncated "100%" to "10…" — the one number this row
                // exists to report. The column stays fixed so bars in a shared row still
                // align, but it is wide enough for a three-digit percentage.
                Text(percentLabel)
                    .font(.system(size: Theme.Typography.metadata))
                    .foregroundStyle(Theme.Colors.mutedForeground)
                    .lineLimit(1)
                    .frame(width: 40, height: 20, alignment: .trailing)
            }
        }
    }

    private var detailBar: some View {
        VStack(alignment: .leading, spacing: Theme.Spacing.small) {
            HStack(spacing: Theme.Spacing.small) {
                Text(window.label)
                    .font(.system(size: Theme.Typography.supporting))
                    .foregroundStyle(Theme.Colors.foreground)
                Spacer(minLength: 0)
                Text("Used \(roundedPercent)%")
                    .font(.system(size: Theme.Typography.metadata))
                    .foregroundStyle(Theme.Colors.mutedForeground)
                    .monospacedDigit()
            }
            usageTrack(height: 8)
            if let resetLabel {
                Text(resetLabel)
                    .font(.system(size: Theme.Typography.metadata))
                    .foregroundStyle(Theme.Colors.mutedForeground)
                    .lineLimit(1)
            }
        }
    }

    private var compactLabel: some View {
        // Why: a fixed column keeps the bars of a shared row aligned, but 32pt clipped
        // real window names ("Fable" became "Fa…"). Sized for the longest label the
        // providers actually emit instead of for the narrowest one.
        Text(window.compactLabel)
            .font(.system(size: Theme.Typography.metadata))
            .foregroundStyle(Theme.Colors.mutedForeground)
            .lineLimit(1)
            .frame(width: 44, height: 20, alignment: .leading)
    }

    private func usageTrack(height: CGFloat) -> some View {
        GeometryReader { geometry in
            ZStack(alignment: .leading) {
                Capsule().fill(Theme.Colors.usageTrack)
                Capsule()
                    .fill(barColor)
                    .frame(width: geometry.size.width * CGFloat(roundedPercent) / 100)
            }
        }
        .frame(height: height)
        .accessibilityHidden(true)
    }

    private var roundedPercent: Int {
        min(100, max(0, Int(window.usedPercent.rounded())))
    }

    private var percentLabel: String { "\(roundedPercent)%" }

    private var barColor: Color {
        // Why: the product's own red-500/amber-500/green-500 shades. SwiftUI's system
        // .red/.orange/.green are a more saturated hue family and read as alarm states next
        // to the rest of the palette.
        if roundedPercent >= 80 { return Theme.Colors.attention }
        if roundedPercent >= 60 { return Theme.Colors.unread }
        return Theme.Colors.success
    }

    private var resetLabel: String? {
        guard let resetsAt = window.resetsAt else { return nil }
        return accountResetLabel(until: resetsAt, now: now)
    }
}

nonisolated enum AccountUsageBarDensity: Sendable {
    case compact
    case detail
}

nonisolated func accountResetLabel(until resetsAt: Date, now: Date) -> String {
    // Why: positive sub-minute intervals remain "0m" until the reset is actually due.
    let secondsRemaining = resetsAt.timeIntervalSince(now)
    guard secondsRemaining > 0 else { return String(localized: "Resets now") }
    let totalMinutes = Int(secondsRemaining / 60)
    if totalMinutes < 60 {
        return String(localized: "Resets in \(totalMinutes)m")
    }
    let hours = totalMinutes / 60
    let minutes = totalMinutes % 60
    if hours >= 24 {
        let days = hours / 24
        let remainingHours = hours % 24
        if remainingHours > 0 {
            return String(localized: "Resets in \(days)d \(remainingHours)h")
        }
        return String(localized: "Resets in \(days)d")
    }
    if hours > 0, minutes > 0 {
        return String(localized: "Resets in \(hours)h \(minutes)m")
    }
    if hours > 0 { return String(localized: "Resets in \(hours)h") }
    return String(localized: "Resets in \(minutes)m")
}
