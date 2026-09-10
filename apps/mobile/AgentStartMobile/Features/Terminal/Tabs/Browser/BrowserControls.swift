import SwiftUI

extension WorkspaceBrowserPane {
    func browserChrome(pageID: String?) -> some View {
        GlassEffectContainer(spacing: 8) {
            HStack(spacing: 8) {
                if !isAddressFocused {
                    browserIconButton(.arrowLeft, label: "Back") {
                        guard let pageID else { return }
                        Task { await model.navigate(pageID: pageID, action: .back) }
                    }
                    .disabled(!model.canGoBack || model.isCommandRunning || browserControlsDisabled)
                    browserIconButton(.arrowRight, label: "Forward") {
                        guard let pageID else { return }
                        Task { await model.navigate(pageID: pageID, action: .forward) }
                    }
                    .disabled(
                        !model.canGoForward || model.isCommandRunning || browserControlsDisabled
                    )
                    browserIconButton(.refresh, label: "Reload") {
                        guard let pageID else { return }
                        Task { await model.navigate(pageID: pageID, action: .reload) }
                    }
                    .disabled(model.isCommandRunning || browserControlsDisabled)
                }
                TextField("URL", text: $model.address, selection: $addressSelection)
                    .font(.system(size: Theme.Typography.metadata))
                    .keyboardType(.URL)
                    .textInputAutocapitalization(.never)
                    .autocorrectionDisabled()
                    .submitLabel(.go)
                    .focused($isAddressFocused)
                    .disabled(browserControlsDisabled)
                    .onSubmit {
                        guard let pageID else { return }
                        Task { await model.submitAddress(pageID: pageID) }
                    }
                    .onChange(of: isAddressFocused) { _, focused in
                        guard focused else { return }
                        addressSelection = TextSelection(
                            range: model.address.startIndex..<model.address.endIndex
                        )
                    }
                    .padding(.horizontal, 12)
                    .frame(minHeight: 36)
                    .glassEffect(.regular.interactive(), in: .capsule)
                if !isAddressFocused {
                    Picker(
                        "Website view",
                        selection: Binding(
                            get: { viewMode },
                            set: { mode in selectViewMode(mode) }
                        )
                    ) {
                        Text("Web").tag(WorkspaceBrowserViewMode.web)
                        Text("Mobile").tag(WorkspaceBrowserViewMode.mobile)
                    }
                    .pickerStyle(.segmented)
                    .frame(width: 112)
                    .disabled(browserControlsDisabled)
                }
            }
        }
        .padding(.horizontal, 8)
        .padding(.top, 8)
    }

    func browserKeyboard(pageID: String?) -> some View {
        VStack(spacing: 6) {
            ScrollView(.horizontal) {
                GlassEffectContainer(spacing: 8) {
                    HStack(spacing: 8) {
                        ForEach(WorkspaceBrowserPointerModifier.allCases, id: \.self) { modifier in
                            browserModifier(modifier)
                        }
                        browserKey("Enter", label: "Enter", pageID: pageID)
                        browserKey("Backspace", label: "⌫", pageID: pageID)
                        browserKey("Tab", label: "Tab", pageID: pageID)
                        browserKey("Escape", label: "Esc", pageID: pageID)
                    }
                }
                .padding(.horizontal, 8)
            }
            .scrollIndicators(.hidden)

            GlassEffectContainer(spacing: 8) {
                HStack(spacing: 8) {
                    TextField("Type into the page", text: $model.keyboardText)
                        .font(.system(size: Theme.Typography.metadata))
                        .submitLabel(.send)
                        .disabled(browserControlsDisabled)
                        .onSubmit {
                            guard let pageID else { return }
                            Task { await model.sendKeyboardText(pageID: pageID) }
                        }
                        .padding(.horizontal, 12)
                        .frame(minHeight: 36)
                        .glassEffect(.regular.interactive(), in: .capsule)
                    GlassProminentIconButton(
                        iconName: .arrowUp,
                        accessibilityLabel: "Send text to browser",
                        context: .inline,
                        isDisabled: model.keyboardText.isEmpty || browserControlsDisabled,
                        action: {
                            guard let pageID else { return }
                            Task { await model.sendKeyboardText(pageID: pageID) }
                        }
                    )
                }
            }
            .padding(.horizontal, 8)
        }
        .padding(.bottom, 8)
    }

    private func browserIconButton(
        _ iconName: AgentStartIconID,
        label: LocalizedStringResource,
        action: @escaping () -> Void
    ) -> some View {
        GlassIconButton(
            iconName: iconName,
            accessibilityLabel: label,
            context: .inline,
            action: action
        )
    }

    private func browserKey(_ key: String, label: String, pageID: String?) -> some View {
        Button(label) {
            guard let pageID else { return }
            Task { await model.press(pageID: pageID, key: key) }
        }
        .font(.system(size: Theme.Typography.code, weight: .regular, design: .monospaced))
        .foregroundStyle(Theme.Colors.mutedForeground)
        .buttonStyle(.glass)
        .buttonBorderShape(.capsule)
        .frame(minWidth: 44)
        .appButtonContext(.regular)
        .disabled(browserControlsDisabled || model.isCommandRunning)
    }

    private func browserModifier(_ modifier: WorkspaceBrowserPointerModifier) -> some View {
        let isSelected = model.pointerModifiers.contains(modifier)
        return Button(modifier.label) { model.togglePointerModifier(modifier) }
            .font(.system(size: Theme.Typography.code, weight: .regular, design: .monospaced))
            .foregroundStyle(
                isSelected ? Theme.Colors.foreground : Theme.Colors.mutedForeground
            )
            .buttonStyle(.glass)
            .buttonBorderShape(.capsule)
            .background(isSelected ? Theme.Colors.selection : Color.clear, in: .capsule)
            .frame(minWidth: 44)
            .appButtonContext(.regular)
            .disabled(browserControlsDisabled || model.isCommandRunning)
            .accessibilityAddTraits(isSelected ? .isSelected : [])
    }
}
