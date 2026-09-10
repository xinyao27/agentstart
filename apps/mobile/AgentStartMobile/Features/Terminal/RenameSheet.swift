import SwiftUI

struct TerminalRenameSheet: View {
    @Environment(\.dismiss) private var dismiss
    @FocusState private var isFocused: Bool
    @State private var value: String
    let submit: (String) -> Void

    init(title: String, submit: @escaping (String) -> Void) {
        _value = State(initialValue: title)
        self.submit = submit
    }

    var body: some View {
        VStack(alignment: .leading, spacing: 0) {
            HStack(spacing: Theme.Spacing.standard) {
                GlassHeaderButton(
                    iconName: .x,
                    accessibilityLabel: "Cancel rename",
                    action: { dismiss() }
                )

                Text("Rename Terminal")
                    .font(.system(size: Theme.Typography.emphasis, weight: .semibold))
                    .foregroundStyle(Theme.Colors.foreground)
                    .frame(maxWidth: .infinity, alignment: .leading)
            }
            .padding(.horizontal, Theme.Spacing.standard)
            .padding(.top, Theme.Spacing.standard)
            .padding(.bottom, Theme.Spacing.huge)

            TextField("Terminal name", text: $value)
                .font(.system(size: Theme.Typography.supporting))
                .textInputAutocapitalization(.never)
                .autocorrectionDisabled()
                .focused($isFocused)
                .submitLabel(.done)
                .onSubmit(save)
                .padding(.horizontal, Theme.Spacing.standard)
                .frame(minHeight: Theme.Size.minimumHitTarget)
                .glassEffect(.regular.interactive(), in: .capsule)
                .padding(.horizontal, Theme.Spacing.standard)

            HStack(spacing: Theme.Spacing.small) {
                Spacer()
                Button("Cancel") { dismiss() }
                    .buttonStyle(.glass)
                    .appButtonContext(.regular)
                Button("Save", action: save)
                    .appProminentGlassButton()
                    .appButtonContext(.regular)
                    .disabled(value.trimmingCharacters(in: .whitespacesAndNewlines).isEmpty)
            }
            .padding(.horizontal, Theme.Spacing.standard)
            .padding(.top, Theme.Spacing.medium)
            Spacer(minLength: 0)
        }
        .background(Theme.Colors.background)
        .appSheetPresentation(.fixed(.height(240)))
        .task {
            try? await Task.sleep(for: .milliseconds(120))
            isFocused = true
        }
    }

    private func save() {
        let trimmed = value.trimmingCharacters(in: .whitespacesAndNewlines)
        guard !trimmed.isEmpty else { return }
        dismiss()
        submit(trimmed)
    }
}
