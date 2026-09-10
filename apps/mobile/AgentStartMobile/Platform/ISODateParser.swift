import Foundation

nonisolated enum ISODateParser {
    private static let fractional = Date.ISO8601FormatStyle(includingFractionalSeconds: true)
    private static let standard = Date.ISO8601FormatStyle(includingFractionalSeconds: false)

    static func date(_ value: String) -> Date? {
        (try? fractional.parse(value)) ?? (try? standard.parse(value))
    }
}
