import SwiftUI

struct BrowserSettingsView: View {
    @State private var isLinkModePickerPresented = false
    let preferences: SettingsPreferences

    var body: some View {
        ScrollView {
            VStack(alignment: .leading, spacing: SettingsSpacing.headingToContent) {
                SettingsHeading(
                    title: "LINKS",
                    detail: "Choose where HTTP(S) links tapped in terminal output\nopen."
                )
                SettingsSection {
                    Button {
                        isLinkModePickerPresented = true
                    } label: {
                        HStack(spacing: Theme.Spacing.small) {
                            AgentStartIcon(.globe, size: Theme.Control.inlineIcon)
                                .foregroundStyle(Theme.Colors.mutedForeground)
                                .frame(width: Theme.Control.largeIcon)
                            VStack(alignment: .leading, spacing: Theme.Spacing.extraSmall) {
                                Text("Open terminal links")
                                    .font(.system(size: Theme.Typography.supporting))
                                    .foregroundStyle(Theme.Colors.foreground)
                                Text(preferences.terminalLinkOpenMode.title)
                                    .font(.system(size: Theme.Typography.metadata))
                                    .foregroundStyle(Theme.Colors.mutedForeground)
                            }
                            .frame(maxWidth: .infinity, alignment: .leading)
                            AgentStartIcon(.chevronRight, size: Theme.Control.inlineIcon)
                                .foregroundStyle(Theme.Colors.mutedForeground)
                                .frame(width: Theme.Control.largeIcon)
                        }
                        .padding(.horizontal, Theme.Spacing.medium)
                        .padding(.vertical, Theme.Spacing.medium)
                        .frame(minHeight: Theme.Size.minimumHitTarget)
                        .contentShape(.rect)
                    }
                    .buttonStyle(.appPlain)
                }
            }
            .frame(maxWidth: .infinity, alignment: .leading)
            .padding(.horizontal, Theme.Spacing.page)
            .padding(.top, Theme.Spacing.standard)
            .padding(.bottom, Theme.Spacing.extraLarge)
        }
        .background { AppBackground() }
        .navigationTitle(Text("Browser"))
        .navigationBarTitleDisplayMode(.inline)
        .sheet(isPresented: $isLinkModePickerPresented) {
            BrowserLinkModePicker(preferences: preferences)
        }
    }
}

private struct BrowserLinkModePicker: View {
    @Environment(\.dismiss) private var dismiss
    let preferences: SettingsPreferences

    var body: some View {
        VStack(spacing: 0) {
            header
            SettingsSection {
                ForEach(Array(TerminalLinkOpenMode.allCases.enumerated()), id: \.element) {
                    index, mode in
                    option(mode)
                    if index < TerminalLinkOpenMode.allCases.count - 1 {
                        SettingsDivider()
                    }
                }
            }
            .padding(.horizontal, Theme.Spacing.page)
            .padding(.bottom, Theme.Spacing.standard)
        }
        .frame(maxHeight: .infinity, alignment: .top)
        .background { AppBackground() }
        .appSheetPresentation(.fixed(.height(BrowserPickerMetrics.sheetHeight)))
    }

    private var header: some View {
        HStack(spacing: Theme.Spacing.standard) {
            GlassHeaderButton(
                iconName: .x,
                accessibilityLabel: "Close link picker",
                action: { dismiss() }
            )
            Text("Open terminal links")
                .font(.system(size: Theme.Typography.primary, weight: .semibold))
                .foregroundStyle(Theme.Colors.foreground)
                .frame(maxWidth: .infinity, alignment: .leading)
        }
        .padding(.horizontal, Theme.Spacing.page)
        .padding(.top, Theme.Spacing.standard)
        .padding(.bottom, Theme.Spacing.large)
    }

    private func option(_ mode: TerminalLinkOpenMode) -> some View {
        Button {
            preferences.selectTerminalLinkMode(mode)
            dismiss()
        } label: {
            HStack(spacing: Theme.Spacing.medium) {
                VStack(alignment: .leading, spacing: Theme.Spacing.extraSmall) {
                    Text(mode.title)
                        .font(.system(size: Theme.Typography.supporting))
                        .foregroundStyle(Theme.Colors.foreground)
                    Text(mode.detail)
                        .font(.system(size: Theme.Typography.metadata))
                        .foregroundStyle(Theme.Colors.mutedForeground)
                        .fixedSize(horizontal: false, vertical: true)
                }
                .frame(maxWidth: .infinity, alignment: .leading)
                Group {
                    if preferences.terminalLinkOpenMode == mode {
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
        .accessibilityLabel(mode.title)
        .accessibilityValue(preferences.terminalLinkOpenMode == mode ? "Selected" : "")
        .accessibilityAddTraits(preferences.terminalLinkOpenMode == mode ? .isSelected : [])
    }
}

private enum BrowserPickerMetrics {
    // Why: two descriptive options and the fixed header fit without implying resize behavior.
    static let sheetHeight: CGFloat = 244
}
