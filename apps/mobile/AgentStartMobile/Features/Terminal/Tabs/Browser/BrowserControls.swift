import SwiftUI

extension WorkspaceBrowserPane {
    func browserChrome(pageID: String?) -> some View {
        HStack(spacing: Theme.Spacing.small) {
            if !isAddressFocused {
                browserIconButton(
                    .arrowLeft,
                    label: "Back",
                    isDisabled: !model.canGoBack || model.isCommandRunning
                        || browserControlsDisabled
                ) {
                    guard let pageID else { return }
                    Task { await model.navigate(pageID: pageID, action: .back) }
                }
                browserIconButton(
                    .arrowRight,
                    label: "Forward",
                    isDisabled: !model.canGoForward || model.isCommandRunning
                        || browserControlsDisabled
                ) {
                    guard let pageID else { return }
                    Task { await model.navigate(pageID: pageID, action: .forward) }
                }
                browserIconButton(
                    .refresh,
                    label: "Reload",
                    isDisabled: model.isCommandRunning || browserControlsDisabled
                ) {
                    guard let pageID else { return }
                    Task { await model.navigate(pageID: pageID, action: .reload) }
                }
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
                .padding(.horizontal, Theme.Spacing.medium)
                .frame(minHeight: Theme.Control.inlineHeight)
                .background(
                    Theme.Colors.content,
                    in: .rect(cornerRadius: Theme.Radius.control)
                )
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
                .frame(width: BrowserChromeMetrics.viewModeWidth)
                .disabled(browserControlsDisabled)
            }
        }
        .padding(.horizontal, Theme.Spacing.small)
        .padding(.vertical, Theme.Spacing.extraSmall)
        // Why: one frosted surface for the whole row, with solid chips for the controls inside it.
        // Per-control glass drew its own blur and shadow under every pill, so a row read as several
        // overlapping layers instead of a bar, and on the bar's own light surface a transparent
        // control has no shape left at all.
        .glassEffect(.regular, in: .rect(cornerRadius: Theme.Radius.floatingSurface))
        // Why: one owner for the inset. The bar floats a uniform margin off the screen edge so the
        // page shows through underneath instead of sitting under a docked strip.
        .padding(.horizontal, Theme.Spacing.medium)
        .padding(.top, Theme.Spacing.small)
    }

    func browserKeyboard(pageID: String?) -> some View {
        VStack(spacing: Theme.Spacing.small) {
            ScrollView(.horizontal) {
                HStack(spacing: Theme.Spacing.small) {
                    ForEach(WorkspaceBrowserPointerModifier.allCases, id: \.self) { modifier in
                        browserModifier(modifier)
                    }
                    browserKey("Enter", label: "Enter", pageID: pageID)
                    browserKey("Backspace", label: "⌫", pageID: pageID)
                    browserKey("Tab", label: "Tab", pageID: pageID)
                    browserKey("Escape", label: "Esc", pageID: pageID)
                }
            }
            .scrollIndicators(.hidden)

            HStack(spacing: Theme.Spacing.extraSmall) {
                TextField("Type into the page", text: $model.keyboardText)
                    .font(.system(size: Theme.Typography.metadata))
                    .submitLabel(.send)
                    .disabled(browserControlsDisabled)
                    .onSubmit {
                        guard let pageID else { return }
                        Task { await model.sendKeyboardText(pageID: pageID) }
                    }
                    .padding(.leading, Theme.Spacing.medium)
                    .frame(minHeight: Theme.Control.regularHeight)
                browserSendButton(pageID: pageID)
            }
            // Why: the field and its action are one control, the way a message composer is — the
            // send circle sits inside the field's own surface instead of beside it, and the
            // button's own hit frame supplies the inset that keeps the circle off the capsule edge.
            .background(Theme.Colors.content, in: .capsule)
        }
        .padding(.horizontal, Theme.Spacing.small)
        .padding(.vertical, Theme.Spacing.extraSmall)
        // Why: the keys and the text field are one action area, so they share a single surface —
        // stacked per-row glass doubled the blur along the seam between them.
        .glassEffect(.regular, in: .rect(cornerRadius: Theme.Radius.floatingSurface))
        .padding(.horizontal, Theme.Spacing.medium)
        .padding(.bottom, Theme.Spacing.small)
    }

