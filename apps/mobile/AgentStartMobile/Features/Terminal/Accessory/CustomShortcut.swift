import Foundation

nonisolated struct TerminalCustomKey: Codable, Equatable, Identifiable, Sendable {
    let id: String
    let label: String
    let bytes: String
    let enter: Bool
}

nonisolated enum TerminalShortcutModifier: String, CaseIterable, Identifiable, Sendable {
    case control
    case option
    case shift

    var id: Self { self }
}

nonisolated enum TerminalCustomKeyBuilder {
    static let specialKeys = [
        "escape", "tab", "enter", "backspace", "delete", "insert", "arrowUp",
        "arrowDown", "arrowLeft", "arrowRight", "home", "end", "pageUp", "pageDown",
        "space", "f1", "f2", "f3", "f4", "f5", "f6", "f7", "f8", "f9", "f10",
        "f11", "f12",
    ]

    static func shortcut(
        key rawKey: String,
        modifiers: Set<TerminalShortcutModifier>
    ) -> TerminalCustomKey? {
        let key = normalizedKey(rawKey)
        guard let bytes = shortcutBytes(key: key, modifiers: modifiers) else { return nil }
        let modifierLabels = TerminalShortcutModifier.allCases.compactMap { modifier in
            modifiers.contains(modifier) ? label(modifier) : nil
        }
        let keyLabel = specialLabel(key) ?? key.uppercased()
        return TerminalCustomKey(
            id: "custom-\(UUID().uuidString.lowercased())",
            label: (modifierLabels + [keyLabel]).joined(separator: "+"),
            bytes: bytes,
            enter: false
        )
    }

    static func macro(label: String, text: String, pressesEnter: Bool) -> TerminalCustomKey? {
        let value = text
        let display = label.trimmingCharacters(in: .whitespacesAndNewlines)
        guard !value.isEmpty else { return nil }
        let fallback = String(value.trimmingCharacters(in: .whitespacesAndNewlines).prefix(12))
        guard !display.isEmpty || !fallback.isEmpty else { return nil }
        return TerminalCustomKey(
            id: "custom-\(UUID().uuidString.lowercased())",
            label: display.isEmpty ? fallback : display,
            bytes: pressesEnter ? "\(value)\r" : value,
            enter: false
        )
    }

    static func displayBytes(_ key: TerminalCustomKey) -> String {
        key.bytes.replacingOccurrences(of: "\r", with: " ↵") + (key.enter ? " ↵" : "")
    }

    static func displayLabel(for key: String) -> String {
        specialLabel(key) ?? key.uppercased()
    }

    static func accessibilityLabel(for key: String) -> String {
        [
            "escape": "Escape", "tab": "Tab", "enter": "Enter",
            "backspace": "Backspace", "delete": "Forward delete", "insert": "Insert",
            "arrowUp": "Arrow up", "arrowDown": "Arrow down", "arrowLeft": "Arrow left",
            "arrowRight": "Arrow right", "home": "Home", "end": "End",
            "pageUp": "Page up", "pageDown": "Page down", "space": "Space",
        ][key] ?? displayLabel(for: key)
    }

    private static func shortcutBytes(
        key: String,
        modifiers: Set<TerminalShortcutModifier>
    ) -> String? {
        let parameter =
            1 + (modifiers.contains(.shift) ? 1 : 0)
            + (modifiers.contains(.option) ? 2 : 0)
            + (modifiers.contains(.control) ? 4 : 0)
        let base: String?
        if let final = [
            "arrowUp": "A", "arrowDown": "B", "arrowRight": "C", "arrowLeft": "D",
            "home": "H", "end": "F", "f1": "P", "f2": "Q", "f3": "R", "f4": "S",
        ][key] {
            base =
                parameter == 1 && key.hasPrefix("f")
                ? "\u{1B}O\(final)"
                : parameter == 1 ? "\u{1B}[\(final)" : "\u{1B}[1;\(parameter)\(final)"
        } else if let code = [
            "insert": 2, "delete": 3, "pageUp": 5, "pageDown": 6, "f5": 15, "f6": 17,
            "f7": 18, "f8": 19, "f9": 20, "f10": 21, "f11": 23, "f12": 24,
        ][key] {
            base = parameter == 1 ? "\u{1B}[\(code)~" : "\u{1B}[\(code);\(parameter)~"
        } else {
            base = printableBytes(key: key, modifiers: modifiers)
        }
        guard let base else { return nil }
        return modifiers.contains(.option) && !base.hasPrefix("\u{1B}") ? "\u{1B}\(base)" : base
    }

    private static func printableBytes(
        key: String,
        modifiers: Set<TerminalShortcutModifier>
    ) -> String? {
        if key == "tab" {
            if modifiers == [.shift] { return "\u{1B}[Z" }
            return modifiers.contains(.option) ? "\u{1B}\t" : "\t"
        }
        if key == "escape" {
            return modifiers.contains(.option) ? "\u{1B}\u{1B}" : "\u{1B}"
        }
        if key == "enter" {
            return modifiers.contains(.option) ? "\u{1B}\r" : "\r"
        }
        if key == "backspace" {
            let value = modifiers.contains(.control) ? "\u{08}" : "\u{7F}"
            return modifiers.contains(.option) ? "\u{1B}\(value)" : value
        }

        let literals = ["space": " "]
        var value = literals[key] ?? String(key.prefix(1))
        guard !value.isEmpty else { return nil }
        if modifiers.contains(.shift) { value = shifted(value) }
        if modifiers.contains(.control) {
            guard let control = controlBytes(value) else { return nil }
            value = control
        }
        return value
    }

    private static func controlBytes(_ value: String) -> String? {
        let mapped = [
            " ": "\u{00}", "@": "\u{00}", "`": "\u{00}", "[": "\u{1B}",
            "{": "\u{1B}", "\\": "\u{1C}", "|": "\u{1C}", "]": "\u{1D}",
            "}": "\u{1D}", "^": "\u{1E}", "~": "\u{1E}", "_": "\u{1F}",
            "?": "\u{7F}",
        ]
        if let mapped = mapped[value] { return mapped }
        guard let scalar = value.lowercased().unicodeScalars.first,
            scalar.value >= 97, scalar.value <= 122,
            let control = UnicodeScalar(scalar.value - 96)
        else { return nil }
        return String(control)
    }

    private static func normalizedKey(_ raw: String) -> String {
        let trimmed = raw.trimmingCharacters(in: .whitespacesAndNewlines)
        if specialKeys.contains(trimmed) { return trimmed }
        return String(trimmed.prefix(1)).lowercased()
    }

    private static func label(_ modifier: TerminalShortcutModifier) -> String {
        switch modifier {
        case .control: "Ctrl"
        case .option: "Alt"
        case .shift: "Shift"
        }
    }

    private static func specialLabel(_ key: String) -> String? {
        [
            "escape": "Esc", "tab": "Tab", "enter": "Enter", "backspace": "⌫",
            "delete": "Del", "insert": "Ins", "arrowUp": "↑", "arrowDown": "↓",
            "arrowLeft": "←", "arrowRight": "→", "home": "Home", "end": "End",
            "pageUp": "PgUp", "pageDown": "PgDn", "space": "Space",
        ][key] ?? (key.hasPrefix("f") ? key.uppercased() : nil)
    }

    private static func shifted(_ value: String) -> String {
        let replacements: [Character: Character] = [
            "`": "~", "1": "!", "2": "@", "3": "#", "4": "$", "5": "%", "6": "^",
            "7": "&", "8": "*", "9": "(", "0": ")", "-": "_", "=": "+", "[": "{",
            "]": "}", "\\": "|", ";": ":", "'": "\"", ",": "<", ".": ">", "/": "?",
        ]
        guard let first = value.first else { return value }
        return replacements[first].map(String.init) ?? value.uppercased()
    }
}
