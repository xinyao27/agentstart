import Foundation

nonisolated enum TerminalTextSize: String, CaseIterable, Identifiable, Sendable {
    case smallest
    case smaller
    case standard
    case large
    case larger
    case largest

    var id: Self { self }

    var scale: Double {
        switch self {
        case .smallest: 0.5
        case .smaller: 0.75
        case .standard: 1
        case .large: 1.25
        case .larger: 1.5
        case .largest: 2
        }
    }

    var title: LocalizedStringResource {
        switch self {
        case .smallest: "Smallest (50%)"
        case .smaller: "Smaller (75%)"
        case .standard: "Default (100%)"
        case .large: "Large (125%)"
        case .larger: "Larger (150%)"
        case .largest: "Largest (200%)"
        }
    }
}
