import SwiftUI

private enum TerminalCustomShortcutStep: Hashable {
    case combo
    case specialKeys
    case macro
}

struct TerminalCustomShortcutEditor: View {
    let preferences: TerminalPreferences

    @Environment(\.dismiss) private var dismiss
    @State private var path: [TerminalCustomShortcutStep] = []
    @State private var shortcutKey = "c"
    @State private var modifiers: Set<TerminalShortcutModifier> = [.control]
    @State private var macroLabel = ""
    @State private var macroText = ""
    @State private var macroPressesEnter = true

    var body: some View {
        NavigationStack(path: $path) {
            shortcutTypePicker
                .navigationTitle(Text("Add Shortcut"))
                .navigationBarTitleDisplayMode(.inline)
                .toolbar {
                    SheetDismissToolbarItem(accessibilityLabel: "Close add shortcut") { dismiss() }
                }
                .navigationDestination(for: TerminalCustomShortcutStep.self) { step in
                    switch step {
                    case .combo:
                        comboEditor
                    case .specialKeys:
                        specialKeyPicker
                    case .macro:
                        macroEditor
                    }
                }
        }
        // Why: matches the other multi-step NavigationStack editors — no drag
        // handle, sized to page.
        .appSheetPresentation(.page)
    }

    private var shortcutTypePicker: some View {
        List {
            Button {
                path.append(.combo)
            } label: {
                shortcutTypeRow(
                    title: "Shortcut Combo",
                    detail: "Build Ctrl, Alt, and Shift key chords",
                    icon: .terminal
                )
            }
            Button {
                path.append(.macro)
            } label: {
                shortcutTypeRow(
                    title: "Text Macro",
                    detail: "Send custom text command",
                    icon: .textFormat
                )
            }
        }
    }

    private var comboEditor: some View {
        Form {
            Section {
                HStack(spacing: 8) {
                    ForEach(activeModifiers) { modifier in
                        keycap(modifierTitle(modifier))
                        Text("+").foregroundStyle(Theme.Colors.mutedForeground)
                    }
                    keycap(TerminalCustomKeyBuilder.displayLabel(for: shortcutKey))
                }
                .frame(maxWidth: .infinity)
                .padding(.vertical, 8)
            }

            Section("MODIFIERS") {
                HStack(spacing: 8) {
                    ForEach(TerminalShortcutModifier.allCases) { modifier in
                        modifierButton(modifier)
                    }
                }
                .listRowInsets(EdgeInsets(top: 10, leading: 12, bottom: 10, trailing: 12))
            }

            Section("KEY") {
                TextField("C", text: printableKey)
                    .font(.body.monospaced())
                    .multilineTextAlignment(.center)
                    .textInputAutocapitalization(.characters)
                    .autocorrectionDisabled()
                Button("More keys — Tab, arrows, F1–F12…") {
                    path.append(.specialKeys)
                }
            }

            Section {
                Button("Add") { addShortcut() }
                    .frame(maxWidth: .infinity)
                    .disabled(builtShortcut == nil)
            }
        }
        .navigationTitle(Text("Shortcut Combo"))
        .navigationBarTitleDisplayMode(.inline)
    }

    private var specialKeyPicker: some View {
        ScrollView {
            VStack(alignment: .leading, spacing: 20) {
                specialKeyGroup(
                    "EDITING",
                    keys: ["escape", "tab", "enter", "backspace", "delete", "insert", "space"],
                    columns: 4
                )
                specialKeyGroup(
                    "NAVIGATION",
                    keys: [
                        "arrowUp", "arrowDown", "arrowLeft", "arrowRight", "home", "end",
                        "pageUp", "pageDown",
                    ],
                    columns: 4
                )
                specialKeyGroup(
                    "FUNCTION",
                    keys: (1...12).map { "f\($0)" },
                    columns: 6
                )
            }
            .padding(Theme.Spacing.standard)
        }
        .navigationTitle(Text("Pick a key"))
        .navigationBarTitleDisplayMode(.inline)
    }

    private var macroEditor: some View {
        Form {
            Section("LABEL") {
                TextField("e.g. Build", text: $macroLabel)
                    .textInputAutocapitalization(.never)
                    .autocorrectionDisabled()
            }
            Section("COMMAND") {
                TextField("e.g. pnpm build", text: $macroText)
                    .font(.body.monospaced())
                    .textInputAutocapitalization(.never)
                    .autocorrectionDisabled()
                Toggle("Press Enter", isOn: $macroPressesEnter)
            }
            Section {
                Button("Add Shortcut") { addMacro() }
                    .frame(maxWidth: .infinity)
                    .disabled(macroText.isEmpty)
            }
        }
        .navigationTitle(Text("Text Macro"))
        .navigationBarTitleDisplayMode(.inline)
    }

