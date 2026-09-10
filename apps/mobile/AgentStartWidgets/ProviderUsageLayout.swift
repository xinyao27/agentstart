import SwiftUI
import WidgetKit

struct ProviderUsageWidgetView: View {
    @Environment(\.colorScheme) private var colorScheme
    @Environment(\.widgetFamily) private var widgetFamily
    let entry: ProviderUsageEntry

    var body: some View {
        layout
            .containerBackground(backgroundColor, for: .widget)
            .widgetURL(entry.provider?.openURL ?? AgentStartWidgetPresentation.fallbackURL)
            .accessibilityElement(children: .combine)
    }

    @ViewBuilder
    private var layout: some View {
        switch widgetFamily {
        case .systemSmall:
            SmallProviderUsageView(
                providerName: providerName,
                quota: sessionQuota
            )
        case .systemMedium:
            MediumProviderUsageView(
                providerName: providerName,
                updatedAt: entry.provider?.updatedAt,
                weeklyQuota: weeklyQuota,
                sessionQuota: sessionQuota
            )
        default:
            SmallProviderUsageView(
                providerName: providerName,
                quota: sessionQuota
            )
        }
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
        if entry.isClaude { return Color(widgetHex: colorScheme == .dark ? 0x8F432B : 0xC96843) }
        return Color(widgetHex: colorScheme == .dark ? 0x1C1C1E : 0xF7F7F5)
    }

    private var primaryColor: Color {
        entry.isClaude || colorScheme == .dark ? .white : Color(widgetHex: 0x0A0A0A)
    }

    private var secondaryColor: Color {
        if entry.isClaude { return Color(widgetHex: 0xFFD8A8) }
        return Color(widgetHex: colorScheme == .dark ? 0xB8B8BD : 0x65656A)
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

    var body: some View {
        VStack(alignment: .leading, spacing: ProviderWidgetMetrics.outerSpacing) {
            Text(providerName)
                .font(.system(size: ProviderWidgetMetrics.headerFont, weight: .bold))
                .foregroundStyle(quota.color)
                .lineLimit(1)
                .frame(height: ProviderWidgetMetrics.headerHeight, alignment: .leading)
            quotaDots(
                quota,
                columns: ProviderWidgetMetrics.dotColumns,
                rows: ProviderWidgetMetrics.dotRows
            )
            .frame(height: ProviderWidgetMetrics.smallDotsHeight)
            HStack(alignment: .bottom, spacing: ProviderWidgetMetrics.smallLabelSpacing) {
                quotaPercent(quota, size: ProviderWidgetMetrics.smallPercentFont)
                VStack(alignment: .leading, spacing: ProviderWidgetMetrics.labelLineSpacing) {
                    Text(quota.label)
                        .font(.system(size: ProviderWidgetMetrics.smallLabelFont))
                        .lineLimit(1)
                    Text("remaining")
                        .font(.system(size: ProviderWidgetMetrics.smallCaptionFont))
                        .lineLimit(1)
                }
                .foregroundStyle(quota.color)
            }
            .frame(height: ProviderWidgetMetrics.smallLabelHeight, alignment: .bottom)
        }
        .padding(ProviderWidgetMetrics.edgeInset)
    }
}

private struct MediumProviderUsageView: View {
    let providerName: String
    let updatedAt: Date?
    let weeklyQuota: ProviderQuotaPresentation
    let sessionQuota: ProviderQuotaPresentation

    var body: some View {
        VStack(alignment: .leading, spacing: ProviderWidgetMetrics.outerSpacing) {
            providerHeader(
                providerName: providerName, updatedAt: updatedAt, color: weeklyQuota.color
            )
            .frame(height: ProviderWidgetMetrics.headerHeight)
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
            .frame(height: ProviderWidgetMetrics.mediumDotsHeight)
            HStack(spacing: ProviderWidgetMetrics.mediumColumnSpacing) {
                MediumQuotaLabel(quota: weeklyQuota)
                MediumQuotaLabel(quota: sessionQuota)
            }
            .frame(height: ProviderWidgetMetrics.mediumLabelHeight)
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
                    .font(.system(size: ProviderWidgetMetrics.mediumLabelFont))
                    .lineLimit(1)
                Text("remaining")
                    .font(.system(size: ProviderWidgetMetrics.mediumCaptionFont))
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
        HStack(spacing: ProviderWidgetMetrics.refreshSpacing) {
            AgentStartIcon(.refresh, size: ProviderWidgetMetrics.timestampFont)
            Text(AgentStartWidgetPresentation.age(from: updatedAt, now: .now))
                .font(.system(size: ProviderWidgetMetrics.timestampFont))
                .monospacedDigit()
                .lineLimit(1)
        }
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
        .minimumScaleFactor(ProviderWidgetMetrics.valueMinimumScale)
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
    static let headerHeight: CGFloat = 12
    static let smallDotsHeight: CGFloat = 94
    static let mediumDotsHeight: CGFloat = 99
    static let smallLabelHeight: CGFloat = 32
    static let mediumLabelHeight: CGFloat = 27
    static let headerFont: CGFloat = 10
    static let timestampFont: CGFloat = 9
    static let smallPercentFont: CGFloat = 28
    static let mediumPercentFont: CGFloat = 22
    static let smallLabelFont: CGFloat = 9
    static let smallCaptionFont: CGFloat = 8
    static let mediumLabelFont: CGFloat = 8
    static let mediumCaptionFont: CGFloat = 7
    static let valueTracking: CGFloat = -0.8
    static let valueMinimumScale: CGFloat = 0.6
    static let dotColumns = 13
    static let dotRows = 8
}
