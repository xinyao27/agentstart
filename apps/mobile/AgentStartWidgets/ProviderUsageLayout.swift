import SwiftUI
import WidgetKit

struct ProviderUsageWidgetView: View {
    @Environment(\.colorScheme) private var colorScheme
    @Environment(\.widgetFamily) private var widgetFamily
    @Environment(\.widgetRenderingMode) private var renderingMode
    let entry: ProviderUsageEntry

    var body: some View {
        layout
            .containerBackground(for: .widget) {
                // Why: Tinted and Clear (locked) appearances supply their own treatment. Painting a
                // brand fill under them would fight the system's rendering of the widget.
                if isFullColor {
                    backgroundColor
                } else {
                    Color.clear
                }
            }
            .widgetURL(entry.provider?.openURL ?? AgentStartWidgetPresentation.fallbackURL)
            .accessibilityElement(children: .combine)
    }

    @ViewBuilder
    private var layout: some View {
        // Why: a widget that has never synced used to render a full inactive dot grid at 0%, which is
        // indistinguishable from a genuine "0% remaining". Say what is actually wrong instead of
        // fabricating a measurement.
        if entry.provider == nil {
            ProviderUsageUnavailableView()
        } else {
            switch widgetFamily {
            case .systemSmall:
                SmallProviderUsageView(
                    providerName: providerName,
                    quota: sessionQuota,
                    updatedAt: entry.provider?.updatedAt,
                    usesBrandColor: isFullColor
                )
            case .systemMedium:
                MediumProviderUsageView(
                    providerName: providerName,
                    updatedAt: entry.provider?.updatedAt,
                    weeklyQuota: weeklyQuota,
                    sessionQuota: sessionQuota,
                    usesBrandColor: isFullColor
                )
            default:
                SmallProviderUsageView(
                    providerName: providerName,
                    quota: sessionQuota,
                    updatedAt: entry.provider?.updatedAt,
                    usesBrandColor: isFullColor
                )
            }
        }
    }

    private var isFullColor: Bool {
        renderingMode == .fullColor
    }

    private var providerName: String {
        entry.provider?.name ?? (entry.isClaude ? "Claude" : "ChatGPT")
    }

    private var weeklyQuota: ProviderQuotaPresentation {
        ProviderQuotaPresentation(
            label: "Weekly",
            usedPercent: entry.provider?.weeklyUsedPercent,
            color: primaryColor
        )
    }

    private var sessionQuota: ProviderQuotaPresentation {
        ProviderQuotaPresentation(
            label: "5h",
            usedPercent: entry.provider?.sessionUsedPercent,
            color: secondaryColor
        )
    }

    private var backgroundColor: Color {
        // Why: the light-mode Claude orange was pale enough that its own caption text failed
        // contrast at 8–10pt. The darker step is the one both text colors clear 4.5:1 against.
        if entry.isClaude { return Color(widgetHex: 0x8F432B) }
        return Color(widgetHex: colorScheme == .dark ? 0x1C1C1E : 0xF7F7F5)
    }

    private var primaryColor: Color {
        guard isFullColor else { return .primary }
        return entry.isClaude || colorScheme == .dark ? .white : Color(widgetHex: 0x0A0A0A)
    }

    private var secondaryColor: Color {
        guard isFullColor else { return .secondary }
        if entry.isClaude { return Color(widgetHex: 0xFFD8A8) }
        return Color(widgetHex: colorScheme == .dark ? 0xB8B8BD : 0x65656A)
    }
}

/// Shown when the widget has no snapshot: the previous rendering faked a measurement.
private struct ProviderUsageUnavailableView: View {
    var body: some View {
        VStack(alignment: .leading, spacing: ProviderWidgetMetrics.outerSpacing) {
            Text("Usage")
                .font(.system(size: ProviderWidgetMetrics.headerFont, weight: .bold))
                .lineLimit(1)
                .frame(minHeight: ProviderWidgetMetrics.headerHeight, alignment: .leading)
            Text("Open AgentStart to sync usage.")
                .font(.system(size: ProviderWidgetMetrics.captionFont))
                .foregroundStyle(.secondary)
                .fixedSize(horizontal: false, vertical: true)
            Spacer(minLength: 0)
        }
        .padding(ProviderWidgetMetrics.edgeInset)
    }
}

