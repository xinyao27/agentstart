import SwiftUI
import UIKit

struct TerminalToolsMenu: View {
    let state: TerminalAccessoryState

    var body: some View {
        Menu {
            Button("Paste from Clipboard", iconID: .clipboard) {
                state.paste()
            }
            .disabled(!state.isEnabled || !UIPasteboard.general.hasStrings)
        } label: {
            AgentStartIcon(.add, size: TerminalChromeMetrics.accessoryIcon)
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
        .disabled(!state.isEnabled)
        .accessibilityLabel("Open terminal tools")
    }
}
