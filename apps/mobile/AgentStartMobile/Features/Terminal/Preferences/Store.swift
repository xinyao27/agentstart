import Foundation

nonisolated struct TerminalPreferencesSnapshot: Equatable, Sendable {
    let textSize: TerminalTextSize
    let accessoryLayout: TerminalAccessoryLayout
    let customKeys: [TerminalCustomKey]

    static let standard = TerminalPreferencesSnapshot(
        textSize: .standard,
        accessoryLayout: .standard,
        customKeys: []
    )
}

@MainActor
protocol TerminalPreferenceStore: AnyObject {
    func load() -> TerminalPreferencesSnapshot
    func save(_ snapshot: TerminalPreferencesSnapshot)
}
