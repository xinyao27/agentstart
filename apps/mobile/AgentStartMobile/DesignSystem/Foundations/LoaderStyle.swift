import SwiftUI

nonisolated enum AppLoaderStyle: String, CaseIterable, Identifiable, Sendable {
    case working
    case searching
    case solving
    case listening
    case composing
    case shaping
    case s1 = "S1"
    case s2 = "S2"
    case s3 = "S3"
    case s4 = "S4"
    case s5 = "S5"
    case b1 = "B1"
    case b2 = "B2"
    case b3 = "B3"
    case b4 = "B4"
    case b5 = "B5"
    case c1 = "C1"
    case c2 = "C2"
    case c3 = "C3"
    case c4 = "C4"
    case c5 = "C5"
    case m1 = "M1"
    case m2 = "M2"
    case m3 = "M3"
    case m4 = "M4"
    case m5 = "M5"

    var id: Self { self }

    var title: String {
        switch self {
        case .working: String(localized: "Working")
        case .searching: String(localized: "Searching")
        case .solving: String(localized: "Solving")
        case .listening: String(localized: "Listening")
        case .composing: String(localized: "Composing")
        case .shaping: String(localized: "Shaping")
        case .s1: "S1 · " + String(localized: "Thinking")
        case .s2: "S2 · " + String(localized: "Processing")
        case .s3: "S3 · " + String(localized: "Working")
        case .s4: "S4 · " + String(localized: "Searching")
        case .s5: "S5 · " + String(localized: "Finalizing")
        case .b1: "B1 · " + String(localized: "Thinking")
        case .b2: "B2 · " + String(localized: "Searching")
        case .b3: "B3 · " + String(localized: "Generating")
        case .b4: "B4 · " + String(localized: "Solving")
        case .b5: "B5 · " + String(localized: "Routing")
        case .c1: "C1 · " + String(localized: "Loading")
        case .c2: "C2 · " + String(localized: "Listening")
        case .c3: "C3 · " + String(localized: "Streaming")
        case .c4: "C4 · " + String(localized: "Analyzing")
        case .c5: "C5 · " + String(localized: "Compiling")
        case .m1: "M1 · " + String(localized: "Shaping")
        case .m2: "M2 · " + String(localized: "Expanding")
        case .m3: "M3 · " + String(localized: "Unfolding")
        case .m4: "M4 · " + String(localized: "Transforming")
        case .m5: "M5 · " + String(localized: "Dispersing")
        }
    }
}

private struct AppLoaderStyleEnvironmentKey: EnvironmentKey {
    static let defaultValue = AppLoaderStyle.s2
}

extension EnvironmentValues {
    var appLoaderStyle: AppLoaderStyle {
        get { self[AppLoaderStyleEnvironmentKey.self] }
        set { self[AppLoaderStyleEnvironmentKey.self] = newValue }
    }
}
