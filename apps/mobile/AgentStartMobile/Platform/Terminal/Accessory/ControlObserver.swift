import SwiftTerm
import UIKit

@MainActor
final class TerminalControlModifierObserver: NSObject {
    private let state: TerminalAccessoryState

    init(state: TerminalAccessoryState, terminalView: TerminalView) {
        self.state = state
        super.init()
        NotificationCenter.default.addObserver(
            self,
            selector: #selector(controlModifierDidReset),
            name: .terminalViewControlModifierReset,
            object: terminalView
        )
    }

    deinit {
        NotificationCenter.default.removeObserver(self)
    }

    @objc
    private func controlModifierDidReset() {
        state.controlModifierDidReset()
    }
}
