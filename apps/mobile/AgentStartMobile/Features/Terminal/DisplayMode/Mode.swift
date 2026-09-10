import Foundation

nonisolated enum TerminalDisplayMode: String, Equatable, Sendable {
    case auto
    case desktop

    var title: LocalizedStringResource {
        switch self {
        case .auto:
            "Phone Fit"
        case .desktop:
            "Host Size"
        }
    }

    var iconID: AgentStartIconID {
        switch self {
        case .auto:
            .deviceMobile
        case .desktop:
            .laptop
        }
    }

    var toggleTarget: TerminalDisplayMode {
        switch self {
        case .auto:
            .desktop
        case .desktop:
            .auto
        }
    }

    var toggleTitle: LocalizedStringResource {
        switch toggleTarget {
        case .auto:
            "Switch to phone mode"
        case .desktop:
            "Switch to host mode"
        }
    }
}
