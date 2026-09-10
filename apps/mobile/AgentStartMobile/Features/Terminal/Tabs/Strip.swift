import SwiftUI

struct TerminalTabContextActions {
    let displayMode: TerminalDisplayMode
    let isDisplayModeUpdating: Bool
    let toggleDisplayMode: () -> Void
    let rename: () -> Void
    let clear: () -> Void
    let close: () -> Void
}

struct TerminalContentContextActions {
    let refresh: ((TerminalWorkspaceTab) -> Void)?
    let copyPath: ((TerminalWorkspaceTab) -> Void)?
}

extension EnvironmentValues {
    @Entry var terminalTabContextActions: TerminalTabContextActions?
}

struct TerminalTabStrip: View {
    @Environment(\.terminalTabContextActions) private var terminalTabContextActions
    let tabs: [TerminalWorkspaceTab]
    let activeTabID: String?
    let isDisabled: Bool
    let selectTab: (TerminalWorkspaceTab) -> Void
    let closeTab: (TerminalWorkspaceTab) -> Void
    let navigateBrowser: (TerminalWorkspaceTab, WorkspaceBrowserNavigation) -> Void
    let createTerminal: () -> Void
    var contentContextActions: TerminalContentContextActions? = nil

    var body: some View {
        HStack(spacing: TerminalChromeMetrics.tabGap) {
            ScrollViewReader { proxy in
                ScrollView(.horizontal) {
                    HStack(spacing: TerminalChromeMetrics.tabGap) {
                        ForEach(tabs) { tab in
                            tabButton(tab)
                                .id(tab.id)
                        }
                    }
                    .padding(.leading, TerminalChromeMetrics.tabLeadingInset)
                }
                .scrollIndicators(.hidden)
                .clipped()
                .onChange(of: activeTabID) { previousTabID, tabID in
                    // Why: programmatic scrolling must only ever react to the active tab
                    // changing, never to layout measurement — scrolling in response to frame
                    // preferences fires every frame during a drag and cancels the user's gesture.
                    guard let tabID else { return }
                    if previousTabID == nil {
                        DispatchQueue.main.async {
                            proxy.scrollTo(tabID)
                        }
                    } else {
                        withAnimation(Theme.Motion.stateChange) {
                            proxy.scrollTo(tabID)
                        }
                    }
                }
            }
            .frame(minWidth: 0, maxWidth: .infinity)

            Button(action: createTerminal) {
                AgentStartIcon(.add, size: TerminalChromeMetrics.actionIcon)
                    .frame(
                        width: TerminalChromeMetrics.actionVisualSize,
                        height: TerminalChromeMetrics.actionVisualSize
                    )
                    .foregroundStyle(Theme.Colors.mutedForeground)
            }
            // Why: the new-tab control sits on the selected secondary surface (#d8d8d8). A
            // standalone iOS 26 glass button resolves to an opaque white disk against this
            // strip, so the surface is set explicitly and cannot regress when SwiftUI changes
            // the standalone glass material's contrast.
            .buttonStyle(.appPlain)
            .background(Theme.Colors.selection, in: Circle())
            .frame(
                width: TerminalChromeMetrics.actionHitSize,
                height: TerminalChromeMetrics.actionHitSize
            )
            .contentShape(.interaction, .rect)
            .fixedSize()
            .disabled(isDisabled)
            .accessibilityLabel("New tab")
        }
        .frame(maxWidth: .infinity)
        .frame(height: TerminalChromeMetrics.tabStripHeight)
        .padding(.horizontal, TerminalChromeMetrics.horizontalInset)
    }

    private func tabButton(_ tab: TerminalWorkspaceTab) -> some View {
        let isActive = tab.id == activeTabID
        return Button {
            selectTab(tab)
        } label: {
            HStack(spacing: Theme.Spacing.extraSmall) {
                TerminalTabIcon(tab: tab, isActive: isActive)
                Text(tab.displayTitle)
                    .font(
                        .system(
                            size: TerminalChromeMetrics.tabText,
                            weight: .regular
                        )
                    )
                    .foregroundStyle(
                        isActive ? Theme.Colors.foreground : Theme.Colors.mutedForeground
                    )
                    .lineLimit(1)
            }
        }
        .buttonStyle(TerminalTabButtonStyle(isActive: isActive))
        .contextMenu {
            if case .browser(let browser) = tab.content {
                if browser.canGoBack {
                    Button("Back", iconID: .arrowLeft) {
                        navigateBrowser(tab, .back)
                    }
                }
                if browser.canGoForward {
                    Button("Forward", iconID: .arrowRight) {
                        navigateBrowser(tab, .forward)
                    }
                }
                Button("Reload", iconID: .refresh) {
                    navigateBrowser(tab, .reload)
                }
                Divider()
            }
            if case .markdown = tab.content {
                if let refresh = contentContextActions?.refresh {
                    Button("Refresh", iconID: .refresh) { refresh(tab) }
                }
                if let copyPath = contentContextActions?.copyPath {
                    Button("Copy Path", iconID: .fileText) { copyPath(tab) }
                }
                Divider()
            } else if case .file = tab.content {
                if let refresh = contentContextActions?.refresh {
                    Button("Refresh", iconID: .refresh) { refresh(tab) }
                }
                Divider()
            }
            if tab.id == activeTabID, case .terminal = tab.content,
                let actions = terminalTabContextActions
            {
                Button(action: actions.toggleDisplayMode) {
                    Label(
                        actions.displayMode == .auto
                            ? "Switch to Host Size"
                            : "Switch to Phone Fit",
                        iconID: actions.displayMode == .auto ? .monitor : .deviceMobile
                    )
                }
                .disabled(actions.isDisplayModeUpdating)
                Button("Rename", iconID: .pencil, action: actions.rename)
                Button("Clear Terminal", iconID: .eraser, role: .destructive, action: actions.clear)
                Button("Close", iconID: .x, action: actions.close)
            } else {
                Button("Close Tab", iconID: .x, role: .destructive) {
                    closeTab(tab)
                }
                .disabled(isDisabled)
            }
        }
        .disabled(isDisabled && !isActive)
        .accessibilityAddTraits(isActive ? .isSelected : [])
    }
}

private struct TerminalTabIcon: View {
    let tab: TerminalWorkspaceTab
    let isActive: Bool

    var body: some View {
        if let agentID = tab.terminalAgentID {
            AgentMark(agentID: agentID, size: TerminalChromeMetrics.tabIcon)
                .foregroundStyle(
                    isActive ? Theme.Colors.foreground : Theme.Colors.mutedForeground
                )
        } else if let glyph = tab.iconGlyph {
            AgentStartIcon(
                glyph,
                size: TerminalChromeMetrics.tabIcon
            )
        }
    }
}

private struct TerminalTabButtonStyle: ButtonStyle {
    let isActive: Bool

    func makeBody(configuration: Configuration) -> some View {
        configuration.label
            .padding(.horizontal, TerminalChromeMetrics.tabHorizontalPadding)
            .frame(height: TerminalChromeMetrics.tabVisualHeight)
            .background(
                isActive || configuration.isPressed ? Theme.Colors.selection : Color.clear,
                in: Capsule()
            )
            .frame(
                minWidth: TerminalChromeMetrics.tabMinimumWidth,
                maxWidth: TerminalChromeMetrics.tabMaximumWidth,
                minHeight: TerminalChromeMetrics.tabStripHeight
            )
            .contentShape(Rectangle())
            .opacity(configuration.isPressed ? 0.82 : 1)
    }
}
