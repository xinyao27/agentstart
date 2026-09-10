import SwiftUI

struct HostEditView: View {
    @State private var model: HostEditModel
    @State private var saveTask: Task<Void, Never>?
    @FocusState private var focusedField: Field?
    private let onSaved: (HostProfile) -> Void

    init(
        host: HostProfile,
        repository: any HostRepository,
        connectionRuntime: any HostConnectionRuntime,
        onSaved: @escaping (HostProfile) -> Void
    ) {
        _model = State(
            initialValue: HostEditModel(
                host: host,
                repository: repository,
                connectionRuntime: connectionRuntime
            )
        )
        _saveTask = State(initialValue: nil)
        self.onSaved = onSaved
    }

    var body: some View {
        ScrollView {
            VStack(alignment: .leading, spacing: Theme.Spacing.small) {
                Text(
                    "Change the display name or connection address. Address edits only switch where this phone connects — they do not re-pair. Use this when the same daemon is reachable at a different IP (for example home LAN vs Tailscale)."
                )
                .font(.system(size: Theme.Typography.supporting))
                .foregroundStyle(Theme.Colors.mutedForeground)
                .lineSpacing(Theme.Spacing.extraSmall)
                .padding(.bottom, Theme.Spacing.small)

                fieldLabel("Name")
                TextField("Host name", text: $model.name)
                    .textInputAutocapitalization(.words)
                    .autocorrectionDisabled()
                    .submitLabel(.next)
                    .focused($focusedField, equals: .name)
                    .onSubmit { focusedField = .address }
                    .onChange(of: model.name) { model.clearFailure() }
                    .modifier(HostFieldStyle())

                fieldLabel("Address")
                    .padding(.top, Theme.Spacing.small)
                TextField("192.168.1.10:6768", text: $model.address)
                    .textInputAutocapitalization(.never)
                    .autocorrectionDisabled()
                    .keyboardType(.URL)
                    .submitLabel(.done)
                    .focused($focusedField, equals: .address)
                    .onSubmit { saveIfPossible() }
                    .onChange(of: model.address) { model.clearFailure() }
                    .modifier(HostFieldStyle())

                Text(
                    "Accepts IP, host:port, or ws:// / wss://. Missing port defaults to the current port (or 6768)."
                )
                .font(.system(size: Theme.Typography.metadata))
                .foregroundStyle(Theme.Colors.mutedForeground)
                .lineSpacing(Theme.Spacing.extraSmall)

                endpointStatus
                    .padding(.top, Theme.Spacing.small)

                if let failure = model.failure {
                    Text(failure)
                        .font(.system(size: Theme.Typography.supporting))
                        .foregroundStyle(Theme.Colors.attention)
                        .padding(.top, Theme.Spacing.extraSmall)
                }
            }
            .padding(.horizontal, Theme.Spacing.page)
            .padding(.bottom, Theme.Spacing.extraLarge)
        }
        .scrollDismissesKeyboard(.interactively)
        .background { AppBackground() }
        .navigationTitle("Edit Host")
        .navigationBarTitleDisplayMode(.inline)
        .toolbar {
            ToolbarItem(placement: .confirmationAction) {
                Button {
                    saveIfPossible()
                } label: {
                    if model.isSaving {
                        ProgressView()
                    } else {
                        Text("Save")
                    }
                }
                .disabled(!model.canSave)
                .accessibilityLabel("Save host")
            }
        }
        .onDisappear {
            saveTask?.cancel()
            saveTask = nil
        }
    }

    @ViewBuilder
    private var endpointStatus: some View {
        switch model.normalizedEndpoint {
        case .valid(let endpoint):
            Text("Connects to \(endpoint)")
                .font(.system(size: Theme.Typography.code).monospaced())
                .foregroundStyle(Theme.Colors.mutedForeground)
                .lineLimit(2)
        case .invalid(let message):
            if !model.address.trimmingCharacters(in: .whitespacesAndNewlines).isEmpty {
                Text(message)
                    .font(.system(size: Theme.Typography.supporting))
                    .foregroundStyle(Theme.Colors.attention)
            }
        }
    }

    private func fieldLabel(_ title: LocalizedStringKey) -> some View {
        Text(title)
            .font(.system(size: Theme.Typography.metadata, weight: .semibold))
            .textCase(.uppercase)
            .tracking(0.5)
            .foregroundStyle(Theme.Colors.mutedForeground)
    }

    private func saveIfPossible() {
        guard model.canSave, saveTask == nil else { return }
        focusedField = nil
        saveTask = Task { @MainActor in
            defer { saveTask = nil }
            guard let updated = await model.save(), !Task.isCancelled else { return }
            onSaved(updated)
        }
    }

    private enum Field: Hashable {
        case name
        case address
    }
}

private struct HostFieldStyle: ViewModifier {
    func body(content: Content) -> some View {
        content
            .font(.system(size: Theme.Typography.supporting))
            .foregroundStyle(Theme.Colors.foreground)
            .padding(.horizontal, Theme.Spacing.standard)
            .frame(minHeight: Theme.Control.largeHeight)
            .glassEffect(
                .regular.interactive(),
                in: .rect(cornerRadius: Theme.Radius.control)
            )
    }
}
