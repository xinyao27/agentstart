import SwiftUI

struct SettingsSection<Content: View>: View {
    private let content: Content

    init(@ViewBuilder content: () -> Content) {
        self.content = content()
    }

    var body: some View {
        VStack(spacing: 0) {
            content
        }
        .background(Theme.Colors.content)
        .clipShape(
            RoundedRectangle(cornerRadius: Theme.Radius.content, style: .continuous)
        )
        .overlay {
            // Why: MobileContentSection keeps the semantic border around each card. Applying
            // it after clipping preserves the same continuous 1px edge without changing the
            // fill or making the row separators darker.
            RoundedRectangle(cornerRadius: Theme.Radius.content, style: .continuous)
                .stroke(Theme.Colors.divider, lineWidth: Theme.Size.hairline)
        }
    }
}

struct SettingsDivider: View {
    var emphasized = false

    var body: some View {
        Rectangle()
            .fill(emphasized ? Theme.Colors.settingsDivider : Theme.Colors.divider)
            // Why: one physical pixel on the 3x iPhone target. A half-point rule rounds to
            // two pixels on alternating rows, so a long settings list slowly drifts.
            .frame(height: Theme.Size.hairline)
            .padding(.horizontal, Theme.Spacing.medium)
    }
}

struct SettingsHeading: View {
    let title: LocalizedStringResource
    var detail: LocalizedStringResource? = nil

    var body: some View {
        VStack(alignment: .leading, spacing: Theme.Spacing.small) {
            Text(title)
                .font(.system(size: Theme.Typography.metadata, weight: .semibold))
            if let detail {
                Text(detail)
                    .font(.system(size: Theme.Typography.metadata))
                    .lineSpacing(Theme.Spacing.extraSmall)
                    .frame(maxWidth: .infinity, alignment: .leading)
                    .allowsTightening(true)
                    .minimumScaleFactor(0.9)
            }
        }
        .foregroundStyle(Theme.Colors.mutedForeground)
        .padding(.horizontal, Theme.Spacing.extraSmall)
        .frame(maxWidth: .infinity, alignment: .leading)
    }
}

struct SettingsNavigationRow: View {
    let title: LocalizedStringResource
    let glyph: AgentStartIconID
    var trailing: LocalizedStringResource? = nil
    let action: () -> Void

    var body: some View {
        Button(action: action) {
            HStack(spacing: Theme.Spacing.small) {
                AgentStartIcon(glyph, size: Theme.Control.inlineIcon)
                    .foregroundStyle(Theme.Colors.mutedForeground)
                    .frame(width: Theme.Control.largeIcon)
                Text(title)
                    .font(.system(size: Theme.Typography.supporting))
                    .foregroundStyle(Theme.Colors.foreground)
                    .frame(maxWidth: .infinity, alignment: .leading)
                if let trailing {
                    Text(trailing)
                        .font(.system(size: Theme.Typography.metadata))
                        .foregroundStyle(Theme.Colors.mutedForeground)
                }
                AgentStartIcon(.chevronRight, size: Theme.Control.inlineIcon)
                    .foregroundStyle(Theme.Colors.mutedForeground)
                    .frame(width: Theme.Control.largeIcon)
            }
            .padding(.horizontal, Theme.Spacing.medium)
            .frame(minHeight: Theme.Size.minimumHitTarget)
            .contentShape(Rectangle())
        }
        .buttonStyle(.appPlain)
    }
}

struct SettingsLinkRow: View {
    let title: LocalizedStringResource
    let glyph: AgentStartIconID
    let destination: URL

    var body: some View {
        Link(destination: destination) {
            HStack(spacing: Theme.Spacing.small) {
                AgentStartIcon(glyph, size: Theme.Control.inlineIcon)
                    .foregroundStyle(Theme.Colors.mutedForeground)
                    .frame(width: Theme.Control.largeIcon)
                Text(title)
                    .font(.system(size: Theme.Typography.supporting))
                    .foregroundStyle(Theme.Colors.foreground)
                    .frame(maxWidth: .infinity, alignment: .leading)
            }
            .padding(.horizontal, Theme.Spacing.medium)
            .frame(minHeight: Theme.Size.minimumHitTarget)
            .contentShape(Rectangle())
        }
        .buttonStyle(.appPlain)
    }
}

/// Why: shared vertical rhythm for every screen in the Settings cluster (including Terminal's
/// preferences screen) so a heading's gap to its control, and the gap between stacked sections,
/// reads identically no matter which settings screen it appears on.
enum SettingsSpacing {
    static let headingToContent = Theme.Spacing.small
    static let betweenSections = Theme.Spacing.extraLarge
}