    private var printableKey: Binding<String> {
        Binding(
            get: { shortcutKey.count == 1 ? shortcutKey.uppercased() : "" },
            set: { value in
                let filtered = value.filter { !$0.isNewline && !$0.isWhitespace }
                if let first = filtered.first {
                    shortcutKey = String(first).lowercased()
                } else if value.isEmpty {
                    shortcutKey = ""
                }
            }
        )
    }

    private var activeModifiers: [TerminalShortcutModifier] {
        TerminalShortcutModifier.allCases.filter(modifiers.contains)
    }

    private var builtShortcut: TerminalCustomKey? {
        TerminalCustomKeyBuilder.shortcut(key: shortcutKey, modifiers: modifiers)
    }

    private func shortcutTypeRow(
        title: LocalizedStringKey, detail: LocalizedStringKey, icon: AgentStartIconID
    )
        -> some View
    {
        HStack(spacing: Theme.Spacing.medium) {
            AgentStartIcon(icon, size: Theme.Control.inlineIcon)
                .foregroundStyle(Theme.Colors.mutedForeground)
                .frame(width: Theme.Control.largeIcon)
            VStack(alignment: .leading, spacing: Theme.Spacing.extraSmall) {
                Text(title).foregroundStyle(Theme.Colors.foreground)
                Text(detail)
                    .font(.system(size: Theme.Typography.metadata))
                    .foregroundStyle(Theme.Colors.mutedForeground)
            }
            Spacer()
            AgentStartIcon(.arrowRight, size: Theme.Control.inlineIcon)
                .foregroundStyle(Theme.Colors.mutedForeground)
        }
        .contentShape(.rect)
    }

    private func keycap(_ label: String) -> some View {
        Text(verbatim: label)
            .font(
                .system(
                    size: Theme.Typography.code,
                    weight: .regular,
                    design: .monospaced
                )
            )
            .foregroundStyle(Theme.Colors.foreground)
            .frame(
                minWidth: Theme.Size.minimumHitTarget,
                minHeight: Theme.Size.minimumHitTarget
            )
            .padding(.horizontal, Theme.Spacing.small)
            .background(
                Theme.Colors.selection,
                in: .rect(cornerRadius: Theme.Radius.control)
            )
    }

    private func modifierButton(_ modifier: TerminalShortcutModifier) -> some View {
        Button {
            if modifiers.contains(modifier) {
                modifiers.remove(modifier)
            } else {
                modifiers.insert(modifier)
            }
        } label: {
            Text(verbatim: modifierTitle(modifier))
                .frame(maxWidth: .infinity)
        }
        .buttonStyle(.glass)
        .buttonBorderShape(.capsule)
        .tint(modifiers.contains(modifier) ? Theme.Colors.selection : Theme.Colors.mutedForeground)
        .foregroundStyle(Theme.Colors.foreground)
        .appButtonContext(.regular)
        .accessibilityAddTraits(modifiers.contains(modifier) ? .isSelected : [])
    }

    private func specialKeyGroup(_ title: String, keys: [String], columns: Int) -> some View {
        VStack(alignment: .leading, spacing: Theme.Spacing.small) {
            Text(verbatim: title)
                .font(.system(size: Theme.Typography.metadata, weight: .semibold))
                .foregroundStyle(Theme.Colors.mutedForeground)
                .tracking(0.6)
            LazyVGrid(
                columns: Array(
                    repeating: GridItem(.flexible(), spacing: Theme.Spacing.small),
                    count: columns
                )
            ) {
                ForEach(keys, id: \.self) { key in
                    Button {
                        shortcutKey = key
                        if path.last == .specialKeys { path.removeLast() }
                    } label: {
                        Text(verbatim: TerminalCustomKeyBuilder.displayLabel(for: key))
                            .font(.system(size: Theme.Typography.code, design: .monospaced))
                            .frame(maxWidth: .infinity)
                    }
                    .buttonStyle(.glass)
                    .buttonBorderShape(.roundedRectangle(radius: Theme.Radius.control))
                    .tint(
                        key == shortcutKey ? Theme.Colors.selection : Theme.Colors.mutedForeground
                    )
                    .foregroundStyle(Theme.Colors.foreground)
                    .appButtonContext(.regular)
                    .accessibilityLabel(TerminalCustomKeyBuilder.accessibilityLabel(for: key))
                }
            }
        }
    }

    private func modifierTitle(_ modifier: TerminalShortcutModifier) -> String {
        switch modifier {
        case .control: "Ctrl"
        case .option: "Alt ⌥"
        case .shift: "Shift"
        }
    }

    private func addShortcut() {
        guard let shortcut = builtShortcut else { return }
        preferences.addCustomKey(shortcut)
        dismiss()
    }

    private func addMacro() {
        guard
            let macro = TerminalCustomKeyBuilder.macro(
                label: macroLabel,
                text: macroText,
                pressesEnter: macroPressesEnter
            )
        else { return }
        preferences.addCustomKey(macro)
        dismiss()
    }
}
