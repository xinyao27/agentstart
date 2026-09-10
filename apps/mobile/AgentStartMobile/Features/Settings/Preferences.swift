import SwiftUI

nonisolated enum AppThemeMode: String, CaseIterable, Identifiable, Sendable {
    case system
    case light
    case dark

    var id: Self { self }

    var title: LocalizedStringResource {
        switch self {
        case .system: "System"
        case .light: "Light"
        case .dark: "Dark"
        }
    }

    var colorScheme: ColorScheme? {
        switch self {
        case .system: nil
        case .light: .light
        case .dark: .dark
        }
    }
}

nonisolated enum TerminalLinkOpenMode: String, CaseIterable, Identifiable, Sendable {
    case agentstartBrowser = "agentstart-browser"
    case phoneBrowser = "phone-browser"

    var id: Self { self }

    var title: LocalizedStringResource {
        switch self {
        case .agentstartBrowser: "AgentStart browser in Chrome"
        case .phoneBrowser: "Phone browser"
        }
    }

    var detail: LocalizedStringResource {
        switch self {
        case .agentstartBrowser: "Open in the streamed browser from your paired daemon."
        case .phoneBrowser: "Open in Safari, Chrome, or another browser on this phone."
        }
    }
}