private struct ProviderQuotaPresentation {
    let label: LocalizedStringResource
    let usedPercent: Double?
    let color: Color

    var progress: Double {
        (remainingPercent ?? 0) / 100
    }

    var percentLabel: String {
        guard let remainingPercent else { return "—" }
        return "\(Int(remainingPercent.rounded()))%"
    }

    private var remainingPercent: Double? {
        guard let usedPercent else { return nil }
        return 100 - min(100, max(0, usedPercent))
    }
}

private struct SmallProviderUsageView: View {
    let providerName: String
    let quota: ProviderQuotaPresentation
    let updatedAt: Date?
    let usesBrandColor: Bool

    var body: some View {
        VStack(alignment: .leading, spacing: ProviderWidgetMetrics.outerSpacing) {
            VStack(alignment: .leading, spacing: ProviderWidgetMetrics.labelLineSpacing) {
                Text(providerName)
                    .font(.system(size: ProviderWidgetMetrics.headerFont, weight: .bold))
                    .foregroundStyle(quota.color)
                    .lineLimit(1)
                // Why: the small family carried no timestamp, so a stale reading was
                // indistinguishable from a fresh one.
                freshnessLabel(updatedAt: updatedAt, color: quota.color)
            }
            .frame(minHeight: ProviderWidgetMetrics.headerHeight, alignment: .leading)
            quotaDots(
                quota,
                columns: ProviderWidgetMetrics.dotColumns,
                rows: ProviderWidgetMetrics.dotRows
            )
            .frame(minHeight: ProviderWidgetMetrics.smallDotsHeight)
            HStack(alignment: .bottom, spacing: ProviderWidgetMetrics.smallLabelSpacing) {
                quotaPercent(quota, size: ProviderWidgetMetrics.smallPercentFont)
                VStack(alignment: .leading, spacing: ProviderWidgetMetrics.labelLineSpacing) {
                    Text(quota.label)
                        .font(.system(size: ProviderWidgetMetrics.labelFont))
                        .lineLimit(1)
                    Text("remaining")
                        .font(.system(size: ProviderWidgetMetrics.captionFont))
                        .lineLimit(1)
                }
                .foregroundStyle(quota.color)
            }
            .frame(minHeight: ProviderWidgetMetrics.smallLabelHeight, alignment: .bottom)
        }
        .padding(ProviderWidgetMetrics.edgeInset)
    }
}

private struct MediumProviderUsageView: View {
    let providerName: String
    let updatedAt: Date?
    let weeklyQuota: ProviderQuotaPresentation
    let sessionQuota: ProviderQuotaPresentation
    let usesBrandColor: Bool

    var body: some View {
        VStack(alignment: .leading, spacing: ProviderWidgetMetrics.outerSpacing) {
            providerHeader(
                providerName: providerName, updatedAt: updatedAt, color: weeklyQuota.color
            )
            .frame(minHeight: ProviderWidgetMetrics.headerHeight)
            HStack(spacing: ProviderWidgetMetrics.mediumColumnSpacing) {
                quotaDots(
                    weeklyQuota,
                    columns: ProviderWidgetMetrics.dotColumns,
                    rows: ProviderWidgetMetrics.dotRows
                )
                quotaDots(
                    sessionQuota,
                    columns: ProviderWidgetMetrics.dotColumns,
                    rows: ProviderWidgetMetrics.dotRows
                )
            }
            .frame(minHeight: ProviderWidgetMetrics.mediumDotsHeight)
            HStack(spacing: ProviderWidgetMetrics.mediumColumnSpacing) {
                MediumQuotaLabel(quota: weeklyQuota)
                MediumQuotaLabel(quota: sessionQuota)
            }
            .frame(minHeight: ProviderWidgetMetrics.mediumLabelHeight)
        }
        .padding(ProviderWidgetMetrics.edgeInset)
    }
}

