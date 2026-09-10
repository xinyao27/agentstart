import Foundation

@MainActor
final class UserDefaultsTerminalPreferenceStore: TerminalPreferenceStore {
    private enum Key {
        static let textSize = "terminal.text-size"
        static let accessoryOrder = "terminal.accessory-order"
        static let accessoryVisible = "terminal.accessory-visible"
        static let customKeys = "agentstart:custom-accessory-keys"
    }

    private let defaults: UserDefaults

    init(defaults: UserDefaults = .standard) {
        self.defaults = defaults
    }

    func load() -> TerminalPreferencesSnapshot {
        let textSize =
            defaults.string(forKey: Key.textSize)
            .flatMap(TerminalTextSize.init(rawValue:)) ?? .standard
        let orderedKeys =
            defaults.stringArray(forKey: Key.accessoryOrder)?
            .compactMap(TerminalAccessoryKey.init(rawValue:))
            ?? TerminalAccessoryKey.allCases
        let visibleKeys =
            defaults.stringArray(forKey: Key.accessoryVisible)
            .map { Set($0.compactMap(TerminalAccessoryKey.init(rawValue:))) }
            ?? Set(TerminalAccessoryKey.allCases)
        return TerminalPreferencesSnapshot(
            textSize: textSize,
            accessoryLayout: TerminalAccessoryLayout(
                orderedKeys: orderedKeys,
                visibleKeys: visibleKeys
            ),
            customKeys: defaults.data(forKey: Key.customKeys).flatMap {
                try? JSONDecoder().decode([TerminalCustomKey].self, from: $0)
            } ?? []
        )
    }

    func save(_ snapshot: TerminalPreferencesSnapshot) {
        defaults.set(snapshot.textSize.rawValue, forKey: Key.textSize)
        defaults.set(
            snapshot.accessoryLayout.orderedKeys.map(\.rawValue),
            forKey: Key.accessoryOrder
        )
        defaults.set(
            snapshot.accessoryLayout.visibleKeys.map(\.rawValue).sorted(),
            forKey: Key.accessoryVisible
        )
        defaults.set(try? JSONEncoder().encode(snapshot.customKeys), forKey: Key.customKeys)
    }
}
