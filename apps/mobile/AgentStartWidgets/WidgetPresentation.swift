import SwiftUI

struct AgentStartDotProgress: View {
    let progress: Double
    let activeColor: Color
    let inactiveColor: Color
    let columns: Int
    let rows: Int
    let spacing: CGFloat

    init(
        progress: Double,
        activeColor: Color,
        inactiveColor: Color,
        columns: Int = 12,
        rows: Int = 8,
        spacing: CGFloat = 4
    ) {
        self.progress = progress
        self.activeColor = activeColor
        self.inactiveColor = inactiveColor
        self.columns = columns
        self.rows = rows
        self.spacing = spacing
    }

    var body: some View {
        GeometryReader { proxy in
            let dotSize = min(
                (proxy.size.width - horizontalSpacing) / CGFloat(columns),
                (proxy.size.height - verticalSpacing) / CGFloat(rows)
            )

            VStack(alignment: .leading, spacing: spacing) {
                ForEach(0..<rows, id: \.self) { row in
                    HStack(spacing: spacing) {
                        ForEach(0..<columns, id: \.self) { column in
                            Circle()
                                .fill(dotColor(at: row * columns + column))
                                .frame(width: dotSize, height: dotSize)
                        }
                    }
                }
            }
            .frame(maxWidth: .infinity, maxHeight: .infinity, alignment: .top)
        }
        .accessibilityHidden(true)
    }

    private func dotColor(at index: Int) -> Color {
        index < filledDotCount ? activeColor : inactiveColor
    }

    private var filledDotCount: Int {
        Int((min(1, max(0, progress)) * Double(columns * rows)).rounded())
    }

    private var horizontalSpacing: CGFloat {
        spacing * CGFloat(columns - 1)
    }

    private var verticalSpacing: CGFloat {
        spacing * CGFloat(rows - 1)
    }
}

nonisolated enum AgentStartWidgetPresentation {
    static let fallbackURL =
        URLComponents(string: "agentstart:///")?.url ?? URL(fileURLWithPath: "/")

    static func age(from date: Date?, now: Date) -> String {
        guard let date else { return "—" }
        return compactDuration(now.timeIntervalSince(date))
    }

    static func countdown(to date: Date?, now: Date) -> String {
        guard let date else { return "—" }
        return compactDuration(date.timeIntervalSince(now))
    }

    static func tokenCount(_ value: Double) -> String {
        value.formatted(
            .number.notation(.compactName).precision(.fractionLength(0...1))
        )
    }

    static func currency(_ value: Double) -> String {
        value.formatted(
            .currency(code: "USD").notation(.compactName).precision(.fractionLength(0...1))
        )
    }

    private static func compactDuration(_ interval: TimeInterval) -> String {
        let seconds = max(0, Int(interval))
        if seconds < 60 { return "\(seconds)s" }
        let minutes = seconds / 60
        if minutes < 60 { return "\(minutes)m" }
        let hours = minutes / 60
        if hours < 24 { return "\(hours)h" }
        return "\(hours / 24)d"
    }
}

extension Color {
    nonisolated init(widgetHex value: UInt32) {
        self.init(
            red: Double((value >> 16) & 0xFF) / 255,
            green: Double((value >> 8) & 0xFF) / 255,
            blue: Double(value & 0xFF) / 255
        )
    }
}
