import SwiftUI

struct LoaderPickerSheet: View {
    @Environment(\.dismiss) private var dismiss
    let preferences: SettingsPreferences

    var body: some View {
        VStack(spacing: 0) {
            header
            SettingsSection {
                ScrollView {
                    LazyVStack(spacing: 0) {
                        ForEach(Array(AppLoaderStyle.allCases.enumerated()), id: \.element) {
                            index, style in
                            loaderRow(style)
                            if index < AppLoaderStyle.allCases.count - 1 {
                                SettingsDivider()
                            }
                        }
                    }
                }
                .frame(maxHeight: LoaderPickerMetrics.listHeight)
            }
            .padding(.horizontal, Theme.Spacing.page)
            .padding(.bottom, Theme.Spacing.standard)
        }
        .frame(maxHeight: .infinity, alignment: .top)
        .background { AppBackground() }
        // Why: the option list scrolls inside one fixed-height drawer, so there is nothing to
        // resize; a drag handle here would imply a gesture that does nothing.
        .appSheetPresentation(.fixed(.height(LoaderPickerMetrics.sheetHeight)))
    }

    private var header: some View {
        HStack(spacing: Theme.Spacing.standard) {
            GlassHeaderButton(
                iconName: .x,
                accessibilityLabel: "Close loader picker",
                action: { dismiss() }
            )
            Text("Loader")
                .font(.system(size: Theme.Typography.primary, weight: .semibold))
                .foregroundStyle(Theme.Colors.foreground)
                .frame(maxWidth: .infinity, alignment: .leading)
        }
        .padding(.horizontal, Theme.Spacing.page)
        .padding(.top, Theme.Spacing.standard)
        .padding(.bottom, Theme.Spacing.extraLarge)
    }

    private func loaderRow(_ style: AppLoaderStyle) -> some View {
        Button {
            preferences.selectLoader(style)
            dismiss()
        } label: {
            HStack(spacing: Theme.Spacing.medium) {
                AgentStartLoaderPreview(style: style, size: Theme.Control.largeIcon)
                    .frame(
                        width: Theme.Spacing.extraLarge,
                        height: Theme.Control.largeIcon
                    )
                Text(style.title)
                    .font(.system(size: Theme.Typography.supporting))
                    .foregroundStyle(Theme.Colors.foreground)
                    .lineLimit(1)
                    .frame(maxWidth: .infinity, alignment: .leading)
                Group {
                    if preferences.loaderStyle == style {
                        AgentStartIcon(.check, size: Theme.Control.inlineIcon)
                    }
                }
                .frame(width: Theme.Control.largeIcon)
            }
            .padding(.horizontal, Theme.Spacing.medium)
            .padding(.vertical, Theme.Spacing.small)
            .frame(minHeight: Theme.Size.minimumHitTarget)
            .contentShape(.rect)
        }
        .buttonStyle(.appPlain)
        .accessibilityLabel(style.title)
        .accessibilityValue(preferences.loaderStyle == style ? "Selected" : "")
        .accessibilityAddTraits(preferences.loaderStyle == style ? .isSelected : [])
    }
}

private enum LoaderPickerMetrics {
    // Why: 26 choices scroll inside the fixed 500pt drawer while keeping its header visible.
    static let sheetHeight: CGFloat = 500
    static let listHeight: CGFloat = 384
}
