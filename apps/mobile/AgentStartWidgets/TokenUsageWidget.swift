import SwiftUI
import WidgetKit

struct TokenUsageEntry: TimelineEntry {
    let date: Date
    let savedAt: Date?
    let snapshot: TokenWidgetSnapshot?
}

struct TokenUsageTimelineProvider: TimelineProvider {
    func placeholder(in _: Context) -> TokenUsageEntry {
        TokenUsageEntry(date: .now, savedAt: nil, snapshot: nil)
    }

    func getSnapshot(in _: Context, completion: @escaping (TokenUsageEntry) -> Void) {
        completion(entry())
    }

    func getTimeline(in _: Context, completion: @escaping (Timeline<TokenUsageEntry>) -> Void) {
        completion(Timeline(entries: [entry()], policy: .after(.now + 15 * 60)))
    }

    private func entry() -> TokenUsageEntry {
        let stored = AgentStartWidgetSnapshotStore.load()
        return TokenUsageEntry(date: .now, savedAt: stored?.savedAt, snapshot: stored?.tokens)
    }
}

struct TokenUsageWidgetView: View {
    @Environment(\.colorScheme) private var colorScheme
    @Environment(\.widgetFamily) private var widgetFamily
    let entry: TokenUsageEntry

    var body: some View {
        layout
            .containerBackground(backgroundColor, for: .widget)
            .widgetURL(entry.snapshot?.openURL ?? AgentStartWidgetPresentation.fallbackURL)
            .accessibilityElement(children: .combine)
    }

    @ViewBuilder
    private var layout: some View {
        switch widgetFamily {
        case .systemSmall:
            SmallTokenUsageView(
                savedAt: entry.savedAt,
                snapshot: entry.snapshot,
                todayShare: todayShare
            )
        case .systemMedium:
            MediumTokenUsageView(
                savedAt: entry.savedAt,
                snapshot: entry.snapshot,
                todayShare: todayShare
            )
        default:
            SmallTokenUsageView(
                savedAt: entry.savedAt,
                snapshot: entry.snapshot,
                todayShare: todayShare
            )
        }
    }

    private var todayShare: Double {
        guard let snapshot = entry.snapshot, snapshot.weekTokens > 0 else { return 0 }
        return min(1, max(0, snapshot.todayTokens / snapshot.weekTokens))
    }

    private var backgroundColor: Color {
        Color(widgetHex: colorScheme == .dark ? 0x8F432B : 0xC96843)
    }
}

private struct SmallTokenUsageView: View {
    let savedAt: Date?
    let snapshot: TokenWidgetSnapshot?
    let todayShare: Double

    var body: some View {
        VStack(alignment: .leading, spacing: TokenWidgetMetrics.outerSpacing) {
            tokenHeader(savedAt: savedAt)
                .frame(height: TokenWidgetMetrics.headerHeight)
            HStack(spacing: TokenWidgetMetrics.smallContentSpacing) {
                TokenShareRing(
                    progress: todayShare,
                    size: TokenWidgetMetrics.smallRingSize,
                    lineWidth: TokenWidgetMetrics.smallRingLineWidth,
                    labelSize: nil,
                    captionSize: nil
                )
                TokenMetric(
                    label: "Today",
                    tokens: snapshot?.todayTokens ?? 0,
                    valueUSD: snapshot?.todayValueUSD ?? 0,
                    valueSize: TokenWidgetMetrics.smallValueFont,
                    color: .white
                )
            }
            .frame(height: TokenWidgetMetrics.smallContentHeight)
            Spacer(minLength: 0)
            HStack(alignment: .firstTextBaseline, spacing: TokenWidgetMetrics.footerSpacing) {
                HStack(
                    alignment: .firstTextBaseline,
                    spacing: TokenWidgetMetrics.footerLabelSpacing
                ) {
                    Text(AgentStartWidgetPresentation.tokenCount(snapshot?.weekTokens ?? 0))
                        .font(.system(size: TokenWidgetMetrics.weekValueFont))
                        .monospacedDigit()
                        .lineLimit(1)
                    Text("Week")
                        .font(.system(size: TokenWidgetMetrics.microFont))
                        .lineLimit(1)
                }
                .frame(maxWidth: .infinity, alignment: .leading)
                Text(AgentStartWidgetPresentation.currency(snapshot?.weekValueUSD ?? 0))
                    .font(.system(size: TokenWidgetMetrics.footerCurrencyFont))
                    .monospacedDigit()
                    .minimumScaleFactor(TokenWidgetMetrics.secondaryMinimumScale)
                    .lineLimit(1)
                    .frame(maxWidth: .infinity, alignment: .trailing)
            }
            .foregroundStyle(Color(widgetHex: 0xFFD8A8))
            .frame(height: TokenWidgetMetrics.footerHeight)
        }
        .padding(TokenWidgetMetrics.smallEdgeInset)
    }
}

private struct MediumTokenUsageView: View {
    let savedAt: Date?
    let snapshot: TokenWidgetSnapshot?
    let todayShare: Double

