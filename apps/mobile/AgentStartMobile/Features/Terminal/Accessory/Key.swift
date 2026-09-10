import Foundation

nonisolated enum TerminalAccessoryKey: String, CaseIterable, Identifiable, Sendable {
    case escape
    case tab
    case enter
    case shiftTab
    case space
    case backspace
    case delete
    case arrowUp
    case arrowDown
    case arrowLeft
    case arrowRight
    case interrupt = "ctrlC"
    case endOfFile = "ctrlD"
    case clearScreen = "ctrlL"
    case suspend = "ctrlZ"
    case reverseSearch = "ctrlR"
    case startOfLine = "ctrlA"
    case endOfLine = "ctrlE"
    case deleteWordBackward = "ctrlW"
    case clearLineBeforeCursor = "ctrlU"

    // Why: the old Mobile accessory bar preserves this order in its default
    // AsyncStorage value. Keep the same order so a native upgrade does not
    // move controls or silently hide keys users already rely on.
    static let standardOrder = allCases
    static let legacyStandardOrder = allCases
    static let standardVisibleKeys = Set(allCases)
    static let standardVisibleOrder = standardOrder.filter(standardVisibleKeys.contains)

    var id: Self { self }

    var title: LocalizedStringResource {
        switch self {
        case .escape:
            "Esc"
        case .tab:
            "Tab"
        case .enter:
            "Enter"
        case .shiftTab:
            "Shift+Tab"
        case .space:
            "Space"
        case .backspace:
            "⌫"
        case .delete:
            "Del"
        case .arrowUp:
            "↑"
        case .arrowDown:
            "↓"
        case .arrowLeft:
            "←"
        case .arrowRight:
            "→"
        case .interrupt:
            "Ctrl+C"
        case .endOfFile:
            "Ctrl+D"
        case .clearScreen:
            "Ctrl+L"
        case .suspend:
            "Ctrl+Z"
        case .reverseSearch:
            "Ctrl+R"
        case .startOfLine:
            "Ctrl+A"
        case .endOfLine:
            "Ctrl+E"
        case .deleteWordBackward:
            "Ctrl+W"
        case .clearLineBeforeCursor:
            "Ctrl+U"
        }
    }

    var accessibilityLabel: LocalizedStringResource {
        switch self {
        case .escape:
            "Escape"
        case .tab:
            "Tab"
        case .enter:
            "Enter"
        case .shiftTab:
            "Shift Tab"
        case .space:
            "Space"
        case .backspace:
            "Backspace"
        case .delete:
            "Forward delete"
        case .arrowUp:
            "Arrow up"
        case .arrowDown:
            "Arrow down"
        case .arrowLeft:
            "Arrow left"
        case .arrowRight:
            "Arrow right"
        case .interrupt:
            "Interrupt process"
        case .endOfFile:
            "Send end of file"
        case .clearScreen:
            "Clear screen"
        case .suspend:
            "Suspend process"
        case .reverseSearch:
            "Reverse search"
        case .startOfLine:
            "Start of line"
        case .endOfLine:
            "End of line"
        case .deleteWordBackward:
            "Delete word backward"
        case .clearLineBeforeCursor:
            "Clear line before cursor"
        }
    }

    var controlChordSuffix: String? {
        switch self {
        case .interrupt:
            "C"
        case .endOfFile:
            "D"
        case .clearScreen:
            "L"
        case .suspend:
            "Z"
        case .reverseSearch:
            "R"
        case .startOfLine:
            "A"
        case .endOfLine:
            "E"
        case .deleteWordBackward:
            "W"
        case .clearLineBeforeCursor:
            "U"
        case .escape, .tab, .enter, .shiftTab, .space, .backspace, .delete, .arrowUp,
            .arrowDown, .arrowLeft, .arrowRight:
            nil
        }
    }

    var isCircular: Bool {
        // Why: only repeatable directional keys and backspace get 40pt circular cells; glyph
        // keys such as Tab, Enter, Space, and Delete need the wider capsule to hold a word.
        switch self {
        case .backspace, .arrowLeft, .arrowDown, .arrowUp, .arrowRight:
            true
        case .escape, .tab, .enter, .shiftTab, .space, .delete, .interrupt, .endOfFile,
            .clearScreen, .suspend, .reverseSearch, .startOfLine, .endOfLine,
            .deleteWordBackward, .clearLineBeforeCursor:
            false
        }
    }

    var isGlyph: Bool {
        switch self {
        case .tab, .enter, .shiftTab, .space, .backspace, .delete, .arrowLeft, .arrowDown,
            .arrowUp, .arrowRight:
            true
        case .escape, .interrupt, .endOfFile, .clearScreen, .suspend, .reverseSearch,
            .startOfLine, .endOfLine, .deleteWordBackward, .clearLineBeforeCursor:
            false
        }
    }

    var repeatsWhilePressed: Bool {
        switch self {
        case .arrowLeft, .arrowDown, .arrowUp, .arrowRight, .backspace, .delete:
            true
        case .escape, .tab, .enter, .shiftTab, .space, .interrupt, .endOfFile, .clearScreen,
            .suspend, .reverseSearch, .startOfLine, .endOfLine, .deleteWordBackward,
            .clearLineBeforeCursor:
            false
        }
    }
}
