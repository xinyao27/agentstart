import SwiftUI

struct DockedPanelHeader: View {
    let title: LocalizedStringResource
    let subtitle: String
    let closeLabel: LocalizedStringResource
    let close: () -> Void
    var isRefreshing = false
    var refresh: (() -> Void)?
    // Why: a docked panel has no navigation-bar toolbar to hang a hub-level overflow
    // action off of, so this header is that panel's only fixed chrome — the same slot
    // the pushed-screen route reaches via `ToolbarItem`.
    var moreLabel: LocalizedStringResource?
    var more: (() -> Void)?

    var body: some View {
        HStack(spacing: Theme.Spacing.small) {
            GlassHeaderButton(
                iconName: .x,
                accessibilityLabel: closeLabel,
                action: close
            )
            VStack(alignment: .leading, spacing: Theme.Spacing.extraSmall) {
                Text(title)
                    .font(.system(size: Theme.Typography.supporting, weight: .semibold))
                    .foregroundStyle(Theme.Colors.foreground)
                Text(verbatim: subtitle)
                    .font(.system(size: Theme.Typography.metadata))
                    .foregroundStyle(Theme.Colors.mutedForeground)
            }
            .lineLimit(1)
            .frame(maxWidth: .infinity, alignment: .leading)
            if let refresh {
                GlassHeaderButton(
                    iconName: .refresh,
                    accessibilityLabel: "Refresh",
                    isDisabled: isRefreshing,
                    isLoading: isRefreshing,
                    action: refresh
                )
            }
            if let more, let moreLabel {
                GlassHeaderButton(
                    iconName: .more,
                    accessibilityLabel: moreLabel,
                    action: more
                )
            }
        }
        .padding(.horizontal, Theme.Spacing.medium)
        .frame(minHeight: DockedPanelHeaderLayout.minimumHeight)
        .background(Theme.Colors.background)
        .overlay(alignment: .bottom) {
            Rectangle()
                .fill(Theme.Colors.rail.opacity(0.5))
                .frame(height: Theme.Size.hairline)
        }
    }
}

private enum DockedPanelHeaderLayout {
    static let minimumHeight: CGFloat = 60
}
