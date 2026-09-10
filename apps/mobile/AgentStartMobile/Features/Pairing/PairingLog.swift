import Foundation
import SwiftUI

struct PairingLog: View {
    let entries: [PairingLogEntry]

    var body: some View {
        if let baseDate = entries.first?.date {
            ContentSurface {
                VStack(alignment: .leading, spacing: Theme.Spacing.small) {
                    Text("PAIRING LOG")
                        .font(
                            .system(
                                size: Theme.Typography.metadata,
                                weight: .semibold,
                                design: .monospaced
                            )
                        )
                        .foregroundStyle(Theme.Colors.mutedForeground)
                    ScrollViewReader { proxy in
                        ScrollView {
                            LazyVStack(alignment: .leading, spacing: Theme.Spacing.small) {
                                ForEach(entries) { entry in
                                    entryRow(entry, baseDate: baseDate)
                                        .id(entry.id)
                                }
                            }
                        }
                        .scrollIndicators(.hidden)
                        .frame(maxHeight: PairingLogMetrics.maxHeight)
                        .onChange(of: entries.count) {
                            guard let lastID = entries.last?.id else { return }
                            withAnimation(Theme.Motion.stateChange) {
                                proxy.scrollTo(lastID, anchor: .bottom)
                            }
                        }
                    }
                }
            }
        }
    }

    private func entryRow(_ entry: PairingLogEntry, baseDate: Date) -> some View {
        HStack(alignment: .top, spacing: Theme.Spacing.small) {
            Text(elapsedLabel(entry.date, since: baseDate))
                .font(.system(size: Theme.Typography.metadata, design: .monospaced))
                .foregroundStyle(Theme.Colors.mutedForeground)
                .frame(width: PairingLogMetrics.elapsedWidth, alignment: .leading)
            Text(glyph(entry.level))
                .font(.system(size: Theme.Typography.metadata, design: .monospaced))
                .foregroundStyle(color(entry.level))
                .frame(width: PairingLogMetrics.levelWidth)
            VStack(alignment: .leading, spacing: Theme.Spacing.extraSmall) {
                Text(verbatim: entry.message)
                    .font(.system(size: Theme.Typography.metadata, design: .monospaced))
                    .foregroundStyle(color(entry.level))
                if let detail = entry.detail {
                    Text(verbatim: detail)
                        .font(.system(size: Theme.Typography.metadata, design: .monospaced))
                        .foregroundStyle(Theme.Colors.mutedForeground)
                        .lineLimit(2)
                }
            }
            .frame(maxWidth: .infinity, alignment: .leading)
        }
    }

    private func elapsedLabel(_ date: Date, since baseDate: Date) -> String {
        let elapsed = max(0, date.timeIntervalSince(baseDate))
        if elapsed < 10 { return String(format: "+%.2fs", elapsed) }
        if elapsed < 100 { return String(format: "+%.1fs", elapsed) }
        return "+\(Int(elapsed.rounded()))s"
    }

    private func glyph(_ level: PairingLogLevel) -> String {
        switch level {
        case .info: "•"
        case .success: "✓"
        case .warning: "!"
        case .error: "×"
        }
    }

    private func color(_ level: PairingLogLevel) -> Color {
        switch level {
        case .info: Theme.Colors.mutedForeground
        case .success: Theme.Colors.success
        case .warning: Theme.Colors.unread
        case .error: Theme.Colors.attention
        }
    }
}

private enum PairingLogMetrics {
    static let maxHeight: CGFloat = 200
    static let elapsedWidth: CGFloat = 56
    static let levelWidth = Theme.Spacing.medium
}
