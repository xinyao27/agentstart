import SwiftUI

struct TerminalSettingsView: View {
    let preferences: TerminalPreferences
    @State private var autoRestore: TerminalAutoRestoreModel
    @State private var autoRestoreSelection: TerminalAutoRestoreSelection?
    @State private var isTextSizePickerPresented = false
    @State private var isAddingCustomShortcut = false

    init(
        preferences: TerminalPreferences,
        hosts: any HostRepository,
        autoRestoreRepository: any TerminalAutoRestoreRepository
    ) {
        self.preferences = preferences
        _autoRestore = State(
            initialValue: TerminalAutoRestoreModel(
                hosts: hosts,
                repository: autoRestoreRepository
            )
        )
    }

    var body: some View {
        ScrollView(showsIndicators: false) {
            // Why: SettingsSpacing keeps this screen's heading-to-content and
            // section-to-section rhythm identical to Appearance and Browser so the
            // whole Settings cluster reads as one system rather than four independently tuned
            // screens.
            LazyVStack(alignment: .leading, spacing: 0) {
                SettingsHeading(
                    title: "WHEN YOU LEAVE THE APP",
                    detail:
                        "While you're using a terminal on your phone, AgentStart shrinks it to fit your screen. When you close the app or switch away, this controls whether it stays at phone size (so interactive CLI tools don't reflow) or restores the host grid. You can always use Restore this terminal or Restore all terminals on the banner to resize manually."
                )
                autoRestoreContent
                    .padding(.top, SettingsSpacing.headingToContent)

                SettingsHeading(
                    title: "TEXT SIZE",
                    detail:
                        "Scale the terminal text. Smaller sizes fit more columns with side margins; larger sizes show fewer columns — drag sideways to pan. You can also pinch to zoom in the terminal itself, which updates this setting. This display setting stays on the phone and does not change the daemon PTY."
                )
                .padding(.top, SettingsSpacing.betweenSections)
                textSizeContent
                    .padding(.top, SettingsSpacing.headingToContent)

                SettingsHeading(
                    title: "SHORTCUT BAR",
                    detail:
                        "Toggle keys to show or hide them, and hold the grip to drag a key into the order you want on the terminal shortcut bar."
                )
                .padding(.top, SettingsSpacing.betweenSections)
                shortcutBarContent
                    .padding(.top, SettingsSpacing.headingToContent)

                SettingsHeading(title: "CUSTOM SHORTCUTS")
                    .padding(.top, SettingsSpacing.betweenSections)
                customShortcutsContent
                    .padding(.top, SettingsSpacing.headingToContent)
            }
            .padding(.horizontal, Theme.Spacing.page)
            .padding(.top, TerminalPreferencesMetrics.contentTop)
            .padding(.bottom, Theme.Spacing.extraLarge)
        }
        // Why: the route is titled Terminal even though its content is terminal preferences —
        // it is reached from a Terminal row, so the pushed title continues that path.
        .navigationTitle(Text("Terminal"))
        .navigationBarTitleDisplayMode(.inline)
        .background(Theme.Colors.background)
        .task { await autoRestore.load() }
        .sheet(item: $autoRestoreSelection) { selection in
            TerminalAutoRestorePicker(
                host: selection.host,
                model: autoRestore
            )
        }
        .sheet(isPresented: $isTextSizePickerPresented) {
            TerminalTextSizePicker(preferences: preferences)
        }
        .sheet(isPresented: $isAddingCustomShortcut) {
            TerminalCustomShortcutEditor(preferences: preferences)
        }
    }

    @ViewBuilder
    private var autoRestoreContent: some View {
        if let failure = autoRestore.loadFailure {
            SettingsSection {
                Text(failure)
                    .font(.system(size: Theme.Typography.supporting))
                    .foregroundStyle(Theme.Colors.mutedForeground)
                    .padding(Theme.Spacing.medium)
                    .frame(maxWidth: .infinity, alignment: .leading)
            }
        } else if autoRestore.hosts.isEmpty {
            SettingsSection {
                Text("No paired daemons yet. Pair one to control terminal behavior.")
                    .font(.system(size: Theme.Typography.supporting))
                    .foregroundStyle(Theme.Colors.mutedForeground)
                    .padding(Theme.Spacing.medium)
                    .frame(maxWidth: .infinity, alignment: .leading)
            }
        } else {
            SettingsSection {
                ForEach(Array(autoRestore.hosts.enumerated()), id: \.element.id) { index, host in
                    autoRestoreRow(host)
                    if index < autoRestore.hosts.count - 1 {
                        SettingsDivider()
                    }
                }
            }
        }
    }

