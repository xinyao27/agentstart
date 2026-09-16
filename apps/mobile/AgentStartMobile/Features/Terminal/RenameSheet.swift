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
            // Why: the text Cancel below is this sheet's single dismiss action. A header X as
            // well gave the same sheet two different ways to abandon an edit, which the sheet
            // contract forbids — a form with a real draft keeps the text Cancel instead of the
            // neutral X, not in addition to it.
            Text("Rename Terminal")
                .font(Theme.Typography.emphasis.weight(.semibold))
                .foregroundStyle(Theme.Colors.foreground)
                .frame(maxWidth: .infinity, alignment: .leading)
                .padding(.horizontal, Theme.Spacing.standard)
                .padding(.top, Theme.Spacing.standard)
                .padding(.bottom, Theme.Spacing.huge)

            TextField("Terminal name", text: $value)
                .font(Theme.Typography.supporting)
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