    private func browserIconButton(
        _ iconName: AgentStartIconID,
        label: LocalizedStringResource,
        isDisabled: Bool,
        action: @escaping () -> Void
    ) -> some View {
        Button(action: action) {
            AgentStartIcon(iconName, size: Theme.Control.inlineIcon)
                .foregroundStyle(
                    isDisabled ? Theme.Colors.mutedForeground : Theme.Colors.foreground
                )
                .frame(
                    width: BrowserChromeMetrics.controlSize,
                    height: BrowserChromeMetrics.controlSize
                )
                .background(
                    isDisabled ? Theme.Colors.content : Theme.Colors.keycap,
                    in: .rect(cornerRadius: Theme.Radius.control)
                )
        }
        .buttonStyle(.appPlain)
        .appButtonContext(.inline)
        .disabled(isDisabled)
        .accessibilityLabel(label)
    }

    // Why: this is the row's primary action, so it uses the product's solid circular action button
    // — its visible circle is a fixed size, which is what lets the capsule inset it evenly.
    private func browserSendButton(pageID: String?) -> some View {
        ProminentCircleButton(
            iconName: .arrowUp,
            accessibilityLabel: "Type the text into the browser page",
            context: .regular,
            isDisabled: model.keyboardText.isEmpty || browserControlsDisabled,
            action: {
                guard let pageID else { return }
                Task { await model.sendKeyboardText(pageID: pageID) }
            }
        )
    }

    private func browserKey(_ key: String, label: String, pageID: String?) -> some View {
        let isDisabled = browserControlsDisabled || model.isCommandRunning
        return Button(label) {
            guard let pageID else { return }
            Task { await model.press(pageID: pageID, key: key) }
        }
        .font(.system(size: Theme.Typography.code, weight: .regular, design: .monospaced))
        .foregroundStyle(isDisabled ? Theme.Colors.mutedForeground : Theme.Colors.foreground)
        .buttonStyle(.appPlain)
        .frame(
            minWidth: Theme.Size.minimumHitTarget,
            minHeight: Theme.Control.regularHeight
        )
        .background(
            isDisabled ? Theme.Colors.content : Theme.Colors.keycap,
            in: .rect(cornerRadius: Theme.Radius.control)
        )
        .appButtonContext(.regular)
        .disabled(isDisabled)
    }

    private func browserModifier(_ modifier: WorkspaceBrowserPointerModifier) -> some View {
        let isSelected = model.pointerModifiers.contains(modifier)
        let isDisabled = browserControlsDisabled || model.isCommandRunning
        return Button(modifier.label) { model.togglePointerModifier(modifier) }
            .font(.system(size: Theme.Typography.code, weight: .regular, design: .monospaced))
            .foregroundStyle(
                isSelected || !isDisabled ? Theme.Colors.foreground : Theme.Colors.mutedForeground
            )
            .buttonStyle(.appPlain)
            .frame(
                minWidth: Theme.Size.minimumHitTarget,
                minHeight: Theme.Control.regularHeight
            )
            .background(
                chipColor(isSelected: isSelected, isDisabled: isDisabled),
                in: .rect(cornerRadius: Theme.Radius.control)
            )
            .appButtonContext(.regular)
            .disabled(isDisabled)
            .accessibilityAddTraits(isSelected ? .isSelected : [])
    }

    private func chipColor(isSelected: Bool, isDisabled: Bool) -> Color {
        if isSelected { return Theme.Colors.selection }
        return isDisabled ? Theme.Colors.content : Theme.Colors.keycap
    }
}

private enum BrowserChromeMetrics {
    // Why: a segmented Web/Mobile control has a measured fixed width; unlike a text control the
    // bar cannot derive it from its label.
    static let viewModeWidth: CGFloat = 112
    static let controlSize = Theme.Control.inlineHeight
}
