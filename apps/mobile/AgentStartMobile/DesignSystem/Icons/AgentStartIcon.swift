import SwiftUI
import UIKit

/// The only SwiftUI entry point for user-interface icons in AgentStart.
struct AgentStartIcon: View {
    private let icon: AgentStartIconID
    private let size: CGFloat

    init(_ icon: AgentStartIconID, size: CGFloat = 16) {
        self.icon = icon
        self.size = size
    }

    var body: some View {
        icon.image()
            .renderingMode(.template)
            .resizable()
            .scaledToFit()
            .frame(width: size, height: size)
            .accessibilityHidden(true)
    }
}

/// The shared Hugeicons label for native navigation-bar actions.
struct AgentStartToolbarIcon: View {
    private let icon: AgentStartIconID

    init(_ icon: AgentStartIconID) {
        self.icon = icon
    }

    var body: some View {
        // Why: toolbar buttons inherit the app's neutral foreground/tint. Setting a local
        // UIColor here makes the same Hugeicon look darker than adjacent controls in a glass
        // group and bypasses the appearance-aware button contrast chosen by SwiftUI.
        // Why: a 24pt glyph inside a 44pt target. Holding that footprint for every header
        // action keeps the Hugeicons outline from visually overpowering the shared Home
        // toolbar circles.
        AgentStartIcon(icon, size: 24)
    }
}

extension Label where Title == Text, Icon == AgentStartIcon {
    init(_ title: LocalizedStringKey, iconID: AgentStartIconID) {
        self.init {
            Text(title)
        } icon: {
            AgentStartIcon(iconID)
        }
    }

    init(_ title: String, iconID: AgentStartIconID) {
        self.init {
            Text(verbatim: title)
        } icon: {
            AgentStartIcon(iconID)
        }
    }
}

extension Button where Label == AgentStartIconButtonLabel {
    init(
        _ title: LocalizedStringKey,
        iconID: AgentStartIconID,
        role: ButtonRole? = nil,
        action: @escaping () -> Void
    ) {
        self.init(role: role, action: action) {
            AgentStartIconButtonLabel(title: title, icon: iconID)
        }
    }

    init(
        _ title: String,
        iconID: AgentStartIconID,
        role: ButtonRole? = nil,
        action: @escaping () -> Void
    ) {
        self.init(role: role, action: action) {
            AgentStartIconButtonLabel(title: LocalizedStringKey(title), icon: iconID)
        }
    }
}

struct AgentStartIconButtonLabel: View {
    let title: LocalizedStringKey
    let icon: AgentStartIconID

    var body: some View {
        Label {
            Text(title)
        } icon: {
            AgentStartIcon(icon)
        }
    }
}
