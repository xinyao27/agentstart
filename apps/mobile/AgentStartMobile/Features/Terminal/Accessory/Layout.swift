import Foundation

nonisolated struct TerminalAccessoryLayout: Equatable, Sendable {
    let orderedKeys: [TerminalAccessoryKey]
    let visibleKeys: Set<TerminalAccessoryKey>

    init(
        orderedKeys: [TerminalAccessoryKey],
        visibleKeys: Set<TerminalAccessoryKey>
    ) {
        var seen: Set<TerminalAccessoryKey> = []
        let knownOrder = orderedKeys.filter { seen.insert($0).inserted }
        let preferredOrder =
            knownOrder == TerminalAccessoryKey.legacyStandardOrder
            ? TerminalAccessoryKey.standardOrder
            : knownOrder
        let shouldAdoptStandardVisibility =
            visibleKeys == Set(TerminalAccessoryKey.allCases)
            && (knownOrder == TerminalAccessoryKey.legacyStandardOrder
                || knownOrder == TerminalAccessoryKey.standardOrder)
        self.orderedKeys =
            preferredOrder + TerminalAccessoryKey.standardOrder.filter { seen.insert($0).inserted }
        self.visibleKeys =
            (shouldAdoptStandardVisibility
            ? TerminalAccessoryKey.standardVisibleKeys : visibleKeys).intersection(
                TerminalAccessoryKey.allCases)
    }

    static let standard = TerminalAccessoryLayout(
        orderedKeys: TerminalAccessoryKey.standardOrder,
        visibleKeys: TerminalAccessoryKey.standardVisibleKeys
    )

    var visibleOrderedKeys: [TerminalAccessoryKey] {
        orderedKeys.filter(visibleKeys.contains)
    }
}
