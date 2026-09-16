import SwiftUI

/// The app's top-level destinations.
///
/// Home and Settings are peers: each owns its own `NavigationStack` and its own route array, so
/// switching tabs preserves the other's history instead of unwinding it to a single shared stack.
nonisolated enum AppTab: Hashable, CaseIterable {
    case home
    case settings

    var title: LocalizedStringKey {
        switch self {
        case .home: "Home"
        case .settings: "Settings"
        }
    }

    var iconID: AgentStartIconID {
        switch self {
        case .home: .home
        case .settings: .settings
        }
    }
}
