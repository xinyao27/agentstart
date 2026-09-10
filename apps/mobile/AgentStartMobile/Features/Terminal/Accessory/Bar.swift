import SwiftUI

struct TerminalAccessoryDock: View {
    let state: TerminalAccessoryState
    let displayMode: TerminalDisplayMode
    let isDisplayModeUpdating: Bool
    let toggleDisplayMode: () -> Void
    var removeCustomKey: (TerminalCustomKey) -> Void = { _ in }

    var body: some View {
        TerminalAccessoryBar(
            state: state,
            displayMode: displayMode,
            isDisplayModeUpdating: isDisplayModeUpdating,
            toggleDisplayMode: toggleDisplayMode,
            removeCustomKey: removeCustomKey
        )
        .padding(.horizontal, TerminalChromeMetrics.horizontalInset)
        .padding(.top, TerminalChromeMetrics.dockTopPadding)
    }
}

struct TerminalAccessoryBar: View {
    let state: TerminalAccessoryState
    let displayMode: TerminalDisplayMode
    let isDisplayModeUpdating: Bool
    let toggleDisplayMode: () -> Void
    var removeCustomKey: (TerminalCustomKey) -> Void = { _ in }

    @State private var pendingRemoval: TerminalCustomKey?

    var body: some View {
        GlassEffectContainer(spacing: TerminalChromeMetrics.accessoryGap) {
            HStack(spacing: TerminalChromeMetrics.accessoryGap) {
                TerminalToolsMenu(state: state)
                    .frame(
                        width: TerminalChromeMetrics.accessoryHitSize,
                        height: TerminalChromeMetrics.accessoryHitSize
                    )

                ScrollView(.horizontal) {
                    HStack(spacing: TerminalChromeMetrics.accessoryGap) {
                        controlButton
                        ForEach(escapeAndTabKeys) { key in
                            keyButton(key)
                        }
                        displayModeButton
                        ForEach(otherKeys) { key in
                            keyButton(key)
                        }
                        ForEach(state.customKeys) { key in
                            customKeyButton(key)
                        }
                    }
                }
                .scrollIndicators(.hidden)
                .scrollEdgeEffectHidden(true, for: [.leading, .trailing])
                .background(.clear)
            }
        }
        .frame(height: TerminalChromeMetrics.accessoryRowHeight)
        .sensoryFeedback(.warning, trigger: pendingRemoval)
        .confirmationDialog(
            "Remove Shortcut",
            isPresented: Binding(
                get: { pendingRemoval != nil },
                set: { if !$0 { pendingRemoval = nil } }
            ),
            titleVisibility: .visible
        ) {
            Button("Remove", role: .destructive) {
                guard let key = pendingRemoval else { return }
                pendingRemoval = nil
                removeCustomKey(key)
            }
            Button("Cancel", role: .cancel) { pendingRemoval = nil }
        } message: {
            Text("Remove \"\(pendingRemoval?.label ?? "")\" from your custom shortcuts?")
        }
    }

    private func customKeyButton(_ key: TerminalCustomKey) -> some View {
        Button {
            state.send(key)
        } label: {
            Text(verbatim: key.label)
                .font(.system(size: TerminalChromeMetrics.accessoryText, design: .monospaced))
                .foregroundStyle(Theme.Colors.foreground)
                .lineLimit(1)
                .frame(minHeight: TerminalChromeMetrics.accessoryVisualSize)
                .padding(.horizontal, 10)
                .glassEffect(.regular.interactive(), in: .capsule)
        }
        .buttonStyle(.appPlain)
        .frame(minHeight: TerminalChromeMetrics.accessoryHitSize)
        .contentShape(.interaction, .rect)
        .disabled(!state.isEnabled)
        .accessibilityLabel(Text(verbatim: key.label))
        .contextMenu {
            Button("Remove Shortcut", role: .destructive) {
                pendingRemoval = key
            }
        }
        // Why: the context menu's long-press gesture is unreachable for VoiceOver users, so the
        // same removal is exposed as a named accessibility action (reachable via the rotor).
        .accessibilityAction(named: Text("Remove shortcut")) {
            pendingRemoval = key
        }
    }

    private var escapeAndTabKeys: [TerminalAccessoryKey] {
        state.keys.filter { key in
            key == .escape || key == .tab
        }
    }

    private var otherKeys: [TerminalAccessoryKey] {
        state.keys.filter { key in
            key != .escape && key != .tab
        }
    }

    private var controlButton: some View {
        Button {
            state.toggleControl()
        } label: {
            Text("Ctrl")
                .font(.system(size: TerminalChromeMetrics.accessoryText, design: .monospaced))
                .foregroundStyle(Theme.Colors.foreground)
                .frame(
                    minHeight: TerminalChromeMetrics.accessoryVisualSize
                )
                .padding(.horizontal, 10)
                .glassEffect(
                    state.isControlActive
                        ? .regular.tint(Theme.Colors.selection).interactive()
                        : .regular.interactive(),
                    in: .capsule
                )
        }
        .buttonStyle(.appPlain)
        .frame(minHeight: TerminalChromeMetrics.accessoryHitSize)
        .contentShape(.interaction, .rect)
        .disabled(!state.isEnabled)
        .accessibilityLabel(
            state.isControlActive ? "Control modifier active" : "Control modifier"
        )
        .accessibilityAddTraits(state.isControlActive ? .isSelected : [])
    }

    private var displayModeButton: some View {
        Button(action: toggleDisplayMode) {
            AgentStartIcon(
                displayMode == .auto ? .laptop : .deviceMobile,
                size: TerminalChromeMetrics.accessoryIcon
            )
            .frame(
                width: TerminalChromeMetrics.accessoryVisualSize,
                height: TerminalChromeMetrics.accessoryVisualSize
            )
            .foregroundStyle(Theme.Colors.foreground)
            .glassEffect(.regular.interactive(), in: .circle)
        }
        .buttonStyle(.appPlain)
        .frame(
            width: TerminalChromeMetrics.accessoryHitSize,
            height: TerminalChromeMetrics.accessoryHitSize
        )
        .contentShape(.interaction, .rect)
        .disabled(!state.isEnabled || isDisplayModeUpdating)
        .accessibilityLabel(displayMode.toggleTitle)
    }

    @ViewBuilder
    private func keyButton(_ key: TerminalAccessoryKey) -> some View {
        let button = Button {
            state.send(key)
        } label: {
            keyLabel(key)
                .foregroundStyle(Theme.Colors.foreground)
                .fixedSize(horizontal: true, vertical: false)
                .frame(
                    minWidth: key.isCircular
                        ? TerminalChromeMetrics.accessoryVisualSize
                        : TerminalChromeMetrics.accessoryHitSize,
                    minHeight: TerminalChromeMetrics.accessoryVisualSize
                )
                .padding(.horizontal, key.isCircular ? 0 : 10)
                .glassEffect(
                    .regular.interactive(),
                    in: key.isCircular ? AnyShape(Circle()) : AnyShape(Capsule())
                )
        }
        .buttonStyle(.appPlain)
        .frame(minHeight: TerminalChromeMetrics.accessoryHitSize)
        .contentShape(.interaction, .rect)
        .disabled(!state.isEnabled)
        .accessibilityLabel(key.accessibilityLabel)

        if key.repeatsWhilePressed {
            button.buttonRepeatBehavior(.enabled)
        } else {
            button
        }
    }

    @ViewBuilder
    private func keyLabel(_ key: TerminalAccessoryKey) -> some View {
        Text(key.title)
            .font(.system(size: TerminalChromeMetrics.accessoryText, design: .monospaced))
    }
}