private struct MediumQuotaLabel: View {
    let quota: ProviderQuotaPresentation

    var body: some View {
        HStack(alignment: .bottom, spacing: ProviderWidgetMetrics.mediumLabelSpacing) {
            quotaPercent(quota, size: ProviderWidgetMetrics.mediumPercentFont)
            VStack(alignment: .leading, spacing: ProviderWidgetMetrics.labelLineSpacing) {
                Text(quota.label)
                    .font(.system(size: ProviderWidgetMetrics.labelFont))
                    .lineLimit(1)
                Text("remaining")
                    .font(.system(size: ProviderWidgetMetrics.captionFont))
                    .lineLimit(1)
            }
            .foregroundStyle(quota.color)
        }
        .frame(maxWidth: .infinity, alignment: .leading)
    }
}

private func providerHeader(
    providerName: String,
    updatedAt: Date?,
    color: Color
) -> some View {
    HStack(spacing: ProviderWidgetMetrics.headerSpacing) {
        Text(providerName)
            .font(.system(size: ProviderWidgetMetrics.headerFont, weight: .bold))
            .lineLimit(1)
        Spacer()
        freshnessLabel(updatedAt: updatedAt, color: color)
    }
}

private func freshnessLabel(updatedAt: Date?, color: Color) -> some View {
    HStack(spacing: ProviderWidgetMetrics.refreshSpacing) {
        AgentStartIcon(.refresh, size: ProviderWidgetMetrics.captionFont)
        Text(AgentStartWidgetPresentation.age(from: updatedAt, now: .now))
            .font(.system(size: ProviderWidgetMetrics.captionFont))
            .monospacedDigit()
            .lineLimit(1)
    }
    .foregroundStyle(color)
}

private func quotaDots(
    _ quota: ProviderQuotaPresentation,
    columns: Int,
    rows: Int
) -> some View {
    AgentStartDotProgress(
        progress: quota.progress,
        activeColor: quota.color,
        inactiveColor: quota.color.opacity(0.14),
        columns: columns,
        rows: rows
    )
    // Why: quota dots are the widget's semantic foreground and must stay legible in Tinted mode.
    .widgetAccentable()
}

private func quotaPercent(
    _ quota: ProviderQuotaPresentation,
    size: CGFloat
) -> some View {
    Text(quota.percentLabel)
        .font(.system(size: size))
        .foregroundStyle(quota.color)
        .monospacedDigit()
        .tracking(ProviderWidgetMetrics.valueTracking)
        .lineLimit(1)
}

private enum ProviderWidgetMetrics {
    static let edgeInset: CGFloat = 6
    static let outerSpacing: CGFloat = 4
    static let headerSpacing: CGFloat = 6
    static let refreshSpacing: CGFloat = 4
    static let labelLineSpacing: CGFloat = 1
    static let mediumColumnSpacing: CGFloat = 6
    static let smallLabelSpacing: CGFloat = 7
    static let mediumLabelSpacing: CGFloat = 5
    // Why: these are minimums, not fixed heights. The previous fixed frames assumed a pinned point
    // size, so raising the text to a legible floor would have clipped it.
    static let headerHeight: CGFloat = 26
    static let smallDotsHeight: CGFloat = 82
    static let mediumDotsHeight: CGFloat = 86
    static let smallLabelHeight: CGFloat = 34
    static let mediumLabelHeight: CGFloat = 30
    static let headerFont: CGFloat = 11
    static let smallPercentFont: CGFloat = 28
    static let mediumPercentFont: CGFloat = 22
    // Why: a widget is glanceable, so its text is small by nature — but 7–10pt was below any legible
    // floor and could not scale. One caption size at the floor replaces four near-identical ones.
    static let labelFont: CGFloat = 11
    static let captionFont: CGFloat = 11
    static let valueTracking: CGFloat = -0.8
    static let dotColumns = 13
    static let dotRows = 8
}
