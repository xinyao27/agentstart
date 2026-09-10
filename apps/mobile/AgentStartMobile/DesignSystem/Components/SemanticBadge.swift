import SwiftUI

struct SemanticBadge: View {
    private let title: LocalizedStringKey
    private let iconID: AgentStartIconID
    private let tint: Color

    init(_ title: LocalizedStringKey, iconID: AgentStartIconID, tint: Color) {
        self.title = title
        self.iconID = iconID
        self.tint = tint
    }

    var body: some View {
        Label(title, iconID: iconID)
            .font(.caption.weight(.semibold))
            .lineLimit(1)
            .fixedSize(horizontal: true, vertical: false)
            .foregroundStyle(tint)
            .padding(.horizontal, Theme.Spacing.medium)
            .padding(.vertical, Theme.Spacing.small)
            .background(tint.opacity(Theme.Opacity.statusFill), in: Capsule())
    }
}