    var body: some View {
        VStack(alignment: .leading, spacing: TokenWidgetMetrics.outerSpacing) {
            tokenHeader(savedAt: savedAt)
                .frame(height: TokenWidgetMetrics.headerHeight)
            HStack(spacing: TokenWidgetMetrics.mediumContentSpacing) {
                TokenShareRing(
                    progress: todayShare,
                    size: TokenWidgetMetrics.mediumRingSize,
                    lineWidth: TokenWidgetMetrics.mediumRingLineWidth,
                    labelSize: TokenWidgetMetrics.ringValueFont,
                    captionSize: TokenWidgetMetrics.microFont
                )
                TokenMetric(
                    label: "Today",
                    tokens: snapshot?.todayTokens ?? 0,
                    valueUSD: snapshot?.todayValueUSD ?? 0,
                    valueSize: TokenWidgetMetrics.mediumValueFont,
                    color: .white
                )
                TokenMetric(
                    label: "Week",
                    tokens: snapshot?.weekTokens ?? 0,
                    valueUSD: snapshot?.weekValueUSD ?? 0,
                    valueSize: TokenWidgetMetrics.mediumValueFont,
                    color: Color(widgetHex: 0xFFD8A8)
                )
            }
            .frame(maxHeight: .infinity)
        }
        .padding(TokenWidgetMetrics.mediumEdgeInset)
    }
}

private struct TokenMetric: View {
    let label: LocalizedStringResource
    let tokens: Double
    let valueUSD: Double
    let valueSize: CGFloat
    let color: Color

    var body: some View {
        VStack(alignment: .leading, spacing: TokenWidgetMetrics.metricSpacing) {
            Text(AgentStartWidgetPresentation.tokenCount(tokens))
                .font(.system(size: valueSize))
                .monospacedDigit()
                .tracking(TokenWidgetMetrics.valueTracking)
                .minimumScaleFactor(TokenWidgetMetrics.valueMinimumScale)
                .lineLimit(1)
            Text(label)
                .font(.system(size: TokenWidgetMetrics.labelFont))
                .lineLimit(1)
            Text(AgentStartWidgetPresentation.currency(valueUSD))
                .font(.system(size: TokenWidgetMetrics.currencyFont))
                .monospacedDigit()
                .minimumScaleFactor(TokenWidgetMetrics.secondaryMinimumScale)
                .lineLimit(1)
        }
        .foregroundStyle(color)
        .frame(maxWidth: .infinity, alignment: .leading)
    }
}

private struct TokenShareRing: View {
    let progress: Double
    let size: CGFloat
    let lineWidth: CGFloat
    let labelSize: CGFloat?
    let captionSize: CGFloat?

    var body: some View {
        ZStack {
            Circle()
                .stroke(Color.white.opacity(0.2), lineWidth: lineWidth)
            Circle()
                .trim(from: 0, to: progress)
                .stroke(
                    Color.white,
                    style: StrokeStyle(lineWidth: lineWidth, lineCap: .round)
                )
                .rotationEffect(.degrees(-90))
                .widgetAccentable()
            if let labelSize, let captionSize {
                VStack(spacing: TokenWidgetMetrics.ringLabelSpacing) {
                    Text("\(Int((progress * 100).rounded()))%")
                        .font(.system(size: labelSize))
                        .monospacedDigit()
                    Text("Today")
                        .font(.system(size: captionSize))
                }
                .foregroundStyle(.white)
            }
        }
        .frame(width: size, height: size)
        .accessibilityHidden(true)
    }
}

private func tokenHeader(savedAt: Date?) -> some View {
    HStack(spacing: TokenWidgetMetrics.headerSpacing) {
        Text("Token usage")
            .font(.system(size: TokenWidgetMetrics.headerFont, weight: .bold))
            .lineLimit(1)
        Spacer()
        HStack(spacing: TokenWidgetMetrics.refreshSpacing) {
            AgentStartIcon(.refresh, size: TokenWidgetMetrics.timestampFont)
            Text(AgentStartWidgetPresentation.age(from: savedAt, now: .now))
                .font(.system(size: TokenWidgetMetrics.timestampFont))
                .monospacedDigit()
                .lineLimit(1)
        }
    }
    .foregroundStyle(.white)
}

private enum TokenWidgetMetrics {
    static let smallEdgeInset: CGFloat = 12
    static let mediumEdgeInset: CGFloat = 14
    static let outerSpacing: CGFloat = 8
    static let headerSpacing: CGFloat = 6
    static let refreshSpacing: CGFloat = 4
    static let smallContentSpacing: CGFloat = 10
    static let mediumContentSpacing: CGFloat = 16
    static let footerSpacing: CGFloat = 8
    static let footerLabelSpacing: CGFloat = 5
    static let metricSpacing: CGFloat = 3
    static let ringLabelSpacing: CGFloat = 1
    static let headerHeight: CGFloat = 12
    static let smallContentHeight: CGFloat = 70
    static let footerHeight: CGFloat = 28
    static let smallRingSize: CGFloat = 60
    static let mediumRingSize: CGFloat = 96
    static let smallRingLineWidth: CGFloat = 8
    static let mediumRingLineWidth: CGFloat = 10
    static let headerFont: CGFloat = 10
    static let timestampFont: CGFloat = 9
    static let smallValueFont: CGFloat = 27
    static let mediumValueFont: CGFloat = 28
    static let weekValueFont: CGFloat = 17
    static let ringValueFont: CGFloat = 17
    static let labelFont: CGFloat = 9
    static let microFont: CGFloat = 8
    static let currencyFont: CGFloat = 11
    static let footerCurrencyFont: CGFloat = 10
    static let valueTracking: CGFloat = -0.8
    static let valueMinimumScale: CGFloat = 0.55
    static let secondaryMinimumScale: CGFloat = 0.7
}

struct TokenUsageWidget: Widget {
    var body: some WidgetConfiguration {
        StaticConfiguration(kind: "TokenUsageWidget", provider: TokenUsageTimelineProvider()) {
            TokenUsageWidgetView(entry: $0)
        }
        .configurationDisplayName("Token Usage")
        .description("Shows cumulative token usage for today and this week.")
        .supportedFamilies([.systemSmall, .systemMedium])
        .contentMarginsDisabled()
    }
}
