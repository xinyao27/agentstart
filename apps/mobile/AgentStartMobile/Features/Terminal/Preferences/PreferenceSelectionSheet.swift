import SwiftUI

struct TerminalAutoRestorePicker: View {
    @Environment(\.dismiss) private var dismiss
    let host: HostProfile
    let model: TerminalAutoRestoreModel

    var body: some View {
        VStack(spacing: 0) {
            TerminalPreferencePickerHeader(
                title: Text("Restore \(host.name)"),
                accessibilityLabel: "Close restore picker"
            )
            SettingsSection {
                ForEach(Array(TerminalAutoRestoreOption.allCases.enumerated()), id: \.element) {
                    index, option in
                    optionRow(option)
                    if index < TerminalAutoRestoreOption.allCases.count - 1 {
                        SettingsDivider()
                    }
                }
            }
            .padding(.horizontal, Theme.Spacing.standard)
            .padding(.bottom, Theme.Spacing.standard)
        }
        .frame(maxHeight: .infinity, alignment: .top)
        .background(Theme.Colors.background)
        .appSheetPresentation(.fixed(.height(292)))
    }

    private var selectedOption: TerminalAutoRestoreOption {
        TerminalAutoRestoreOption.closest(to: model.values[host.id]?.milliseconds)
    }

    private func optionRow(_ option: TerminalAutoRestoreOption) -> some View {
        Button {
            dismiss()
            Task { await model.select(option, for: host.id) }
        } label: {
            TerminalPreferenceOptionLabel(
                title: Text(option.title),
                isSelected: selectedOption == option
            )
        }
        .buttonStyle(.appPlain)
        .accessibilityLabel(option.title)
        .accessibilityValue(selectedOption == option ? "Selected" : "")
        .accessibilityAddTraits(selectedOption == option ? .isSelected : [])
    }
}

struct TerminalTextSizePicker: View {
    @Environment(\.dismiss) private var dismiss
    let preferences: TerminalPreferences

    var body: some View {
        VStack(spacing: 0) {
            TerminalPreferencePickerHeader(
                title: Text("Terminal text size"),
                accessibilityLabel: "Close text size picker"
            )
            SettingsSection {
                ForEach(Array(TerminalTextSize.allCases.enumerated()), id: \.element) {
                    index, size in
                    option(size)
                    if index < TerminalTextSize.allCases.count - 1 {
                        SettingsDivider()
                    }
                }
            }
            .padding(.horizontal, Theme.Spacing.standard)
            .padding(.bottom, Theme.Spacing.standard)
        }
        .frame(maxHeight: .infinity, alignment: .top)
        .background(Theme.Colors.background)
        .appSheetPresentation(.fixed(.height(380)))
    }

    private func option(_ size: TerminalTextSize) -> some View {
        Button {
            preferences.selectTextSize(size)
            dismiss()
        } label: {
            TerminalPreferenceOptionLabel(
                title: Text(size.title),
                isSelected: preferences.textSize == size
            )
        }
        .buttonStyle(.appPlain)
        .accessibilityLabel(size.title)
        .accessibilityValue(preferences.textSize == size ? "Selected" : "")
        .accessibilityAddTraits(preferences.textSize == size ? .isSelected : [])
    }
}

private struct TerminalPreferencePickerHeader: View {
    @Environment(\.dismiss) private var dismiss
    let title: Text
    let accessibilityLabel: LocalizedStringResource

    var body: some View {
        HStack(spacing: Theme.Spacing.standard) {
            GlassIconButton(
                iconName: .x,
                accessibilityLabel: accessibilityLabel,
                context: .large,
                action: { dismiss() }
            )
            title
                .font(.system(size: Theme.Typography.emphasis, weight: .semibold))
                .foregroundStyle(Theme.Colors.foreground)
                .lineLimit(1)
                .frame(maxWidth: .infinity, alignment: .leading)
        }
        .padding(.horizontal, Theme.Spacing.standard)
        .padding(.top, Theme.Spacing.standard)
        .padding(.bottom, Theme.Spacing.large)
    }
}

private struct TerminalPreferenceOptionLabel: View {
    let title: Text
    let isSelected: Bool

    var body: some View {
        HStack(spacing: Theme.Spacing.medium) {
            title
                .font(.system(size: Theme.Typography.supporting, weight: .regular))
                .foregroundStyle(Theme.Colors.foreground)
                .frame(maxWidth: .infinity, alignment: .leading)
            Group {
                if isSelected {
                    AgentStartIcon(.check, size: 14)
                }
            }
            .frame(width: 20)
        }
        .padding(.horizontal, Theme.Spacing.medium)
        .frame(minHeight: Theme.Size.minimumHitTarget)
        .contentShape(.rect)
    }
}
