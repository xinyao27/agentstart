import Foundation
import Observation

@Observable
@MainActor
final class TerminalAccessoryState {
    private(set) var isEnabled = false
    private(set) var isControlActive = false
    private(set) var keys: [TerminalAccessoryKey]
    private(set) var customKeys: [TerminalCustomKey]

    @ObservationIgnored
    private let onSend: (TerminalAccessoryKey) -> Void
    @ObservationIgnored
    private let onSendCustom: (TerminalCustomKey) -> Void
    @ObservationIgnored
    private let onControlChange: (Bool) -> Void
    @ObservationIgnored
    private let onPaste: () -> Void

    init(
        keys: [TerminalAccessoryKey],
        customKeys: [TerminalCustomKey],
        onSend: @escaping (TerminalAccessoryKey) -> Void,
        onSendCustom: @escaping (TerminalCustomKey) -> Void,
        onControlChange: @escaping (Bool) -> Void,
        onPaste: @escaping () -> Void
    ) {
        self.keys = keys
        self.customKeys = customKeys
        self.onSend = onSend
        self.onSendCustom = onSendCustom
        self.onControlChange = onControlChange
        self.onPaste = onPaste
    }

    func setKeys(_ keys: [TerminalAccessoryKey], customKeys: [TerminalCustomKey]) {
        self.keys = keys
        self.customKeys = customKeys
    }

    func setEnabled(_ isEnabled: Bool) {
        self.isEnabled = isEnabled
        guard !isEnabled, isControlActive else { return }
        isControlActive = false
        onControlChange(false)
    }

    func send(_ key: TerminalAccessoryKey) {
        guard isEnabled else { return }
        onSend(key)
    }

    func send(_ key: TerminalCustomKey) {
        guard isEnabled else { return }
        onSendCustom(key)
    }

    func toggleControl() {
        guard isEnabled else { return }
        isControlActive.toggle()
        onControlChange(isControlActive)
    }

    func paste() {
        guard isEnabled else { return }
        onPaste()
    }

    func controlModifierDidReset() {
        isControlActive = false
    }
}