    private func autoRestoreRow(_ host: HostProfile) -> some View {
        Button {
            autoRestoreSelection = TerminalAutoRestoreSelection(host: host)
        } label: {
            HStack(spacing: Theme.Spacing.small) {
                AgentStartIcon(.deviceMobile, size: 16)
                    .foregroundStyle(Theme.Colors.mutedForeground)
                    .frame(width: 20)
                VStack(alignment: .leading, spacing: 4) {
                    Text(host.name)
                        .font(.system(size: Theme.Typography.supporting))
                        .foregroundStyle(Theme.Colors.foreground)
                    Text(autoRestore.summary(for: host.id))
                        .font(.system(size: Theme.Typography.metadata))
                        .foregroundStyle(Theme.Colors.mutedForeground)
                }
                .frame(maxWidth: .infinity, alignment: .leading)
                if autoRestore.values[host.id]?.isBusy == true {
                    AgentStartLoader(size: Theme.Control.inlineIcon)
                } else {
                    AgentStartIcon(.chevronRight, size: 16)
                        .foregroundStyle(Theme.Colors.mutedForeground)
                        .frame(width: 20)
                }
            }
            .padding(.horizontal, Theme.Spacing.medium)
            .padding(.vertical, Theme.Spacing.medium)
            .frame(minHeight: TerminalPreferencesMetrics.preferenceRowHeight)
            .contentShape(.rect)
        }
        .buttonStyle(.appPlain)
        .disabled(autoRestore.values[host.id]?.isBusy == true)
    }

    private var textSizeContent: some View {
        SettingsSection {
            Button {
                isTextSizePickerPresented = true
            } label: {
                HStack(spacing: Theme.Spacing.small) {
                    AgentStartIcon(.textFormat, size: 16)
                        .foregroundStyle(Theme.Colors.mutedForeground)
                        .frame(width: 20)
                    VStack(alignment: .leading, spacing: 4) {
                        Text("Text size")
                            .font(.system(size: Theme.Typography.supporting))
                            .foregroundStyle(Theme.Colors.foreground)
                        Text(preferences.textSize.title)
                            .font(.system(size: Theme.Typography.metadata))
                            .foregroundStyle(Theme.Colors.mutedForeground)
                    }
                    .frame(maxWidth: .infinity, alignment: .leading)
                    AgentStartIcon(.chevronRight, size: 16)
                        .foregroundStyle(Theme.Colors.mutedForeground)
                        .frame(width: 20)
                }
                .padding(.horizontal, Theme.Spacing.medium)
                .padding(.vertical, Theme.Spacing.medium)
                .frame(minHeight: TerminalPreferencesMetrics.preferenceRowHeight)
                .contentShape(.rect)
            }
            .buttonStyle(.appPlain)
        }
    }

    private var shortcutBarContent: some View {
        SettingsSection {
            ForEach(Array(preferences.accessoryLayout.orderedKeys.enumerated()), id: \.element) {
                _,
                key in
                TerminalShortcutPreferenceRow(key: key, preferences: preferences)
                SettingsDivider()
            }
            Button {
                preferences.resetAccessoryLayout()
            } label: {
                VStack(alignment: .leading, spacing: 4) {
                    Text("Reset Defaults")
                        .font(.system(size: Theme.Typography.supporting, weight: .regular))
                        .foregroundStyle(Theme.Colors.foreground)
                    Text("Show every built-in shortcut key in the original order")
                        .font(.system(size: Theme.Typography.metadata))
                        .foregroundStyle(Theme.Colors.mutedForeground)
                }
                .padding(.horizontal, Theme.Spacing.medium)
                .frame(minHeight: 56, alignment: .leading)
            }
            .buttonStyle(.appPlain)
        }
    }

    @ViewBuilder
    private var customShortcutsContent: some View {
        SettingsSection {
            if preferences.customKeys.isEmpty {
                Text("No custom shortcuts defined yet.")
                    .font(.system(size: Theme.Typography.supporting))
                    .foregroundStyle(Theme.Colors.mutedForeground)
                    .frame(maxWidth: .infinity, alignment: .center)
                    .padding(Theme.Spacing.medium)
                SettingsDivider()
            } else {
                ForEach(preferences.customKeys) { key in
                    customShortcutRow(key)
                    SettingsDivider()
                }
            }

            Button {
                isAddingCustomShortcut = true
            } label: {
                HStack(spacing: Theme.Spacing.small) {
                    VStack(alignment: .leading, spacing: Theme.Spacing.extraSmall) {
                        Text("Add Custom Shortcut…")
                            .font(.system(size: Theme.Typography.supporting, weight: .regular))
                            .foregroundStyle(Theme.Colors.foreground)
                        Text("Create key combo or text macro")
                            .font(.system(size: Theme.Typography.metadata))
                            .foregroundStyle(Theme.Colors.mutedForeground)
                    }
                    .frame(maxWidth: .infinity, alignment: .leading)
                    AgentStartIcon(.chevronRight, size: 16)
                        .foregroundStyle(Theme.Colors.mutedForeground)
                        .frame(width: 20)
                }
                .padding(.horizontal, Theme.Spacing.medium)
                .frame(minHeight: 56)
            }
            .buttonStyle(.appPlain)
        }
    }

    private func customShortcutRow(_ key: TerminalCustomKey) -> some View {
        HStack(spacing: Theme.Spacing.medium) {
            TerminalSettingsKeycap(label: key.label)
            VStack(alignment: .leading, spacing: Theme.Spacing.extraSmall) {
                Text(verbatim: key.label)
                    .font(.system(size: Theme.Typography.supporting, weight: .regular))
                    .foregroundStyle(Theme.Colors.foreground)
                Text(verbatim: TerminalCustomKeyBuilder.displayBytes(key))
                    .font(.system(size: Theme.Typography.code, design: .monospaced))
                    .foregroundStyle(Theme.Colors.mutedForeground)
                    .lineLimit(1)
            }
            .frame(maxWidth: .infinity, alignment: .leading)
            GlassIconButton(
                iconName: .trash,
                accessibilityLabel: "Delete \(key.label)",
                context: .inline,
                isDestructive: true
            ) {
                preferences.removeCustomKey(key)
            }
            TerminalShortcutReorderHandle(
                payload: key.id,
                itemLabel: Text(verbatim: key.label),
                onMoveUp: { preferences.moveCustomKey(id: key.id, by: -1) },
                onMoveDown: { preferences.moveCustomKey(id: key.id, by: 1) }
            )
        }
        .padding(.horizontal, Theme.Spacing.medium)
        .frame(minHeight: 56)
        .dropDestination(for: String.self) { payloads, _ in
            guard let payload = payloads.first, payload != key.id else { return false }
            preferences.moveCustomKey(id: payload, before: key.id)
            return true
        }
    }
}

private struct TerminalAutoRestoreSelection: Identifiable {
    let host: HostProfile

    var id: String { host.id }
}

private enum TerminalPreferencesMetrics {
    static let contentTop: CGFloat = 17
    static let preferenceRowHeight: CGFloat = 68
}

private struct TerminalShortcutPreferenceRow: View {
    let key: TerminalAccessoryKey
    let preferences: TerminalPreferences
    @State private var isDropTargeted = false

    var body: some View {
        HStack(spacing: Theme.Spacing.medium) {
            Toggle(isOn: isVisible) {
                HStack(spacing: Theme.Spacing.small) {
                    TerminalSettingsKeycap(label: key.title)
                    Text(key.accessibilityLabel)
                }
            }
            // Why: an explicit preference control carries the platform switch tint. Header and
            // content actions stay neutral; this is a state indicator, not a toolbar action.
            .tint(Theme.Colors.primary)
            .font(.system(size: Theme.Typography.primary))

            TerminalShortcutReorderHandle(
                payload: key.rawValue,
                itemLabel: Text(key.accessibilityLabel),
                onMoveUp: { preferences.moveKey(key, by: -1) },
                onMoveDown: { preferences.moveKey(key, by: 1) }
            )
        }
        .dropDestination(for: String.self) { payloads, _ in
            guard let payload = payloads.first,
                let source = TerminalAccessoryKey(rawValue: payload),
                source != key
            else { return false }
            preferences.moveKey(source, before: key)
            return true
        } isTargeted: { isTargeted in
            isDropTargeted = isTargeted
        }
        .background(
            isDropTargeted ? Theme.Colors.mutedForeground.opacity(0.12) : .clear,
            in: .rect(cornerRadius: 10)
        )
        .padding(.leading, 12)
        .frame(minHeight: 56)
    }

    private var isVisible: Binding<Bool> {
        Binding(
            get: { preferences.accessoryLayout.visibleKeys.contains(key) },
            set: { preferences.setKey(key, isVisible: $0) }
        )
    }

}

private struct TerminalShortcutReorderHandle: View {
    let payload: String
    let itemLabel: Text
    let onMoveUp: () -> Void
    let onMoveDown: () -> Void

    var body: some View {
        AgentStartIcon(.gripVertical, size: 18)
            .foregroundStyle(Theme.Colors.mutedForeground)
            .frame(width: 32, height: 44)
            .contentShape(.rect)
            .draggable(payload)
            .accessibilityLabel(Text("Drag to reorder"))
            .accessibilityValue(itemLabel)
            .accessibilityHint(Text("Hold and drag to change the order"))
            .accessibilityAction(named: Text("Move up"), onMoveUp)
            .accessibilityAction(named: Text("Move down"), onMoveDown)
    }
}

private struct TerminalSettingsKeycap: View {
    private let label: Text

    init(label: LocalizedStringResource) {
        self.label = Text(label)
    }

    init(label: String) {
        self.label = Text(verbatim: label)
    }

    var body: some View {
        label
            .font(
                .system(
                    size: 12,
                    weight: .regular,
                    design: .monospaced
                )
            )
            .foregroundStyle(Theme.Colors.mutedForeground)
            .padding(.horizontal, 8)
            .padding(.vertical, 5)
            .frame(minWidth: 64)
            .background(Theme.Colors.keycap, in: .rect(cornerRadius: 8))
    }
}
